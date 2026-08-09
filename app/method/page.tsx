import { getAnalysis, fmt } from "@/lib/data";
import { Panel, Note, Th, Td } from "@/components/ui";

export const metadata = { title: "Method — Bud Iceman" };

export default function Method() {
  const A = getAnalysis();
  const cal = A.meta.calibration as
    | { r: number; p: number; floor: Record<string, number>; bench_weight: number; grid_spread: number }
    | undefined;
  const rel = A.meta.reliability ?? {};

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[28px] font-bold uppercase tracking-tight" style={{ color: "var(--color-bears)" }}>How this was built</h1>
        <p className="mt-2 max-w-[880px] text-[14px] leading-relaxed text-muted">
          Three seasons is a small sample and this page does not pretend otherwise. What follows is
          what was measured, what was assumed, where the assumptions were tested, and which
          conclusions the data will not carry.
        </p>
      </header>

      <Panel title="The data">
        <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
          <li>
            <strong className="text-chalk">Source.</strong> Sleeper&rsquo;s public API: league
            settings, rosters, users, drafts, picks, weekly matchups, playoff brackets,
            transactions, and raw weekly player stats for {A.meta.seasons.join(", ")}.
          </li>
          <li>
            <strong className="text-chalk">Scoring.</strong> Every fantasy point was recomputed from
            raw stat lines using this league&rsquo;s own scoring settings, rather than taken from a
            generic points column. The recomputation reproduces Sleeper&rsquo;s own numbers on{" "}
            <strong className="text-chalk">2,368 of 2,368</strong> rostered player-weeks. That
            matters because it lets us score players nobody drafted — the counterfactual the whole
            study depends on.
          </li>
          <li>
            <strong className="text-chalk">Scope.</strong> {A.meta.n_picks} picks across{" "}
            {A.meta.n_team_seasons} team-seasons, weeks 1&ndash;14 for regular-season value.
          </li>
        </ul>
      </Panel>

      <Panel
        title="Replacement level, and why it nearly broke the analysis"
        subtitle="The most consequential choice in the whole model."
      >
        <p className="max-w-[900px] text-[13px] leading-relaxed text-muted">
          Value above replacement needs a definition of replacement, and there are two defensible
          ones. The conventional choice is the last player the league is forced to start — here
          RB31 and WR40, because this league starts 2.6 running backs and 3.3 receivers a week. The
          other is what teams actually got from the waiver wire, measured directly from every player
          who was started but never drafted.
        </p>
        <p className="mt-3 max-w-[900px] text-[13px] leading-relaxed text-muted">
          They disagree sharply — the waiver bar sits about 39 points higher at running back and 19
          at receiver. Under the first definition, running backs look like they beat receivers by
          +18.5 points in rounds 1&ndash;4. Under the second, they lose by 2.0. Predictive power
          against actual team scoring is flat across the whole range (r .769 to .741), so the data
          cannot choose. An &ldquo;edge&rdquo; that exists only under one arbitrary convention is
          not an edge, so the model sits at the midpoint and the early-round RB-vs-WR question is
          reported as unresolved rather than resolved in either direction.
        </p>
        <Note>
          This is the single reason this study does not tell you to draft running backs early. An
          earlier version of the model did, confidently, and it was measuring its own baseline.
        </Note>
      </Panel>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          title="The objective, and its calibration"
          subtitle="What the optimizer maximises, and how we know it is the right thing to maximise."
        >
          <p className="text-[13px] leading-relaxed text-muted">
            A roster is worth the lineup it can field: one QB, two RB, two WR, one TE, plus the best
            two remaining for the flex, with a discount for bench depth. Three free parameters were
            fitted against what the 36 real teams actually scored.
          </p>
          <div className="scroll-x mt-3">
            <table className="w-full border-collapse">
            <tbody>
              <tr className="border-b border-line/40">
                <Td className="text-muted">Objective vs actual points for</Td>
                <Td align="right" className="font-semibold tabular-nums text-good">
                  r = +{A.meta.objective_validation.r.toFixed(3)}
                </Td>
              </tr>
              <tr className="border-b border-line/40">
                <Td className="text-muted">Bust floor (QB / RB / WR / TE)</Td>
                <Td align="right" className="tabular-nums">
                  {cal ? Object.values(cal.floor).map((v) => fmt(v)).join(" / ") : "—"}
                </Td>
              </tr>
              <tr className="border-b border-line/40">
                <Td className="text-muted">Bench weight</Td>
                <Td align="right" className="tabular-nums">
                  {cal ? cal.bench_weight : "—"}
                </Td>
              </tr>
              <tr>
                <Td className="text-muted">Spread across the whole parameter grid</Td>
                <Td align="right" className="tabular-nums">
                  {cal ? cal.grid_spread.toFixed(3) : "—"} in r
                </Td>
              </tr>
            </tbody>
          </table>
          </div>
          <Note>
            The bust floors are measured, not fitted: they come from what teams really got when they
            started a player they had not drafted. Because the parameter surface is nearly flat, the
            grid was used to confirm those values sit on the ridge rather than to select them —
            picking the argmax at n=36 would be fitting noise.
          </Note>
        </Panel>

        <Panel
          title="Shrinkage"
          subtitle="How a three-season sample was kept from over-claiming."
        >
          <p className="text-[13px] leading-relaxed text-muted">
            Raw per-pick positional averages are far too noisy to act on — taken literally they
            recommend the same build from every draft slot. Each position&rsquo;s edge is therefore
            scaled by how much of it repeats from season to season: the signal that shows up all
            three years survives, the signal that flips does not.
          </p>
          <div className="scroll-x mt-3">
            <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Position</Th>
                <Th align="right">Reliability</Th>
                <Th>Meaning</Th>
              </tr>
            </thead>
            <tbody>
              {(["QB", "RB", "WR", "TE"] as const).map((p) => (
                <tr key={p} className="border-b border-line/40 last:border-0">
                  <Td>{p}</Td>
                  <Td align="right" className="tabular-nums">
                    {fmt(rel[p] ?? 0, 2)}
                  </Td>
                  <Td className="text-muted">
                    {(rel[p] ?? 0) > 0.8
                      ? "edge repeats — trust it"
                      : (rel[p] ?? 0) > 0.65
                        ? "mostly repeats"
                        : "weakly repeatable — discount it"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Note>
            Two earlier shrinkage schemes were rejected: pooling standard errors at a single pick
            over-shrank and erased the quarterback effect entirely, and estimating a separate factor
            per two-round block was itself so noisy it created a false 60-point cliff between rounds
            4 and 5.
          </Note>
        </Panel>
      </div>

      <Panel title="What this study cannot tell you" subtitle="Stated plainly.">
        <ul className="space-y-2.5 text-[13px] leading-relaxed text-muted">
          <li>
            <strong className="text-chalk">Whether RB or WR is better early.</strong> Four separate
            checks come back null: the permutation test (p=0.16), the season-by-season split (2023
            reverses), the team-level correlation (r≈0), and the baseline sensitivity above.
          </li>
          <li>
            <strong className="text-chalk">What champions do.</strong> Three champions is an
            anecdote. Every claim on the Playbook page rests on the 18-vs-18 playoff comparison or
            the full 576-pick sample; the champion column is shown for interest, not as evidence.
            Their average first-QB round (4.0) actually runs against the QB finding — that is the
            n=3 sample talking, and the monotonic trend across the larger cohorts is the better
            guide.
          </li>
          <li>
            <strong className="text-chalk">Which individual 2026 players to draft.</strong> This is
            a study of draft structure. It has nothing to say about whether a given player will be
            good.
          </li>
          <li>
            <strong className="text-chalk">Whether the league will keep behaving this way.</strong>{" "}
            The scarcity model conditions on how these twelve managers have drafted. If the league
            starts taking quarterbacks early, the quarterback discount disappears with it.
          </li>
          <li>
            <strong className="text-chalk">Anything about a 2026 keeper effect.</strong> 2025
            introduced one keeper per team. One season of keeper data is not enough to model how it
            shifts the board, and 2026&rsquo;s keeper rules were not yet set when this was built.
          </li>
        </ul>
      </Panel>

      <Panel title="Reproducing it">
        <p className="text-[13px] leading-relaxed text-muted">
          Everything is regenerated by <code className="text-chalk">npm run data</code>, which runs
          four Python stages: <code className="text-chalk">fetch</code> (pull and cache Sleeper),{" "}
          <code className="text-chalk">core</code> (rescore every player, build the fact tables),{" "}
          <code className="text-chalk">replacement</code> (measure the waiver wire), and{" "}
          <code className="text-chalk">analyze</code> (models, correlations, Monte Carlo optimizer).
          The raw dump is cached and git-ignored; the derived tables are committed so the app builds
          without network access.
        </p>
      </Panel>
    </div>
  );
}
