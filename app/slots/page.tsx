import { getAnalysis, fmt, signed } from "@/lib/data";
import { Panel, SeqStrip, Note, Th, Td, PosChip } from "@/components/ui";
import type { Pos } from "@/lib/types";

export const metadata = { title: "Draft Slots — 415 FC" };

export default function Slots() {
  const A = getAnalysis();
  const slots = Object.keys(A.optimal_by_slot)
    .map(Number)
    .sort((a, b) => a - b);

  const named = A.named_strategies ?? {};
  const namedKeys = Object.keys(named);

  // Spread across slots tells us how much the slot actually matters.
  const bests = slots.map((s) => A.optimal_by_slot[String(s)].best.mean);
  const spread = Math.max(...bests) - Math.min(...bests);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight">Draft slots</h1>
        <p className="mt-2 max-w-[860px] text-[14px] leading-relaxed text-muted">
          For each of the 12 slots, the position sequence that maximises expected starting-lineup
          value, found by beam search over a Monte Carlo model of this league&rsquo;s own draft.
          Each candidate build is simulated thousands of times, drawing real historical outcomes
          for the kind of player available at that pick.
        </p>
      </header>

      <Panel
        title="Read this first"
        subtitle="The honest size of the effect."
      >
        <p className="max-w-[900px] text-[13px] leading-relaxed text-muted">
          The best and worst draft slots differ by{" "}
          <strong className="text-chalk">{fmt(spread)} points of expected value</strong> across a
          16-round draft — roughly {fmt(spread / 14, 1)} points a week. The gap between the optimal
          sequence at your slot and a sensible balanced build is similar. Slot is not destiny, and
          neither is shape. Use these as tie-breakers when two players grade out close, not as a
          script to follow past an obvious value.
        </p>
        <p className="mt-3 max-w-[900px] text-[13px] leading-relaxed text-muted">
          Sequences cover rounds 1&ndash;14. Rounds 15 and 16 are reserved for a kicker and a
          defense, which is where this league has always taken them and where the value difference
          is negligible.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {slots.map((slot) => {
          const o = A.optimal_by_slot[String(slot)];
          const hist = A.slots.find((s) => s.slot === slot);
          const alts = o.alternatives.slice(0, 3);
          return (
            <Panel key={slot} title={`Slot ${slot}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[12px] text-muted">
                  Picks{" "}
                  <span className="tabular-nums text-chalk">
                    {o.picks.slice(0, 6).join(" · ")}
                    {o.picks.length > 6 ? " …" : ""}
                  </span>
                </div>
                <div className="text-[12px] tabular-nums text-muted">
                  value <span className="font-semibold text-chalk">{fmt(o.best.mean)}</span>
                  <span className="ml-1.5 text-[11px]">
                    (p10 {fmt(o.best.p10)} — p90 {fmt(o.best.p90)})
                  </span>
                </div>
              </div>

              <SeqStrip seq={o.best.sequence} picks={o.picks} max={14} />

              <div className="mt-3 space-y-1">
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                  Near-equivalent alternatives
                </div>
                {alts.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-9 shrink-0 tabular-nums text-muted">
                      {signed(a.mean - o.best.mean)}
                    </span>
                    <span className="flex flex-wrap gap-0.5">
                      {a.sequence.slice(0, 10).map((p, j) => (
                        <PosChip key={j} pos={p} size="sm" />
                      ))}
                    </span>
                  </div>
                ))}
              </div>

              {hist && (
                <div className="mt-3 border-t border-line pt-2 text-[11.5px] leading-relaxed text-muted">
                  <span className="uppercase tracking-[0.08em]">History </span>
                  {hist.n} team-seasons from this slot · {fmt(hist.avg_pts, 0)} avg points ·{" "}
                  {(hist.playoff_rate * 100).toFixed(0)}% playoff rate · {hist.champs}{" "}
                  {hist.champs === 1 ? "title" : "titles"}
                  <div className="mt-0.5 text-[11px] opacity-80">{hist.owners.join(" · ")}</div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      {namedKeys.length > 0 && (
        <Panel
          title="Named strategies, scored at every slot"
          subtitle="Expected starting-lineup value. The columns are draft slots. This is the clearest way to see how little the choice of shape buys you — and how much a bad QB plan costs."
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Strategy</Th>
                  <Th>First 8 rounds</Th>
                  {slots.map((s) => (
                    <Th key={s} align="right">
                      {s}
                    </Th>
                  ))}
                  <Th align="right">Avg</Th>
                </tr>
              </thead>
              <tbody>
                {namedKeys
                  .map((k) => {
                    const row = named[k];
                    const vals = slots.map((s) => row.by_slot[String(s)] ?? row.by_slot[s]);
                    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                    return { k, row, vals, avg };
                  })
                  .sort((a, b) => b.avg - a.avg)
                  .map(({ k, row, vals, avg }, idx) => (
                    <tr key={k} className="border-b border-line/50 last:border-0">
                      <Td className={idx === 0 ? "font-semibold" : ""}>{k}</Td>
                      <Td>
                        <span className="flex gap-0.5">
                          {row.sequence.slice(0, 8).map((p: Pos, j: number) => (
                            <PosChip key={j} pos={p} size="sm" />
                          ))}
                        </span>
                      </Td>
                      {vals.map((v, j) => (
                        <Td key={j} align="right" className="tabular-nums text-muted">
                          {fmt(v)}
                        </Td>
                      ))}
                      <Td
                        align="right"
                        className={`tabular-nums ${idx === 0 ? "font-semibold text-chalk" : ""}`}
                      >
                        {fmt(avg)}
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Note>
            The four sensible balanced builds land within five points of one another — a rounding
            error across a season. The three that trail are the committed ones: Hero RB, Elite QB
            early and Zero RB. RB-heavy tops the table, but by less than the amount that simply
            changing the definition of replacement level would move it, so treat that ordering as
            noise rather than instruction. The real lesson here is how flat this table is.
          </Note>
        </Panel>
      )}
    </div>
  );
}
