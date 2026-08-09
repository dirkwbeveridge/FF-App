import { getAnalysis, fmt, signed } from "@/lib/data";
import { Panel, Note, Th, Td, PosChip } from "@/components/ui";

export const metadata = { title: "Pick History — Bud Iceman" };

export default function History() {
  const A = getAnalysis();
  const graded = A.pick_grades.filter((p) => !p.is_keeper);
  const steals = [...graded].sort((a, b) => b.residual_vorp - a.residual_vorp).slice(0, 20);
  const busts = [...graded].sort((a, b) => a.residual_vorp - b.residual_vorp).slice(0, 20);

  // Only early picks carry real blame — a round-14 miss costs nothing.
  const earlyBusts = graded
    .filter((p) => p.round <= 6)
    .sort((a, b) => a.residual_vorp - b.residual_vorp)
    .slice(0, 15);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[28px] font-bold uppercase tracking-tight" style={{ color: "var(--color-bears)" }}>Every pick, graded</h1>
        <p className="mt-2 max-w-[880px] text-[14px] leading-relaxed text-muted">
          Each pick scored against what a pick at that number has historically returned. A positive
          grade means the player beat the slot he was taken at; negative means he did not. Keepers
          are excluded — they were not free choices.
        </p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          title="The 20 best picks"
          subtitle="Value above what that pick number normally returns."
        >
          <PickTable rows={steals} />
        </Panel>
        <Panel
          title="The 20 worst picks"
          subtitle="Sorted by the same measure, in the other direction."
        >
          <PickTable rows={busts} />
        </Panel>
      </div>

      <Panel
        title="The costly mistakes"
        subtitle="Busts in rounds 1-6 only. These are the picks that actually decided seasons — a miss in round 12 is free, a miss in round 2 is not."
      >
        <PickTable rows={earlyBusts} showFinish />
        <Note>
          The pattern in this table is the argument against early quarterbacks and against reaching
          at tight end: both positions are heavily represented here relative to how often they were
          drafted early.
        </Note>
      </Panel>

      <Panel
        title="Passed over"
        subtitle="Picks where a much better player at the same position went within the next two rounds. This is opportunity cost made concrete."
      >
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Season</Th>
                <Th align="right">Pick</Th>
                <Th>Manager</Th>
                <Th>Pos</Th>
                <Th>Took</Th>
                <Th align="right">VORP</Th>
                <Th>Instead of</Th>
                <Th align="right">at</Th>
                <Th align="right">VORP</Th>
                <Th align="right">Gap</Th>
              </tr>
            </thead>
            <tbody>
              {A.biggest_misses.slice(0, 22).map((m, i) => (
                <tr key={i} className="border-b border-line/40 last:border-0">
                  <Td className="text-muted tabular-nums">{m.season}</Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {m.pick_no}
                  </Td>
                  <Td className="text-muted">{m.owner}</Td>
                  <Td>
                    <PosChip pos={m.pos} size="sm" />
                  </Td>
                  <Td>{m.took}</Td>
                  <Td align="right" className="tabular-nums">
                    {signed(m.took_vorp)}
                  </Td>
                  <Td className="text-chalk">{m.instead_of}</Td>
                  <Td align="right" className="tabular-nums text-muted">
                    {m.instead_pick}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {signed(m.instead_vorp)}
                  </Td>
                  <Td align="right" className="font-semibold tabular-nums text-bad">
                    {fmt(m.gap)}
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

function PickTable({
  rows,
  showFinish = false,
}: {
  rows: ReturnType<typeof getAnalysis>["pick_grades"];
  showFinish?: boolean;
}) {
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Season</Th>
            <Th align="right">Pick</Th>
            <Th>Player</Th>
            <Th>Pos</Th>
            <Th>Manager</Th>
            <Th align="right">Pts</Th>
            <Th align="right">Finish</Th>
            <Th align="right">Grade</Th>
            {showFinish && <Th align="right">Team</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={`${p.season}-${p.pick_no}`} className="border-b border-line/40 last:border-0">
              <Td className="text-muted tabular-nums">{p.season}</Td>
              <Td align="right" className="tabular-nums text-muted">
                {p.pick_no}
              </Td>
              <Td className="max-w-[150px] truncate" title={p.name}>
                {p.name}
              </Td>
              <Td>
                <PosChip pos={p.pos} size="sm" />
              </Td>
              <Td className="max-w-[110px] truncate text-muted" title={p.owner}>
                {p.owner}
              </Td>
              <Td align="right" className="tabular-nums text-muted">
                {fmt(p.pts_reg)}
              </Td>
              <Td align="right" className="tabular-nums text-muted">
                {p.pos_label ?? "—"}
              </Td>
              <Td
                align="right"
                className="font-semibold tabular-nums"
                style={{
                  color: p.residual_vorp >= 0 ? "var(--color-good)" : "var(--color-bad)",
                }}
              >
                {signed(p.residual_vorp)}
              </Td>
              {showFinish && (
                <Td align="right" className="tabular-nums text-muted">
                  {p.final_place ? `${p.final_place}${p.is_champion ? " 🏆" : ""}` : "—"}
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
