"use client";

import { useMemo } from "react";
import pool from "@/data/derived/pool.json";
import analysis from "@/data/derived/analysis.json";
import strategy from "@/data/derived/strategy.json";
import { useDraftDoc, exportDoc } from "@/lib/store";
import { POS_COLOR, POS_BG } from "@/lib/types";
import PlayerPicker, { type PickablePlayer } from "@/components/player-picker";

interface Player extends PickablePlayer {
  vorp: number;
  value: number | null;
  injury: string | null;
}

const PLAYERS = pool.players as Player[];
const BY_ID = new Map(PLAYERS.map((p) => [p.pid, p]));
const TEAMS = 12;
const ROUNDS = 16;

const KEEPER = strategy.keeper;
const SCHEDULE = strategy.schedule as {
  round: number; pick: number; pos: string; keeper?: boolean; name?: string;
}[];
const MY_SLOT = strategy.my_slot;

/** The rules from the draft study, updated for the fact that QB is now settled. */
const RULES = [
  "Your quarterback is kept, so QB is off the board — never spend a pick there.",
  "Rounds 1-4: take the best player. The RB-vs-WR question is not answerable here.",
  "From round 5 on, TE preserves the most value of any position.",
  "Stop drafting RBs after round 8 — bust rate goes 18% to 83% at round 9.",
  "Your edge is hit rate, not shape. Structure is worth under a point a week.",
];

export default function Plan() {
  const { doc, ready, setPlan, setRoundTarget, toggleStar, toggleAvoid } = useDraftDoc();

  const curve = useMemo(() => {
    return (analysis as Record<string, unknown>).shrunk_curve as
      | Record<string, Record<string, { shrunk: number | null }>>
      | undefined;
  }, []);

  /** Everyone still gettable: not already claimed on your board. */
  const undrafted = useMemo(
    () => PLAYERS.filter((p) => !doc.picks[p.pid] && p.pid !== KEEPER.pid),
    [doc.picks],
  );

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
          <p className="mt-1 text-[12.5px]">
            <span className="rounded px-1.5 py-[2px] text-[11px] font-semibold"
              style={{ color: POS_COLOR[KEEPER.pos], background: POS_BG[KEEPER.pos] }}>
              KEEPER
            </span>{" "}
            <span className="text-chalk">{KEEPER.name}</span>{" "}
            <span className="text-muted">
              — costs round {KEEPER.round} (pick {KEEPER.pick}), so that round is gone and you
              never draft a quarterback.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted">Slot {MY_SLOT}</span>
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
            Your real picks at slot {MY_SLOT} under the third-round reversal, with the keeper round
            removed. &ldquo;Model says&rdquo; is the sequence the optimiser lands on knowing you
            already own {KEEPER.name}. Pick a player for any round from the dropdown — it stores who
            he is, not what you typed.
          </p>
        </header>
        <div className="divide-y divide-line/40">
          {SCHEDULE.filter((s) => s.pos !== "K" && s.pos !== "DEF").map((slot) => {
            const rd = slot.round;
            const row = curve?.[String(rd)];
            const ranked = row
              ? (["RB", "WR", "TE"] as const)
                  .map((pos) => ({ pos: pos as string, v: row[pos]?.shrunk ?? null }))
                  .filter((x): x is { pos: string; v: number } => x.v !== null)
                  .sort((a, b) => b.v - a.v)
              : [];
            const here = targetsByRound[rd] ?? [];
            const chosen = doc.roundTargets[String(rd)]
              ? BY_ID.get(doc.roundTargets[String(rd)]) ?? null
              : null;

            if (slot.keeper) {
              return (
                <div key={rd} className="px-4 py-3"
                  style={{ background: "color-mix(in srgb, var(--color-bears) 8%, transparent)" }}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="display text-[15px] font-bold">R{rd}</span>
                    <span className="text-[12px] tabular-nums text-muted">pick {slot.pick}</span>
                    <span className="rounded px-1.5 py-[1px] text-[10.5px] font-semibold"
                      style={{ color: POS_COLOR[slot.pos], background: POS_BG[slot.pos] }}>
                      KEEPER · {slot.name}
                    </span>
                    <span className="text-[11.5px] text-muted">
                      no pick here — this is what the keeper costs
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={rd} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="display text-[15px] font-bold">R{rd}</span>
                  <span className="text-[12px] tabular-nums text-muted">pick {slot.pick}</span>
                  <span className="rounded px-1.5 py-[1px] text-[10.5px] font-semibold"
                    style={{ color: POS_COLOR[slot.pos], background: POS_BG[slot.pos] }}>
                    model says {slot.pos}
                  </span>
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10.5px] uppercase tracking-wide text-muted">taking</span>
                  <div className="min-w-0 flex-1 basis-[13rem]">
                    <PlayerPicker
                      players={undrafted}
                      value={chosen}
                      onClear={() => setRoundTarget(rd, null)}
                      onPick={(p) => setRoundTarget(rd, p.pid)}
                      placeholder={`Who do you want at ${slot.pick}?`}
                    />
                  </div>
                  {chosen && chosen.adp != null && (
                    <span className="text-[11px] tabular-nums"
                      style={{ color: chosen.adp < slot.pick ? "var(--color-bad)" : "var(--color-good)" }}>
                      {chosen.adp < slot.pick
                        ? `market takes him ~${Math.round(slot.pick - chosen.adp)} picks earlier`
                        : `should still be there (+${Math.round(chosen.adp - slot.pick)})`}
                    </span>
                  )}
                </div>
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
            <div className="mt-2">
              <PlayerPicker
                players={PLAYERS.filter((p) => !doc.starred.includes(p.pid))}
                onPick={(p) => toggleStar(p.pid)}
                placeholder="Add a target by name…"
              />
            </div>
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
            <div className="mt-2">
              <PlayerPicker
                players={PLAYERS.filter((p) => !doc.avoided.includes(p.pid))}
                onPick={(p) => toggleAvoid(p.pid)}
                placeholder="Add a player to avoid…"
              />
            </div>
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
