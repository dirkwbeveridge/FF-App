"use client";

import { useCallback, useEffect, useState } from "react";
import { POS_COLOR, POS_BG } from "@/lib/types";

interface Guidance {
  pos: string;
  value: number;
  typicalGone: number | null;
  actuallyGone: number;
}

interface DraftState {
  ok: boolean;
  error?: string;
  draft?: { id: string; status: string; teams: number; rounds: number; orderSet: boolean };
  mySlot?: number | null;
  myPicks?: number[];
  myNextPick?: number | null;
  myNextRound?: number | null;
  nextPickNo?: number;
  picksMade?: number;
  myRoster?: {
    pick_no: number;
    round: number;
    name: string;
    pos: string;
    team?: string;
    keeper?: boolean;
  }[];
  keepers?: { pick_no: number; round: number; slot: number; name: string; pos?: string }[];
  goneByPos?: Record<string, number>;
  recentByPos?: Record<string, number>;
  guidance?: Guidance[];
  plan?: { sequence: string[]; picks: number[]; value: number } | null;
  recent?: {
    pick_no: number;
    round: number;
    slot: number;
    name: string;
    pos?: string;
    by: string | null;
  }[];
}

export default function Live() {
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/draft", { cache: "no-store" });
      setState(await res.json());
      setLastFetch(new Date());
    } catch {
      setState({ ok: false, error: "Could not reach the draft feed." });
    } finally {
      setLoading(false);
    }
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
    return <p className="text-[13px] text-muted">Reading the 2026 draft…</p>;
  }

  if (!state?.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-[26px] font-semibold tracking-tight">Live draft</h1>
        <div className="rounded-lg border border-line bg-panel px-4 py-4 text-[13px] text-muted">
          {state?.error ?? "The 2026 draft is not available yet."}
        </div>
      </div>
    );
  }

  const onClock = (state.nextPickNo ?? 1) <= (state.draft!.teams * state.draft!.rounds);
  const isMyTurn = state.myNextPick != null && state.myNextPick === state.nextPickNo;
  const picksAway =
    state.myNextPick != null ? state.myNextPick - (state.nextPickNo ?? 0) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Live draft</h1>
          <p className="mt-1 text-[13px] text-muted">
            2026 · status <span className="text-chalk">{state.draft!.status}</span> ·{" "}
            {state.picksMade} of {state.draft!.teams * state.draft!.rounds} picks made
            {lastFetch && (
              <span className="ml-2 opacity-70">
                updated {lastFetch.toLocaleTimeString("en-US")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="rounded border border-line bg-panel px-3 py-1.5 text-[12px] transition-colors hover:border-muted"
          >
            Refresh
          </button>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="accent-[var(--color-good)]"
            />
            auto every 15s
          </label>
        </div>
      </header>

      {!state.draft!.orderSet && (
        <div className="rounded-lg border border-line bg-panel px-4 py-3 text-[13px] text-muted">
          The commissioner has not set the draft order yet, so your slot is unknown. Everything
          below will fill in automatically once it is assigned — until then, see{" "}
          <a href="/slots" className="text-chalk underline underline-offset-2">
            the plan for all 12 slots
          </a>
          .
        </div>
      )}

      {state.mySlot && (
        <div
          className="rounded-lg border px-4 py-4"
          style={{
            borderColor: isMyTurn ? "var(--color-good)" : "var(--color-line)",
            background: isMyTurn
              ? "color-mix(in srgb, var(--color-good) 8%, var(--color-panel))"
              : "var(--color-panel)",
          }}
        >
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[15px] font-semibold">
              {isMyTurn
                ? "You are on the clock"
                : onClock
                  ? `Your next pick: ${state.myNextPick} (round ${state.myNextRound})`
                  : "Draft complete"}
            </span>
            {!isMyTurn && picksAway != null && picksAway > 0 && (
              <span className="text-[13px] text-muted">{picksAway} picks away</span>
            )}
            <span className="text-[13px] text-muted">slot {state.mySlot}</span>
          </div>

          {state.guidance && state.guidance.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Model value at round {state.myNextRound} — and whether the board is running
              </div>
              <div className="flex flex-wrap gap-2">
                {state.guidance.map((g) => {
                  const pace =
                    g.typicalGone != null ? g.actuallyGone - g.typicalGone : null;
                  return (
                    <div
                      key={g.pos}
                      className="rounded border border-line px-3 py-2"
                      style={{ background: POS_BG[g.pos] }}
                    >
                      <div
                        className="text-[13px] font-bold"
                        style={{ color: POS_COLOR[g.pos] }}
                      >
                        {g.pos}
                      </div>
                      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">
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
                          title="Gone so far vs the historical pace at this pick"
                        >
                          {g.actuallyGone} gone ({pace >= 0 ? "+" : ""}
                          {pace.toFixed(1)} vs pace)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 max-w-[760px] text-[11.5px] leading-relaxed text-muted">
                Positive pace means that position is going faster than usual — the discount you were
                waiting for may not arrive. Negative means it is falling to you. These are
                tie-breakers between similarly graded players, not instructions to take a position.
              </p>
            </div>
          )}

          {state.plan && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Your slot&rsquo;s planned sequence
              </div>
              <div className="flex flex-wrap gap-1">
                {state.plan.sequence.map((pos, i) => {
                  const done = (state.myRoster?.length ?? 0) > i;
                  return (
                    <span
                      key={i}
                      className="rounded border px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{
                        color: POS_COLOR[pos],
                        background: POS_BG[pos],
                        borderColor: "var(--color-line)",
                        opacity: done ? 0.35 : 1,
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

      {state.keepers && state.keepers.length > 0 && (
        <section className="rounded-lg border border-line bg-panel">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em]">
              Keepers already off the board
            </h2>
            <p className="mt-1 text-[12px] text-muted">
              Each costs its owner that pick. They are scattered through the draft, so the board
              runs thinner at those rounds than history suggests.
            </p>
          </header>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {state.keepers.map((k) => (
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
                  {k.pos} · slot {k.slot} · pick {k.pick_no}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em]">Your roster</h2>
          </header>
          <div className="px-4 py-3">
            {state.myRoster && state.myRoster.length > 0 ? (
              <table className="w-full border-collapse">
                <tbody>
                  {state.myRoster.map((p) => (
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
                      <td className="py-1.5 text-right text-[11.5px] text-muted">{p.team}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-muted">No picks yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em]">Recent picks</h2>
          </header>
          <div className="px-4 py-3">
            {state.recent && state.recent.length > 0 ? (
              <table className="w-full border-collapse">
                <tbody>
                  {state.recent.map((p) => (
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
                      <td className="py-1.5 text-right text-[11.5px] text-muted">{p.by}</td>
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
