import { getAnalysis, fmt, signed } from "@/lib/data";
import { Panel, Note, Th, Td, PosChip, Stat } from "@/components/ui";

export const metadata = { title: "Teams — Bud Iceman" };

const COHORT_ROWS: { key: string; label: string }[] = [
  { key: "champions", label: "Champions" },
  { key: "finalists", label: "Finalists" },
  { key: "top4", label: "Top 4" },
  { key: "playoff", label: "Made playoffs" },
  { key: "missed", label: "Missed playoffs" },
  { key: "bottom4", label: "Bottom 4" },
  { key: "all", label: "All teams" },
];

const COHORT_FIELDS: { key: string; label: string; digits?: number }[] = [
  { key: "hit_rate_top6", label: "Hit rate, first 6", digits: 2 },
  { key: "elite_hits", label: "Elite hits", digits: 2 },
  { key: "early_busts", label: "Busts in R1-6", digits: 2 },
  { key: "top5_vorp", label: "VORP, top 5 picks" },
  { key: "draft_starter_pts", label: "Pts from draftees" },
  { key: "qb_round", label: "First QB (round)", digits: 1 },
  { key: "te_round", label: "First TE (round)", digits: 1 },
  { key: "rb4", label: "RB in R1-4", digits: 2 },
  { key: "wr4", label: "WR in R1-4", digits: 2 },
];

