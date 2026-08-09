"use client";

import { useMemo, useState } from "react";
import pool from "@/data/derived/pool.json";
import analysis from "@/data/derived/analysis.json";
import { useDraftDoc, exportDoc } from "@/lib/store";
import { slotPicks } from "@/lib/sleeper";
import { POS_COLOR, POS_BG } from "@/lib/types";

interface Player {
  pid: string; name: string; pos: string; team: string | null;
  adp: number | null; proj: number; vorp: number; pos_rank: number;
  value: number | null; injury: string | null;
}

const PLAYERS = pool.players as Player[];
const BY_ID = new Map(PLAYERS.map((p) => [p.pid, p]));
const TEAMS = 12;
const ROUNDS = 16;

/** The five rules from the draft study, so the plan is written next to them. */
const RULES = [
  "Never spend a top-four pick on a QB — 41% playoff rate vs 59% waiting to rounds 5-8.",
  "Rounds 1-4: take the best player. The RB-vs-WR question is not answerable here.",
  "From round 5 on, TE preserves the most value of any position.",
  "Stop drafting RBs after round 8 — bust rate goes 18% to 83% at round 9.",
  "Your edge is hit rate, not shape. Structure is worth under a point a week.",
];

export default function Plan() {
  const { doc, ready, setPlan, toggleStar, toggleAvoid } = useDraftDoc();
  const [mySlot, setMySlot] = useState(10);

  const myPicks = useMemo(() => slotPicks(mySlot, TEAMS, ROUNDS, 3), [mySlot]);

  const optimal = useMemo(() => {
    const byslot = (analysis as Record<string, unknown>).optimal_by_slot as
      | Record<string, { best: { sequence: string[] }; picks: number[] }>
      | undefined;
    return byslot?.[String(mySlot)] ?? null;
  }, [mySlot]);

  const curve = useMemo(() => {
    return (analysis as Record<string, unknown>).shrunk_curve as
      | Record<string, Record<string, { shrunk: number | null }>>
      | undefined;
  }, []);

  const targets = doc.starred.map((pid) => BY_ID.get(pid)).filter((p): p is Player => !!p);
  const avoids = doc.avoided.map((pid) => BY_ID.get(pid)).filter((p): p is Player => !!p);

  /** Targets grouped by the round their ADP suggests they'll be gone. */
  const targetsByRound = useMemo(() => {
    const out: Record<number, Player[]> = {};
    targets.forEach((p) => {
      const rd = p.adp ? Math.min(ROUNDS, Math.ceil(p.adp / TEAMS)) : ROUNDS;
      (out[rd] ??= []).push(p);
    });
    return out;
  }, [targets]);

  if (!ready) return <p className="text-[13px] text-muted">Loading plan&hellip;</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[28px] font-bold uppercase tracking-tight"
            style={{ color: "var(--color-bears)" }}>
            Draft plan
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Round-by-round notes for Thursday · saved in this browser
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted">
            Slot{" "}
            <select value={mySlot} onChange={(e) => setMySlot(Number(e.target.value))}
              className="rounded border border-line bg-panel-2 px-2 py-1 text-[12px] text-chalk">
              {Array.from({ length: TEAMS }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button onClick={() => exportDoc(doc)}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] hover:border-muted active:scale-95">
            Export
          </button>
        </div>
      </header>

      {/* ---- overall strategy ---- */}
      <section className="slab rounded-lg border border-line">
        <header className="border-b border-line px-4 py-3">
          <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
            Overall approach
          </h2>
        </header>
        <div className="px-4 py-3">
          <textarea
            rows={4}
            defaultValue={doc.plan.general ?? ""}
            onBlur={(e) => setPlan("general", e.target.value)}
            placeholder="What am I trying to do this draft? What went wrong last year?"
            className="w-full rounded border border-line bg-panel-2 px-3 py-2 text-[13px] leading-relaxed text-chalk placeholder:text-muted"
          />
          <div className="mt-3 space-y-1.5">
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
              From the study
            </div>
            {RULES.map((r, i) => (
              <div key={i} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                <span className="display shrink-0 font-bold" style={{ color: "var(--color-bears)" }}>
                  {i + 1}
                </span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- round by round ---- */}
      <section className="slab rounded-lg border border-line">
        <header className="border-b border-line px-4 py-3">
          <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
            Round by round
          </h2>
          <p className="mt-1 text-[12px] text-muted">
            Your picks at slot {mySlot} under the third-round reversal, with what the model says
            each position is worth there and which of your targets are likely gone by then.
          </p>
        </header>
        <div className="divide-y divide-line/40">
          {Array.from({ length: 14 }, (_, i) => i + 1).map((rd) => {
            const pickNo = myPicks[rd - 1];
            const row = curve?.[String(rd)];
            const ranked = row
              ? (["RB", "WR", "TE", "QB"] as const)
                  .map((pos) => ({ pos: pos as string, v: row[pos]?.shrunk ?? null }))
                  .filter((x): x is { pos: string; v: number } => x.v !== null)
                  .sort((a, b) => b.v - a.v)
              : [];
            const planned = optimal?.best.sequence[rd - 1];
            const here = targetsByRound[rd] ?? [];
            return (
              <div key={rd} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="display text-[15px] font-bold">R{rd}</span>
                  <span className="text-[12px] tabular-nums text-muted">pick {pickNo}</span>
                  {planned && (
                    <span className="rounded px-1.5 py-[1px] text-[10.5px] font-semibold"
                      style={{ color: POS_COLOR[planned], background: POS_BG[planned] }}>
                      model says {planned}
                    </span>
                  )}
                  <span className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                    {ranked.map((r) => (
                      <span key={r.pos} className="tabular-nums">
                        {r.pos} {r.v >= 0 ? "+" : "−"}{Math.abs(r.v).toFixed(0)}
                      </span>
                    ))}
                  </span>
                </div>
                {here.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="text-[10.5px] uppercase tracking-wide text-muted">targets</span>
                    {here.map((p) => (
                      <span key={p.pid} className="rounded px-1.5 py-[1px] text-[10.5px]"
                        style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}>
                        {p.name} <span className="opacity-70">{p.adp}</span>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  rows={2}
                  defaultValue={doc.plan[`r${rd}`] ?? ""}
                  onBlur={(e) => setPlan(`r${rd}`, e.target.value)}
                  placeholder={`Round ${rd} plan…`}
                  className="mt-2 w-full rounded border border-line bg-panel-2 px-2.5 py-1.5 text-[12.5px] text-chalk placeholder:text-muted"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- target / avoid lists ---- */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Targets <span className="text-muted">({targets.length})</span>
            </h2>
            <p className="mt-1 text-[12px] text-muted">Starred on the board. Tap ★ to drop one.</p>
          </header>
          <div className="px-4 py-2">
            {targets.length === 0 ? (
              <p className="py-2 text-[12.5px] text-muted">
                None yet — star players from the Draft board.
              </p>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {targets.sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999)).map((p) => (
                    <tr key={p.pid} className="border-b border-line/40 last:border-0">
                      <td className="py-1.5 pr-1">
                        <button onClick={() => toggleStar(p.pid)}
                          className="text-[13px] leading-none active:scale-90"
                          style={{ color: "var(--color-bears-bright)" }}>★</button>
                      </td>
                      <td className="py-1.5 pr-1">
                        <span className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                          style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}>
                          {p.pos}{p.pos_rank}
                        </span>
                      </td>
                      <td className="py-1.5 text-[12.5px]">
                        {p.name}
                        {doc.notes[p.pid] && (
                          <span className="ml-1.5 text-[10.5px] text-warn">✎ {doc.notes[p.pid]}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-[11.5px] tabular-nums text-muted">
                        ADP {p.adp ?? "—"}
                      </td>
                      <td className="py-1.5 pl-2 text-right text-[11.5px] tabular-nums">{p.proj}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Do not draft <span className="text-muted">({avoids.length})</span>
            </h2>
          </header>
          <div className="px-4 py-2">
            {avoids.length === 0 ? (
              <p className="py-2 text-[12.5px] text-muted">
                None. Mark players &ldquo;avoid&rdquo; on the board.
              </p>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {avoids.map((p) => (
                    <tr key={p.pid} className="border-b border-line/40 last:border-0">
                      <td className="py-1.5 pr-1">
                        <span className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                          style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}>
                          {p.pos}
                        </span>
                      </td>
                      <td className="py-1.5 text-[12.5px]">{p.name}</td>
                      <td className="py-1.5 text-right text-[11.5px] tabular-nums text-muted">
                        ADP {p.adp ?? "—"}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <button onClick={() => toggleAvoid(p.pid)}
                          className="text-[11px] text-muted hover:text-chalk">undo</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
