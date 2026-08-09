"use client";

import { useCallback, useEffect, useState } from "react";
import { loadDraft, type DraftSnapshot } from "@/lib/sleeper";
import { POS_COLOR, POS_BG, type Pos } from "@/lib/types";

const SKILL: Pos[] = ["QB", "RB", "WR", "TE"];

interface Props {
  valueByRound: Record<number, Partial<Record<Pos, number>>>;
  draftFlow: Record<string, number[]>;
  plans: Record<number, { sequence: string[]; picks: number[]; value: number }>;
}

export default function LiveDraft({ valueByRound, draftFlow, plans }: Props) {
  const [snap, setSnap] = useState<DraftSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const res = await loadDraft();
    if ("error" in res) {
      setError(res.error);
    } else {
      setSnap(res);
      setError(null);
    }
    setLastFetch(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [auto, load]);

  if (loading) {
    return <p className="text-[13px] text-muted">Reading the 2026 draft&hellip;</p>;
  }

  if (error || !snap) {
    return (
      <div className="space-y-4">
        <h1 className="display text-[26px] font-bold uppercase tracking-tight">Live draft</h1>
        <div className="slab rounded-lg border border-line px-4 py-4 text-[13px] text-muted">
          {error ?? "The 2026 draft is not available yet."}
        </div>
      </div>
    );
  }

  const total = snap.teams * snap.rounds;
  const isMyTurn = snap.myNextPick != null && snap.myNextPick === snap.nextPickNo;
  const picksAway = snap.myNextPick != null ? snap.myNextPick - snap.nextPickNo : null;
  const plan = snap.mySlot ? plans[snap.mySlot] : null;

  const guidance = snap.myNextRound
    ? SKILL.map((pos) => ({
        pos,
        value: valueByRound[snap.myNextRound!]?.[pos],
        typicalGone: draftFlow[pos]?.[Math.min(snap.nextPickNo, 192)] ?? null,
        actuallyGone: snap.goneByPos[pos] ?? 0,
      }))
        .filter((g): g is typeof g & { value: number } => g.value != null)
        .sort((a, b) => b.value - a.value)
    : [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[26px] font-bold uppercase tracking-tight">Live draft</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            2026 · <span className="text-chalk">{snap.status.replace("_", " ")}</span> ·{" "}
            {snap.picksMade}/{total} picks
            {lastFetch && (
              <span className="ml-2 opacity-70">
                {lastFetch.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] transition-colors hover:border-muted active:scale-95"
          >
            Refresh
          </button>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-bears)]"
            />
            auto 15s
          </label>
        </div>
      </header>

      {!snap.orderSet && (
        <div className="slab rounded-lg border border-line px-4 py-3 text-[13px] text-muted">
          The draft order is not set yet, so your slot is unknown. This fills in automatically
          once it is assigned.
        </div>
      )}

      {snap.mySlot && (
        <div
          className="slab rounded-lg border px-4 py-4"
          style={{
            borderColor: isMyTurn ? "var(--color-bears)" : "var(--color-line)",
            boxShadow: isMyTurn
              ? "0 0 0 1px var(--color-bears), 0 0 24px -6px var(--color-bears)"
              : undefined,
          }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className="display text-[17px] font-bold uppercase"
              style={{ color: isMyTurn ? "var(--color-bears-bright)" : "var(--color-chalk)" }}
            >
              {isMyTurn
                ? "You are on the clock"
                : snap.myNextPick
                  ? `Next pick ${snap.myNextPick} · round ${snap.myNextRound}`
                  : "Draft complete"}
            </span>
            {!isMyTurn && picksAway != null && picksAway > 0 && (
              <span className="text-[13px] text-muted">{picksAway} away</span>
            )}
            <span className="text-[13px] text-muted">slot {snap.mySlot}</span>
          </div>

          {guidance.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Value at round {snap.myNextRound} · is the board running?
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {guidance.map((g) => {
                  const pace =
                    g.typicalGone != null ? g.actuallyGone - g.typicalGone : null;
                  return (
                    <div
                      key={g.pos}
                      className="rounded border border-line px-3 py-2"
                      style={{ background: POS_BG[g.pos] }}
                    >
                      <div
                        className="display text-[13px] font-bold"
                        style={{ color: POS_COLOR[g.pos] }}
                      >
                        {g.pos}
                      </div>
                      <div className="mt-0.5 text-[16px] font-semibold tabular-nums">
                        {g.value >= 0 ? "+" : "−"}
                        {Math.abs(g.value).toFixed(0)}
                      </div>
                      {pace != null && (
                        <div
                          className="mt-0.5 text-[10.5px] tabular-nums"
                          style={{
                            color:
                              pace > 2
                                ? "var(--color-bad)"
                                : pace < -2
                                  ? "var(--color-good)"
                                  : "var(--color-muted)",
                          }}
                        >
                          {g.actuallyGone} gone ({pace >= 0 ? "+" : ""}
                          {pace.toFixed(1)})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 max-w-[760px] text-[11.5px] leading-relaxed text-muted">
                Positive pace means the position is going faster than usual, so the discount you
                were waiting on may not arrive. These break ties between similarly graded players
                — they are not instructions to take a position.
              </p>
            </div>
          )}

          {plan && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Planned sequence · slot {snap.mySlot}
              </div>
              <div className="flex flex-wrap gap-1">
                {plan.sequence.map((pos, i) => {
                  const done = snap.myRoster.length > i;
                  return (
                    <span
                      key={i}
                      className="rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                      style={{
                        color: POS_COLOR[pos],
                        background: POS_BG[pos],
                        borderColor: "var(--color-line)",
                        opacity: done ? 0.3 : 1,
                      }}
                    >
                      {i + 1}.{pos}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {snap.keepers.length > 0 && (
        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Keepers off the board
            </h2>
            <p className="mt-1 text-[12px] text-muted">
              Each costs its owner that pick. They are scattered through the draft, so those
              rounds run thinner than history suggests.
            </p>
          </header>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {snap.keepers.map((k) => (
              <div
                key={k.pick_no}
                className="rounded border border-line px-2.5 py-1.5 text-[12px]"
                style={{ background: k.pos ? POS_BG[k.pos] : undefined }}
              >
                <span className="tabular-nums text-muted">R{k.round}</span>{" "}
                <span
                  className="font-semibold"
                  style={{ color: k.pos ? POS_COLOR[k.pos] : undefined }}
                >
                  {k.name}
                </span>{" "}
                <span className="text-[11px] text-muted">
                  {k.pos} · pick {k.pick_no}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Your roster
            </h2>
          </header>
          <div className="px-4 py-3">
            {snap.myRoster.length > 0 ? (
              <table className="w-full border-collapse">
                <tbody>
                  {snap.myRoster.map((p) => (
                    <tr key={p.pick_no} className="border-b border-line/40 last:border-0">
                      <td className="py-1.5 pr-2 text-[12px] tabular-nums text-muted">
                        R{p.round}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span
                          className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                          style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}
                        >
                          {p.pos}
                        </span>
                      </td>
                      <td className="py-1.5 text-[12.5px]">{p.name}</td>
                      <td className="py-1.5 text-right text-[11.5px] text-muted">
                        {p.keeper ? "keeper" : p.team}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-muted">No picks yet.</p>
            )}
          </div>
        </section>

        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Recent picks
            </h2>
          </header>
          <div className="px-4 py-3">
            {snap.recent.length > 0 ? (
              <table className="w-full border-collapse">
                <tbody>
                  {snap.recent.map((p) => (
                    <tr key={p.pick_no} className="border-b border-line/40 last:border-0">
                      <td className="py-1.5 pr-2 text-[12px] tabular-nums text-muted">
                        {p.pick_no}
                      </td>
                      <td className="py-1.5 pr-2">
                        {p.pos && (
                          <span
                            className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                            style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}
                          >
                            {p.pos}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-[12.5px]">{p.name}</td>
                      <td className="max-w-[110px] truncate py-1.5 text-right text-[11.5px] text-muted">
                        {p.by}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-muted">The draft has not started.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