export default function Teams() {
  const A = getAnalysis();
  const profiles = [...A.profiles].sort(
    (a, b) =>
      a.season.localeCompare(b.season) ||
      (a.final_place ?? 99) - (b.final_place ?? 99) ||
      a.seed - b.seed,
  );
  const me = A.profiles.filter((p) => p.owner === "dirkwbeveridge");

  const playoff = A.cohorts.playoff ?? {};
  const missed = A.cohorts.missed ?? {};

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[28px] font-bold uppercase tracking-tight" style={{ color: "var(--color-bears)" }}>Teams and cohorts</h1>
        <p className="mt-2 max-w-[880px] text-[14px] leading-relaxed text-muted">
          What separated the teams that made the playoffs from the ones that did not. With three
          champions the top row is anecdote; the playoff-vs-missed comparison, at 18 teams a side,
          is where the signal is.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Hit rate, first six picks"
          value={`${((playoff.hit_rate_top6 ?? 0) * 100).toFixed(0)}% vs ${((missed.hit_rate_top6 ?? 0) * 100).toFixed(0)}%`}
          tone="good"
          sub="Playoff teams vs teams that missed. The single cleanest separator in the data."
        />
        <Stat
          label="Elite hits (VORP ≥ 100)"
          value={`${fmt(playoff.elite_hits ?? 0, 2)} vs ${fmt(missed.elite_hits ?? 0, 2)}`}
          tone="good"
          sub="Playoff teams landed roughly three times as many league-winning players."
        />
        <Stat
          label="Busts in rounds 1-6"
          value={`${fmt(playoff.early_busts ?? 0, 2)} vs ${fmt(missed.early_busts ?? 0, 2)}`}
          tone="bad"
          sub="Teams that missed carried noticeably more dead weight from their premium picks."
        />
        <Stat
          label="First QB taken"
          value={`R${fmt(playoff.qb_round ?? 0, 1)} vs R${fmt(missed.qb_round ?? 0, 1)}`}
          sub="Playoff teams waited longer at quarterback than teams that missed."
        />
      </section>

      <Panel
        title="Cohort comparison"
        subtitle="Averages within each group. Read across a row to see how a trait tracks with success."
      >
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Cohort</Th>
                <Th align="right">n</Th>
                {COHORT_FIELDS.map((f) => (
                  <Th key={f.key} align="right">
                    {f.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COHORT_ROWS.map(({ key, label }) => {
                const c = A.cohorts[key];
                if (!c) return null;
                const emphasize = key === "playoff" || key === "missed";
                return (
                  <tr
                    key={key}
                    className={`border-b border-line/40 last:border-0 ${emphasize ? "bg-panel-2/40" : ""}`}
                  >
                    <Td className={emphasize ? "font-semibold" : ""}>{label}</Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {c.n}
                    </Td>
                    {COHORT_FIELDS.map((f) => (
                      <Td key={f.key} align="right" className="tabular-nums">
                        {c[f.key] === undefined ? "—" : fmt(c[f.key], f.digits ?? 0)}
                      </Td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note>
          Every trait that separates the cohorts is a measure of <em>picking well</em> — hit rate,
          elite hits, busts avoided, total value drafted. The shape traits (RB and WR counts) barely
          move between the top and bottom of the league. That is the central finding of this study,
          and it holds at every cut.
        </Note>
      </Panel>

      {me.length > 0 && (
        <Panel
          title="Your three drafts"
          subtitle="dirkwbeveridge — 3rd, 7th, 6th."
        >
          <div className="space-y-3">
            {me.map((p) => (
              <div
                key={`${p.season}-${p.roster_id}`}
                className="rounded border border-line bg-panel-2 px-3.5 py-3"
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 text-[13px]">
                  <span className="font-semibold">{p.season}</span>
                  <span className="text-muted">
                    slot {p.slot} · {p.wins}-{p.losses} · {fmt(p.pts_for, 1)} pts ·{" "}
                    {p.final_place ? `finished ${p.final_place}` : "missed playoffs"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.seq8.split("-").map((pos, i) => (
                    <PosChip key={i} pos={pos} size="sm" />
                  ))}
                  <span className="ml-2 text-[11.5px] text-muted">
                    R1-8 · full draft: {p.qb_total}QB {p.rb_total}RB {p.wr_total}WR {p.te_total}TE ·
                    first QB round {p.qb_round}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Note>
            Across three seasons you drafted {fmt(me.reduce((a, b) => a + b.rb_total, 0) / me.length, 1)}{" "}
            running backs and{" "}
            {fmt(me.reduce((a, b) => a + b.wr_total, 0) / me.length, 1)} receivers per draft, against
            a league average of {fmt(A.cohorts.all?.rb_total ?? 0, 1)} and{" "}
            {fmt(A.cohorts.all?.wr_total ?? 0, 1)}. In a league that starts 3.3 receivers a week,
            that is the tilt worth correcting — not because running backs are bad, but because your
            receiver room has had to be filled from the wire.
          </Note>
        </Panel>
      )}

      <Panel title="Every team-season" subtitle="Sorted by season, then finish.">
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Season</Th>
                <Th align="right">Finish</Th>
                <Th align="right">Slot</Th>
                <Th>Manager</Th>
                <Th align="right">Record</Th>
                <Th align="right">Points</Th>
                <Th>First 8 rounds</Th>
                <Th align="right">QB rd</Th>
                <Th align="right">Hit rate</Th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr
                  key={`${p.season}-${p.roster_id}`}
                  className={`border-b border-line/40 last:border-0 ${
                    p.is_champion ? "bg-good/5" : ""
                  }`}
                >
                  <Td className="text-muted tabular-nums">{p.season}</Td>
                  <Td align="right" className="tabular-nums">
                    {p.final_place ? (p.is_champion ? `1 🏆` : p.final_place) : "—"}
                  </Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {p.slot}
                  </Td>
                  <Td className="max-w-[140px] truncate" title={p.owner}>
                    {p.owner}
                  </Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {p.wins}-{p.losses}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {fmt(p.pts_for, 1)}
                  </Td>
                  <Td>
                    <span className="flex gap-0.5">
                      {p.seq8.split("-").map((pos, i) => (
                        <PosChip key={i} pos={pos} size="sm" />
                      ))}
                    </span>
                  </Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {p.qb_round}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {(p.hit_rate_top6 * 100).toFixed(0)}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
