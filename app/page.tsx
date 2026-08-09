import Link from "next/link";
import { getAnalysis, LEAGUE, fmt, signed } from "@/lib/data";
import { Panel, Stat, SeqStrip, PosChip, Note, Th, Td, Diverging } from "@/components/ui";
import type { Analysis, Pos } from "@/lib/types";

export default function Playbook() {
  const A = getAnalysis();
  const champs = A.profiles.filter((p) => p.is_champion);
  const rel = A.meta.reliability ?? {};

  // Value curve by round, from the model the optimizer reasons over.
  const curve: NonNullable<Analysis["shrunk_curve"]> = A.shrunk_curve ?? {};
  const rounds = Object.keys(curve)
    .map(Number)
    .sort((a, b) => a - b);

  // Where each position is the best remaining use of a pick.
  const bestPosByRound = rounds.map((rd) => {
    const row = curve[rd];
    const entries = (["QB", "RB", "WR", "TE"] as Pos[])
      .map((p) => ({ pos: p, v: row?.[p]?.shrunk ?? null }))
      .filter((e) => e.v !== null) as { pos: Pos; v: number }[];
    entries.sort((a, b) => b.v - a.v);
    return { round: rd, ranked: entries };
  });

  const slotBests = Object.values(A.optimal_by_slot).map((o) => o.best.mean);
  const slotSpread = Math.max(...slotBests) - Math.min(...slotBests);

  const qbEarly = A.profiles.filter((p) => p.qb_round <= 4);
  const qbMid = A.profiles.filter((p) => p.qb_round >= 5 && p.qb_round <= 8);
  const rate = (g: typeof A.profiles) =>
    g.length ? (g.filter((x) => x.made_playoffs).length / g.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[28px] font-bold uppercase tracking-tight" style={{ color: "var(--color-bears)" }}>The 2026 Draft Playbook</h1>
        <p className="mt-2 max-w-[820px] text-[14px] leading-relaxed text-muted">
          Every pick from the {LEAGUE.name}&rsquo;s {A.meta.seasons.join(", ")} drafts, rescored
          under this league&rsquo;s actual rules ({LEAGUE.scoring}) and joined to what the team
          that made it went on to do. {A.meta.n_picks} picks, {A.meta.n_team_seasons}{" "}
          team-seasons, three champions.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="The flex is a WR slot"
          value="3.3 WR"
          sub="started per team per week, vs 2.6 RB. Both flex spots skew receiver — that sets the replacement bar."
        />
        <Stat
          label="Early QB cost the playoffs"
          value={`${rate(qbEarly).toFixed(0)}% vs ${rate(qbMid).toFixed(0)}%`}
          tone="bad"
          sub={`Playoff rate: QB in rounds 1-4 (n=${qbEarly.length}) vs rounds 5-8 (n=${qbMid.length}).`}
        />
        <Stat
          label="Drafting explains winning"
          value={`r = +${A.correlations.find((c) => c.var === "top5_vorp")?.pts_for.r.toFixed(2) ?? "—"}`}
          tone="good"
          sub="Value of your top five picks vs season points for — the strongest relationship in the data (p<0.001)."
        />
        <Stat
          label="The round-9 RB cliff"
          value="18% → 83%"
          tone="bad"
          sub="Running back bust rate from round 8 to round 9. It never recovers: 71–100% every round after."
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title="The five rules"
        subtitle="Everything below is derived from the league's own history. Where the evidence is thin, it says so."
      >
        <ol className="space-y-4">
          <Rule
            n={1}
            head="Never spend a top-four pick on a quarterback."
            strength="strong"
          >
            Quarterback is the only position that is <em>never</em> the best use of a pick in any
            round: at every single pick number, a running back, receiver or tight end taken there
            has returned more. Teams that took a QB in rounds 1&ndash;4 made the playoffs{" "}
            {rate(qbEarly).toFixed(0)}% of the time (n={qbEarly.length}); teams that waited until
            rounds 5&ndash;8 made it {rate(qbMid).toFixed(0)}% (n={qbMid.length}). The trend across
            cohorts is perfectly ordered — the bottom four teams took their QB earliest of anyone
            (round {fmt(A.cohorts.bottom4?.qb_round ?? 0, 1)}), playoff teams latest (round{" "}
            {fmt(A.cohorts.playoff?.qb_round ?? 0, 1)}). The mechanism is opportunity cost, not
            quarterback play: the 12th-best QB still scored about{" "}
            {fmt(A.meta.replacement_points?.["2025"]?.QB ?? 257)} points, so a drafted QB beats a
            streamed one by less than at any other position, while the receiver you passed on is
            not replaceable. The cleanest illustration: all three teams that spent a round-2 pick
            on a quarterback missed the playoffs &mdash; and two of them got Josh Allen, who
            returned +82 and +109 against replacement. Elite production at the position still did
            not pay for the pick.
          </Rule>
          <Rule
            n={2}
            head="In rounds 1-4, take the best player. The RB-vs-WR question is not answerable."
            strength="strong"
          >
            The model retains a mild running-back lean early, but it is not trustworthy. The same
            gap measures +18.5 points under one definition of replacement level and &minus;2.0 under
            another equally defensible one &mdash; a swing far larger than the lean itself. It also
            fails a permutation test (p=0.16), reverses sign in 2023, and shows nothing at team
            level (RBs drafted in rounds 1&ndash;4 vs points for: r={"≈"}0). Four independent
            checks, no signal. The two views of the same round even disagree with each other: the
            raw round-1 picks favour receivers (+84 against +70), while the smoothed model favours
            running backs. That disagreement is what &ldquo;no signal&rdquo; looks like. Do not let
            a positional rule talk you off the better player.
          </Rule>
          <Rule
            n={3}
            head="From round 5 on, tight end preserves the most value of any position."
            strength="strong"
          >
            Past round 4 every position is below replacement in expectation &mdash; you are drafting
            depth, not starters. The question is which pick bleeds least, and from round 5 onward it
            is always TE. At round 7 a tight end is {signed(curve[7]?.TE?.shrunk ?? 0)} against
            replacement where a running back at the same pick is {signed(curve[7]?.RB?.shrunk ?? 0)}
            . TE also has the highest replication score of any position ({fmt(rel.TE ?? 0, 2)}). The
            catch: TE is also the most streamable position in-season &mdash; 29% of all tight end
            starts here came from players nobody drafted &mdash; so this is an argument for taking
            your TE late, never for reaching on one early.
          </Rule>
          <Rule
            n={4}
            head="Stop drafting running backs after round 8."
            strength="strong"
          >
            Running back bust rate goes from 18% in round 8 to <strong className="text-chalk">83%
            in round 9</strong> and never recovers &mdash; 71% to 100% in every round after. By
            round 11 RB is outright the worst position on the board. This is the sharpest single
            discontinuity in the data. Those late picks belong on receivers and tight ends, which
            decay far more slowly.
          </Rule>
          <Rule
            n={5}
            head="Your edge is hit rate, not shape."
            strength="strong"
          >
            The five strongest relationships with scoring are all measures of picking well &mdash;
            the value of your top five picks (r=+
            {A.correlations.find((c) => c.var === "top5_vorp")?.pts_for.r.toFixed(2)}), your hit
            rate over the first six, elite hits landed, busts avoided. Positional counts sit near
            zero. Meanwhile the best and worst draft slots differ by{" "}
            {fmt(slotSpread)} points of expected value across an entire draft &mdash; the
            third-round reversal flattens the board almost completely &mdash; and shifting your
            whole build from balanced to RB-heavy moves it about 15. Structure is worth well under
            a point a week; being right about players is worth many times that.
          </Rule>
        </ol>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          title="What a pick is worth, by round and position"
          subtitle="Expected points above replacement for a player taken at the middle of each round. Shrunk toward the cross-position average in proportion to how well that position's edge repeats from season to season."
        >
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Round</Th>
                  <Th align="right">QB</Th>
                  <Th align="right">RB</Th>
                  <Th align="right">WR</Th>
                  <Th align="right">TE</Th>
                  <Th>Best use of the pick</Th>
                </tr>
              </thead>
              <tbody>
                {bestPosByRound.slice(0, 14).map(({ round, ranked }) => {
                  const row = curve[round];
                  const top = ranked[0];
                  const second = ranked[1];
                  const clear = second && top.v - second.v > 6;
                  return (
                    <tr key={round} className="border-b border-line/50 last:border-0">
                      <Td className="text-muted tabular-nums">R{round}</Td>
                      {(["QB", "RB", "WR", "TE"] as Pos[]).map((p) => {
                        const v = row?.[p]?.shrunk;
                        const isTop = top?.pos === p;
                        return (
                          <Td
                            key={p}
                            align="right"
                            className={`tabular-nums ${isTop ? "font-semibold text-chalk" : "text-muted"}`}
                          >
                            {v === null || v === undefined ? "—" : signed(v)}
                          </Td>
                        );
                      })}
                      <Td>
                        <span className="flex items-center gap-1.5">
                          <PosChip pos={top.pos} size="sm" />
                          {!clear && (
                            <span className="text-[11px] text-muted">
                              ≈ {second?.pos} (too close to call)
                            </span>
                          )}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Note>
            Read down a column to see how fast a position decays. QB falls off a cliff after round 3
            and never recovers. RB and WR track each other until round 4, then WR pulls ahead and
            stays ahead. TE decays slowest of all.
          </Note>
        </Panel>

        <div className="min-w-0 space-y-6">
          <Panel
            title="The three champions"
            subtitle="Small sample, so treat these as illustrations of the rules above rather than a template."
          >
            <div className="space-y-4">
              {champs.map((c) => (
                <div key={`${c.season}-${c.roster_id}`}>
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    <span className="font-semibold">{c.season}</span>
                    <span className="text-muted">{c.owner}</span>
                    <span className="text-[11.5px] text-muted">
                      slot {c.slot} · {c.wins}-{c.losses} · {fmt(c.pts_for, 1)} pts · QB in round{" "}
                      {c.qb_round}
                    </span>
                  </div>
                  <SeqStrip seq={c.seq8.split("-")} max={8} />
                </div>
              ))}
            </div>
            <Note>
              All three waited on quarterback relative to the field, and none spent a top-4 pick on
              a tight end. Beyond that they share little: 2023 went receiver-heavy, 2025 went
              running-back-heavy. Shape did not decide it.
            </Note>
          </Panel>

          <Panel
            title="What actually correlates with winning"
            subtitle={`Pearson r across all ${A.meta.n_team_seasons} team-seasons, with permutation p-values.`}
          >
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Draft characteristic</Th>
                    <Th align="right">r</Th>
                    <Th align="right">p</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {A.correlations.slice(0, 9).map((c) => (
                    <tr key={c.var} className="border-b border-line/50 last:border-0">
                      <Td className="max-w-[230px] truncate" title={c.label}>
                        {c.label}
                      </Td>
                      <Td
                        align="right"
                        className={`tabular-nums ${
                          c.pts_for.p < 0.05 ? "font-semibold text-chalk" : "text-muted"
                        }`}
                      >
                        {c.pts_for.r >= 0 ? "+" : "−"}
                        {Math.abs(c.pts_for.r).toFixed(2)}
                      </Td>
                      <Td
                        align="right"
                        className={`tabular-nums ${
                          c.pts_for.p < 0.05 ? "text-good" : "text-muted"
                        }`}
                      >
                        {c.pts_for.p < 0.001 ? "<.001" : c.pts_for.p.toFixed(3)}
                      </Td>
                      <Td>
                        <Diverging value={c.pts_for.r} max={0.7} width={70} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>
              The top rows are all measures of <em>hitting on picks</em>, not of drafting a
              particular shape. Positional counts sit near zero. That is the finding.
            </Note>
          </Panel>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title="Your 2026 draft"
        subtitle="The 2026 draft has not been ordered yet, so the plan is shown for every slot. Once Sleeper assigns a slot, the Live Draft page tracks it in real time."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/slots"
            className="rounded border border-line bg-panel-2 px-4 py-3 text-[13px] transition-colors hover:border-muted"
          >
            <div className="font-semibold">Slot-by-slot plans →</div>
            <div className="mt-0.5 text-[12px] text-muted">
              Optimal sequence and its confidence band for all 12 slots
            </div>
          </Link>
          <Link
            href="/live"
            className="rounded border border-line bg-panel-2 px-4 py-3 text-[13px] transition-colors hover:border-muted"
          >
            <div className="font-semibold">Live draft assistant →</div>
            <div className="mt-0.5 text-[12px] text-muted">
              Reads the 2026 Sleeper draft as it happens
            </div>
          </Link>
          <Link
            href="/method"
            className="rounded border border-line bg-panel-2 px-4 py-3 text-[13px] transition-colors hover:border-muted"
          >
            <div className="font-semibold">How this was built →</div>
            <div className="mt-0.5 text-[12px] text-muted">
              Model, calibration, and what the data cannot support
            </div>
          </Link>
        </div>
      </Panel>
    </div>
  );
}

function Rule({
  n,
  head,
  children,
  strength,
}: {
  n: number;
  head: string;
  children: React.ReactNode;
  strength: "strong" | "moderate" | "weak";
}) {
  const tone =
    strength === "strong"
      ? { c: "var(--color-good)", t: "well supported" }
      : strength === "moderate"
        ? { c: "var(--color-warn)", t: "suggestive" }
        : { c: "var(--color-bad)", t: "thin evidence" };
  return (
    <li className="flex gap-3.5">
      <span className="display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold" style={{ borderColor: "var(--color-bears)", color: "var(--color-bears-bright)" }}>
        {n}
      </span>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-[14.5px] font-semibold leading-snug text-chalk">{head}</h3>
          <span
            className="rounded px-1.5 py-[1px] text-[10px] uppercase tracking-wide"
            style={{ color: tone.c, background: `color-mix(in srgb, ${tone.c} 14%, transparent)` }}
          >
            {tone.t}
          </span>
        </div>
        <p className="mt-1.5 max-w-[900px] text-[13px] leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}
