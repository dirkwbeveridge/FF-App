import { getAnalysis, fmt, signed } from "@/lib/data";
import { Panel, Note, Th, Td, PosChip, Diverging } from "@/components/ui";
import { POS_COLOR, type Analysis, type Pos } from "@/lib/types";

export const metadata = { title: "Positional Value — Bud Iceman" };

const SKILL: Pos[] = ["QB", "RB", "WR", "TE"];

export default function Value() {
  const A = getAnalysis();
  const curve: NonNullable<Analysis["shrunk_curve"]> = A.shrunk_curve ?? {};
  const rounds = Object.keys(curve).map(Number).sort((a, b) => a - b);
  const rel = A.meta.reliability ?? {};

  const byRoundPos = new Map<string, (typeof A.round_position)[number]>();
  A.round_position.forEach((r) => byRoundPos.set(`${r.round}-${r.pos}`, r));

  // Scale for the sparkline chart.
  const allVals = rounds.flatMap((rd) =>
    SKILL.map((p) => curve[rd]?.[p]?.shrunk).filter((v): v is number => v != null),
  );
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[28px] font-bold uppercase tracking-tight" style={{ color: "var(--color-bears)" }}>Positional value</h1>
        <p className="mt-2 max-w-[880px] text-[14px] leading-relaxed text-muted">
          What each position has actually returned, by where it was taken. Value is points above
          replacement, where replacement is the midpoint between the last player the league is
          forced to start and what teams really got off the waiver wire.
        </p>
      </header>

      <Panel
        title="Decay curves"
        subtitle="Expected value above replacement for a player of each position taken in the middle of each round. This is the single most useful picture in the study."
      >
        <ValueChart curve={curve} rounds={rounds} lo={lo} hi={hi} />
        <div className="mt-3 flex flex-wrap gap-4 text-[12px]">
          {SKILL.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span
                className="inline-block h-[3px] w-5 rounded"
                style={{ background: POS_COLOR[p] }}
              />
              <span className="text-muted">
                {p} <span className="opacity-70">(reliability {fmt(rel[p] ?? 0, 2)})</span>
              </span>
            </span>
          ))}
        </div>
        <Note>
          Three things to take from this. QB sits below every other position at every pick — there
          is no round in which a quarterback is the best available use of a pick. RB and WR track
          each other closely through round 4, after which WR holds value better and RB falls away
          fastest of all. TE decays slowest and is the best remaining pick on the board from round 5
          onward.
          &ldquo;Reliability&rdquo; is how much of each position&rsquo;s edge repeats from season to
          season; WR&rsquo;s is lowest, meaning its curve should be trusted least.
        </Note>
      </Panel>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          title="Hit and bust rates by round"
          subtitle="A 'hit' finished the season as a startable option at his position (QB1-12, RB1-24, WR1-30, TE1-10). A 'bust' finished more than 20 points below replacement."
        >
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Rd</Th>
                  <Th>Pos</Th>
                  <Th align="right">n</Th>
                  <Th align="right">Avg VORP</Th>
                  <Th align="right">Hit</Th>
                  <Th align="right">Bust</Th>
                  <Th align="right">Wks started</Th>
                </tr>
              </thead>
              <tbody>
                {A.round_position
                  .filter((r) => r.round <= 12 && r.n >= 3)
                  .map((r) => (
                    <tr key={`${r.round}-${r.pos}`} className="border-b border-line/40 last:border-0">
                      <Td className="text-muted tabular-nums">R{r.round}</Td>
                      <Td>
                        <PosChip pos={r.pos} size="sm" />
                      </Td>
                      <Td align="right" className="tabular-nums text-muted">
                        {r.n}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {signed(r.vorp_mean)}
                      </Td>
                      <Td
                        align="right"
                        className="tabular-nums"
                        style={{ color: r.hit_rate >= 0.6 ? "var(--color-good)" : undefined }}
                      >
                        {(r.hit_rate * 100).toFixed(0)}%
                      </Td>
                      <Td
                        align="right"
                        className="tabular-nums"
                        style={{ color: r.bust_rate >= 0.5 ? "var(--color-bad)" : undefined }}
                      >
                        {(r.bust_rate * 100).toFixed(0)}%
                      </Td>
                      <Td align="right" className="tabular-nums text-muted">
                        {fmt(r.weeks_started, 1)}
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          <Panel
            title="How fast each position leaves the board"
            subtitle="Average number gone by the end of each round. This is the scarcity you are actually racing."
          >
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>After round</Th>
                    {SKILL.map((p) => (
                      <Th key={p} align="right">
                        {p}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((rd) => (
                    <tr key={rd} className="border-b border-line/40 last:border-0">
                      <Td className="text-muted tabular-nums">R{rd}</Td>
                      {SKILL.map((p) => (
                        <Td key={p} align="right" className="tabular-nums">
                          {fmt(A.draft_flow[p]?.[rd * 12] ?? 0, 1)}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>
              Only four quarterbacks are gone after three rounds and under eight after six — the
              league does not chase QB, so there is no scarcity pressure to justify reaching for
              one. Tight end is nearly as slow off the board. Receivers go fastest, though not
              dramatically faster than running backs: 42 against 32 by the end of round 8.
            </Note>
          </Panel>

          <Panel
            title="Replacement level"
            subtitle="What a position is worth zero against. Season points, 2025."
          >
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Pos</Th>
                    <Th align="right">Started/team/wk</Th>
                    <Th align="right">Replacement rank</Th>
                    <Th align="right">Baseline pts</Th>
                  </tr>
                </thead>
                <tbody>
                  {SKILL.map((p) => (
                    <tr key={p} className="border-b border-line/40 last:border-0">
                      <Td>
                        <PosChip pos={p} size="sm" />
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {fmt(A.meta.starter_demand?.[p] ?? 0, 2)}
                      </Td>
                      <Td align="right" className="tabular-nums text-muted">
                        {p}
                        {A.meta.replacement_baselines?.[p]}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {fmt(A.meta.replacement_points?.["2025"]?.[p] ?? 0)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>
              This league starts 3.3 receivers and 2.6 running backs a week, because both flex spots
              skew WR. That is why the receiver bar sits at WR40 while the running back bar sits at
              RB31 — and it is the reason a &ldquo;WR3&rdquo; here is a genuine starter, not a bench
              piece.
            </Note>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ValueChart({
  curve,
  rounds,
  lo,
  hi,
}: {
  curve: NonNullable<Analysis["shrunk_curve"]>;
  rounds: number[];
  lo: number;
  hi: number;
}) {
  const W = 900;
  const H = 260;
  const PAD = { l: 44, r: 12, t: 12, b: 26 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const maxR = Math.max(...rounds);
  const x = (rd: number) => PAD.l + ((rd - 1) / (maxR - 1)) * iw;
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
  const zero = y(0);

  return (
    <div className="scroll-x">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[680px]"
        role="img"
        aria-label="Expected value above replacement by round for each position"
      >
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={zero}
          y2={zero}
          stroke="var(--color-line)"
          strokeWidth={1}
        />
        <text x={PAD.l - 8} y={zero + 3} textAnchor="end" fontSize={10} fill="var(--color-muted)">
          0
        </text>
        {[hi, lo].map((v, i) => (
          <text
            key={i}
            x={PAD.l - 8}
            y={y(v) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--color-muted)"
          >
            {Math.round(v)}
          </text>
        ))}
        {rounds
          .filter((r) => r % 2 === 1)
          .map((rd) => (
            <text
              key={rd}
              x={x(rd)}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-muted)"
            >
              R{rd}
            </text>
          ))}
        {SKILL.map((pos) => {
          const pts = rounds
            .map((rd) => ({ rd, v: curve[rd]?.[pos]?.shrunk }))
            .filter((p): p is { rd: number; v: number } => p.v != null);
          if (!pts.length) return null;
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.rd)},${y(p.v)}`).join(" ");
          return (
            <g key={pos}>
              <path d={d} fill="none" stroke={POS_COLOR[pos]} strokeWidth={2.25} />
              {pts.map((p) => (
                <circle key={p.rd} cx={x(p.rd)} cy={y(p.v)} r={2.5} fill={POS_COLOR[pos]}>
                  <title>{`${pos} · round ${p.rd} · ${p.v > 0 ? "+" : ""}${p.v.toFixed(1)} VORP`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
