"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pool from "@/data/derived/pool.json";
import analysis from "@/data/derived/analysis.json";
import { useDraftDoc, exportDoc, importDoc, type Owner } from "@/lib/store";
import { loadDraft, loadAllPicks, slotPicks, type DraftSnapshot } from "@/lib/sleeper";
import { POS_COLOR, POS_BG } from "@/lib/types";

interface Player {
  pid: string; name: string; pos: string; team: string | null;
  adp: number | null; proj: number; vorp: number; pos_rank: number;
  value: number | null; injury: string | null; bye: number | null;
}

const PLAYERS = (pool.players as Player[]).filter((p) => p.adp != null || p.proj > 40);
const TEAMS = 12;
const ROUNDS = 16;
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"] as const;
const LINEUP_NEED: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };

export default function DraftBoard() {
  const {
    doc, ready, setPick, syncLive, toggleStar, toggleAvoid, setNote,
    setSlotName, resetBoard, replaceDoc,
  } = useDraftDoc();

  const [mySlot, setMySlot] = useState<number>(10);
  const [filter, setFilter] = useState<(typeof POSITIONS)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [assignTo, setAssignTo] = useState<Owner>("me");
  const [snap, setSnap] = useState<DraftSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- live Sleeper sync -------------------------------------------------
  const pullLive = useCallback(async () => {
    setSyncing(true);
    const [res, picks] = await Promise.all([loadDraft(), loadAllPicks()]);
    let slot = mySlot;
    if (!("error" in res)) {
      setSnap(res);
      if (res.mySlot) { slot = res.mySlot; setMySlot(res.mySlot); }
    }
    // draft_slot is the board column, so it maps straight onto an owner —
    // "me" for my own column, the slot number for everyone else. Keepers come
    // through here too, which is what puts them on the board pre-draft.
    if (picks.length) {
      syncLive(picks.map((p) => ({
        pid: p.pid,
        owner: (p.slot === slot ? "me" : p.slot) as Owner,
        pickNo: p.pickNo,
      })));
    }
    setSyncing(false);
  }, [mySlot, syncLive]);

  // Pull once on open. Not on an interval — during a live draft you tap Sync,
  // and an auto-refresh overwriting a manual entry mid-tap is worse than stale.
  const pulledOnce = useRef(false);
  useEffect(() => {
    if (pulledOnce.current) return;
    pulledOnce.current = true;
    pullLive();
  }, [pullLive]);

  const myPickNumbers = useMemo(
    () => slotPicks(mySlot, TEAMS, ROUNDS, 3),
    [mySlot],
  );

  // ---- board state -------------------------------------------------------
  const takenBy = doc.picks;
  const takenCount = Object.keys(takenBy).length;

  const rosterOf = useCallback(
    (owner: Owner) =>
      PLAYERS.filter((p) => takenBy[p.pid]?.owner === owner)
        .sort((a, b) => (takenBy[a.pid].pickNo ?? 999) - (takenBy[b.pid].pickNo ?? 999)),
    [takenBy],
  );

  const myTeam = useMemo(() => rosterOf("me"), [rosterOf]);

  /** Which starting slots I still have to fill — drives the "need" flags. */
  const needs = useMemo(() => {
    const have: Record<string, number> = {};
    myTeam.forEach((p) => { have[p.pos] = (have[p.pos] ?? 0) + 1; });
    const out: Record<string, number> = {};
    for (const [pos, n] of Object.entries(LINEUP_NEED)) {
      out[pos] = Math.max(0, n - (have[pos] ?? 0));
    }
    // Two flex spots on top of the dedicated ones.
    const flexHave = ["RB", "WR", "TE"].reduce(
      (s, pos) => s + Math.max(0, (have[pos] ?? 0) - (LINEUP_NEED[pos] ?? 0)), 0);
    out.FLEX = Math.max(0, 2 - flexHave);
    return out;
  }, [myTeam]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLAYERS.filter((p) => {
      if (takenBy[p.pid]) return false;
      if (filter !== "ALL" && p.pos !== filter) return false;
      if (onlyStarred && !doc.starred.includes(p.pid)) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.team ?? "").toLowerCase().includes(q))
        return false;
      return true;
    }).sort((a, b) => {
      const av = a.adp ?? 999, bv = b.adp ?? 999;
      return av - bv;
    });
  }, [takenBy, filter, onlyStarred, query, doc.starred]);

  /** Next pick of mine that hasn't happened yet. */
  const nextMyPick = useMemo(
    () => myPickNumbers.find((n) => n > takenCount) ?? null,
    [myPickNumbers, takenCount],
  );
  const nextRound = nextMyPick ? Math.ceil(nextMyPick / TEAMS) : null;
  const picksUntilMine = nextMyPick ? nextMyPick - takenCount - 1 : null;

  /** What the study says each position is worth in the round I'm picking in. */
  const roundValue = useMemo(() => {
    const curve = (analysis as Record<string, unknown>).shrunk_curve as
      | Record<string, Record<string, { shrunk: number | null }>>
      | undefined;
    if (!curve || !nextRound) return null;
    const row = curve[String(nextRound)];
    if (!row) return null;
    return (["RB", "WR", "TE", "QB"] as const)
      .map((pos) => ({ pos: pos as string, v: row[pos]?.shrunk ?? null }))
      .filter((x): x is { pos: string; v: number } => x.v !== null)
      .sort((a, b) => b.v - a.v);
  }, [nextRound]);

  const slotLabel = (s: number) =>
    s === mySlot ? "You" : doc.slotNames[String(s)] || `Slot ${s}`;

  const draft = (pid: string) => {
    setPick(pid, assignTo, takenCount + 1);
  };

  if (!ready) return <p className="text-[13px] text-muted">Loading board&hellip;</p>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="display text-[28px] font-bold uppercase tracking-tight"
            style={{ color: "var(--color-bears)" }}
          >
            Draft board
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {takenCount} of {TEAMS * ROUNDS} off the board
            {nextMyPick && (
              <> · your next pick <span className="text-chalk">#{nextMyPick}</span> (round{" "}
                {nextRound}{picksUntilMine != null && picksUntilMine > 0
                  ? `, ${picksUntilMine} away` : ", you're up"})
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-muted">
            My slot{" "}
            <select
              value={mySlot}
              onChange={(e) => setMySlot(Number(e.target.value))}
              className="rounded border border-line bg-panel-2 px-2 py-1 text-[12px] text-chalk"
            >
              {Array.from({ length: TEAMS }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button onClick={pullLive} disabled={syncing}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] hover:border-muted active:scale-95 disabled:opacity-50">
            {syncing ? "Syncing…" : "Sync Sleeper"}
          </button>
          <button onClick={() => exportDoc(doc)}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] hover:border-muted active:scale-95">
            Export
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] hover:border-muted active:scale-95">
            Import
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const d = await importDoc(f);
              if (d) replaceDoc(d);
              e.target.value = "";
            }} />
          <button
            onClick={() => { if (confirm("Clear every pick from the board? Stars, notes and your plan are kept.")) resetBoard(); }}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] text-bad hover:border-bad active:scale-95">
            Clear board
          </button>
        </div>
      </header>

      <div className="slab rounded-lg border border-line px-4 py-3 text-[12px] leading-relaxed text-muted">
        Everything you change here is saved in <strong className="text-chalk">this browser</strong> —
        there is no server behind the site. Use <strong className="text-chalk">Export</strong> before
        the draft and <strong className="text-chalk">Import</strong> on your phone to carry the same
        board across devices. <strong className="text-chalk">Sync Sleeper</strong> pulls the real
        draft in and overwrites anything you tapped by hand, so you can run ahead of the feed and let
        it correct you.
      </div>

      {/* ---- what to do at my next pick ---- */}
      {nextRound && roundValue && (
        <div className="slab rounded-lg border px-4 py-3" style={{ borderColor: "var(--color-bears)" }}>
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.08em] text-muted">
            Round {nextRound} · value by position, and what you still need
          </div>
          <div className="flex flex-wrap gap-2">
            {roundValue.map((r) => (
              <div key={r.pos} className="rounded border border-line px-3 py-1.5"
                style={{ background: POS_BG[r.pos] }}>
                <span className="display text-[13px] font-bold" style={{ color: POS_COLOR[r.pos] }}>
                  {r.pos}
                </span>
                <span className="ml-2 text-[13px] font-semibold tabular-nums">
                  {r.v >= 0 ? "+" : "−"}{Math.abs(r.v).toFixed(0)}
                </span>
                {needs[r.pos] > 0 && (
                  <span className="ml-2 text-[10px] font-semibold text-warn">
                    need {needs[r.pos]}
                  </span>
                )}
              </div>
            ))}
            {needs.FLEX > 0 && (
              <div className="rounded border border-line px-3 py-1.5 text-[12px] text-muted">
                FLEX <span className="font-semibold text-warn">need {needs.FLEX}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* ---- available players ---- */}
        <section className="slab min-w-0 rounded-lg border border-line">
          <header className="space-y-2 border-b border-line px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
                Available
              </h2>
              <span className="text-[11.5px] text-muted">{available.length}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[11px] text-muted">assign to</span>
                <select
                  value={String(assignTo)}
                  onChange={(e) => setAssignTo(e.target.value === "me" ? "me" : Number(e.target.value))}
                  className="rounded border px-2 py-1 text-[12px] text-chalk"
                  style={{
                    background: "var(--color-panel-2)",
                    borderColor: assignTo === "me" ? "var(--color-bears)" : "var(--color-line)",
                  }}
                >
                  <option value="me">You (slot {mySlot})</option>
                  {Array.from({ length: TEAMS }, (_, i) => i + 1)
                    .filter((s) => s !== mySlot)
                    .map((s) => <option key={s} value={s}>{slotLabel(s)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {POSITIONS.map((p) => (
                <button key={p} onClick={() => setFilter(p)}
                  className="rounded px-2 py-1 text-[11.5px] font-semibold transition-colors"
                  style={{
                    color: filter === p ? "var(--color-ink)" : (POS_COLOR[p] ?? "var(--color-muted)"),
                    background: filter === p
                      ? (POS_COLOR[p] ?? "var(--color-muted)")
                      : (POS_BG[p] ?? "transparent"),
                  }}>
                  {p}
                </button>
              ))}
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="ml-auto w-28 rounded border border-line bg-panel-2 px-2 py-1 text-[12px] text-chalk placeholder:text-muted"
              />
              <label className="flex items-center gap-1 text-[11.5px] text-muted">
                <input type="checkbox" checked={onlyStarred}
                  onChange={(e) => setOnlyStarred(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--color-bears)]" />
                targets
              </label>
            </div>
          </header>

          {/* A flex list, not a table: on a phone the action buttons have to stay
              reachable, and a table row clipped its DRAFT button off the right
              edge — unusable for the one thing this page exists to do. */}
          <div className="max-h-[62vh] overflow-y-auto">
            {available.slice(0, 250).map((p) => {
              const starred = doc.starred.includes(p.pid);
              const avoided = doc.avoided.includes(p.pid);
              const note = doc.notes[p.pid];
              return (
                <div key={p.pid}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line/40 px-2 py-2 last:border-0"
                  style={{ opacity: avoided ? 0.45 : 1 }}>
                  <button onClick={() => toggleStar(p.pid)} title="Target"
                    className="shrink-0 text-[15px] leading-none transition-transform active:scale-90"
                    style={{ color: starred ? "var(--color-bears-bright)" : "var(--color-line)" }}>
                    ★
                  </button>
                  <span className="shrink-0 rounded px-1.5 py-[1px] text-[10px] font-semibold"
                    style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}>
                    {p.pos}{p.pos_rank}
                  </span>
                  <div className="min-w-0 flex-1 basis-[8rem]">
                    <div className="truncate text-[13px] leading-tight">
                      {p.name}
                      {p.injury && (
                        <span className="ml-1 text-[10px] font-semibold text-bad">{p.injury}</span>
                      )}
                    </div>
                    <div className="truncate text-[10.5px] leading-tight text-muted">
                      {p.team} · ADP {p.adp ?? "—"} · {p.proj}
                      {p.value != null && (
                        <span style={{ color: p.value > 0 ? "var(--color-good)" : undefined }}>
                          {" "}({p.value > 0 ? "+" : ""}{p.value})
                        </span>
                      )}
                      {note && <span className="text-warn"> ✎ {note}</span>}
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <button onClick={() => setNoteFor(noteFor === p.pid ? null : p.pid)}
                      title="Note"
                      className="rounded border border-line px-2 py-1 text-[11px] text-muted active:scale-95">
                      ✎
                    </button>
                    <button onClick={() => toggleAvoid(p.pid)} title="Do not draft"
                      className="rounded border px-2 py-1 text-[11px] active:scale-95"
                      style={{
                        borderColor: avoided ? "var(--color-bad)" : "var(--color-line)",
                        color: avoided ? "var(--color-bad)" : "var(--color-muted)",
                      }}>
                      ✕
                    </button>
                    <button onClick={() => draft(p.pid)}
                      className="rounded px-2.5 py-1 text-[11px] font-bold active:scale-95"
                      style={{
                        background: assignTo === "me" ? "var(--color-bears)" : "var(--color-panel-2)",
                        color: assignTo === "me" ? "#fff" : "var(--color-chalk)",
                        border: "1px solid var(--color-line)",
                      }}>
                      {assignTo === "me" ? "DRAFT" : "TOOK"}
                    </button>
                  </div>
                </div>
              );
            })}
            {noteFor && (
              <div className="sticky bottom-0 border-t border-line bg-panel px-3 py-2">
                <div className="mb-1 text-[11px] text-muted">
                  Note on {PLAYERS.find((p) => p.pid === noteFor)?.name}
                </div>
                <textarea
                  autoFocus rows={2}
                  defaultValue={doc.notes[noteFor] ?? ""}
                  onBlur={(e) => { setNote(noteFor, e.target.value); setNoteFor(null); }}
                  placeholder="Why you want him, or why you don't…"
                  className="w-full rounded border border-line bg-panel-2 px-2 py-1.5 text-[12px] text-chalk placeholder:text-muted"
                />
              </div>
            )}
          </div>
        </section>

        {/* ---- rosters ---- */}
        <section className="min-w-0 space-y-4">
          <div className="slab rounded-lg border px-3 py-3" style={{ borderColor: "var(--color-bears)" }}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-bears-bright)" }}>
                Your team
              </h2>
              <span className="text-[11.5px] tabular-nums text-muted">
                {myTeam.length} · {myTeam.reduce((s, p) => s + p.proj, 0).toFixed(0)} proj
              </span>
            </div>
            {myTeam.length === 0 ? (
              <p className="text-[12px] text-muted">Nothing yet. Tap DRAFT on a player.</p>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {myTeam.map((p) => (
                    <tr key={p.pid} className="border-b border-line/40 last:border-0">
                      <td className="py-1 pr-1">
                        <span className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                          style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}>
                          {p.pos}
                        </span>
                      </td>
                      <td className="truncate py-1 text-[12px]">{p.name}</td>
                      <td className="py-1 text-right text-[11.5px] tabular-nums text-muted">{p.proj}</td>
                      <td className="py-1 pl-1 text-right">
                        <button onClick={() => setPick(p.pid, null)} title="Undo"
                          className="text-[11px] text-muted hover:text-bad">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="slab rounded-lg border border-line px-3 py-3">
            <h2 className="display mb-2 text-[13px] font-bold uppercase tracking-[0.1em]">
              Other teams
            </h2>
            <div className="max-h-[38vh] space-y-2 overflow-y-auto">
              {Array.from({ length: TEAMS }, (_, i) => i + 1)
                .filter((s) => s !== mySlot)
                .map((s) => {
                  const r = rosterOf(s);
                  return (
                    <div key={s} className="border-b border-line/40 pb-2 last:border-0">
                      <div className="flex items-center gap-1.5">
                        <input
                          defaultValue={doc.slotNames[String(s)] ?? ""}
                          placeholder={`Slot ${s}`}
                          onBlur={(e) => setSlotName(s, e.target.value)}
                          className="w-28 rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-chalk placeholder:text-muted"
                        />
                        <span className="text-[11px] text-muted">{r.length} picks</span>
                      </div>
                      {r.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.map((p) => (
                            <button key={p.pid} onClick={() => setPick(p.pid, null)}
                              title="Undo this pick"
                              className="rounded px-1.5 py-[1px] text-[10.5px]"
                              style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}>
                              {p.name.split(" ").slice(-1)[0]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
