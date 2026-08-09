"use client";

/**
 * Everything you edit — the board, stars, notes, the plan — lives here.
 *
 * The site is a static export on GitHub Pages: there is no server and no
 * database, so state is kept in localStorage. That is genuinely fine for a
 * single-manager tool, with one caveat worth designing around: it is per
 * browser. Your phone and your laptop do not share it. Hence export/import,
 * so you can move a draft in progress between devices, and so a cleared cache
 * on draft night is an inconvenience rather than a disaster.
 */

import { useCallback, useEffect, useState } from "react";

const KEY = "budiceman.draft.v1";

export type Owner = number | "me" | null;

export interface DraftDoc {
  version: 1;
  season: string;
  /** pid -> who took him. Sleeper picks land here too, flagged as live. */
  picks: Record<string, { owner: Owner; pickNo?: number; live?: boolean }>;
  /** Players to chase. */
  starred: string[];
  /** Players not to draft under any circumstances. */
  avoided: string[];
  /** pid -> free-text note. */
  notes: Record<string, string>;
  /** Round number -> plan note, plus "general" for the overall strategy. */
  plan: Record<string, string>;
  /** Manager names for the other 11 slots, so the board reads like your league. */
  slotNames: Record<string, string>;
  updated: string;
}

export function emptyDoc(season = "2026"): DraftDoc {
  return {
    version: 1,
    season,
    picks: {},
    starred: [],
    avoided: [],
    notes: {},
    plan: {},
    slotNames: {},
    updated: new Date().toISOString(),
  };
}

function read(): DraftDoc {
  if (typeof window === "undefined") return emptyDoc();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyDoc();
    const parsed = JSON.parse(raw) as DraftDoc;
    if (parsed.version !== 1) return emptyDoc();
    // Defend against a partially-written doc from an older build.
    return { ...emptyDoc(parsed.season), ...parsed };
  } catch {
    return emptyDoc();
  }
}

function write(doc: DraftDoc) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...doc, updated: new Date().toISOString() }));
  } catch {
    // Quota or private mode — the UI keeps working, it just will not persist.
  }
}

/**
 * Shared reactive handle on the document. Every hook instance subscribes to the
 * same event so two panels on one page stay in step, and a second tab picks up
 * changes through the native `storage` event.
 */
const listeners = new Set<(d: DraftDoc) => void>();
function broadcast(doc: DraftDoc) {
  listeners.forEach((fn) => fn(doc));
}

export function useDraftDoc() {
  const [doc, setDoc] = useState<DraftDoc>(emptyDoc);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDoc(read());
    setReady(true);
    const onLocal = (d: DraftDoc) => setDoc(d);
    listeners.add(onLocal);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setDoc(read());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((fn: (d: DraftDoc) => DraftDoc) => {
    setDoc((prev) => {
      const next = fn(prev);
      write(next);
      queueMicrotask(() => broadcast(next));
      return next;
    });
  }, []);

  // ---- actions -----------------------------------------------------------

  const setPick = useCallback(
    (pid: string, owner: Owner, pickNo?: number, live = false) =>
      update((d) => {
        const picks = { ...d.picks };
        if (owner === null) delete picks[pid];
        else picks[pid] = { owner, pickNo, live };
        return { ...d, picks };
      }),
    [update],
  );

  /**
   * Merge the real Sleeper draft in. Live picks always win over manual ones —
   * if you tapped a player onto the wrong team and Sleeper then says otherwise,
   * Sleeper is right. Manual entries for players Sleeper has not reported are
   * left alone so you can keep running ahead of the feed.
   */
  const syncLive = useCallback(
    (live: { pid: string; owner: Owner; pickNo: number }[]) =>
      update((d) => {
        const picks = { ...d.picks };
        for (const p of live) picks[p.pid] = { owner: p.owner, pickNo: p.pickNo, live: true };
        return { ...d, picks };
      }),
    [update],
  );

  const toggleStar = useCallback(
    (pid: string) =>
      update((d) => ({
        ...d,
        starred: d.starred.includes(pid)
          ? d.starred.filter((x) => x !== pid)
          : [...d.starred, pid],
        avoided: d.avoided.filter((x) => x !== pid),
      })),
    [update],
  );

  const toggleAvoid = useCallback(
    (pid: string) =>
      update((d) => ({
        ...d,
        avoided: d.avoided.includes(pid)
          ? d.avoided.filter((x) => x !== pid)
          : [...d.avoided, pid],
        starred: d.starred.filter((x) => x !== pid),
      })),
    [update],
  );

  const setNote = useCallback(
    (pid: string, text: string) =>
      update((d) => {
        const notes = { ...d.notes };
        if (text.trim()) notes[pid] = text;
        else delete notes[pid];
        return { ...d, notes };
      }),
    [update],
  );

  const setPlan = useCallback(
    (key: string, text: string) =>
      update((d) => ({ ...d, plan: { ...d.plan, [key]: text } })),
    [update],
  );

  const setSlotName = useCallback(
    (slot: number, name: string) =>
      update((d) => ({ ...d, slotNames: { ...d.slotNames, [String(slot)]: name } })),
    [update],
  );

  /** Clear only the board, keeping stars, notes and the plan. */
  const resetBoard = useCallback(
    () => update((d) => ({ ...d, picks: {} })),
    [update],
  );

  const resetAll = useCallback(() => update((d) => emptyDoc(d.season)), [update]);

  const replaceDoc = useCallback((next: DraftDoc) => update(() => next), [update]);

  return {
    doc, ready,
    setPick, syncLive, toggleStar, toggleAvoid, setNote, setPlan, setSlotName,
    resetBoard, resetAll, replaceDoc,
  };
}

// ---- portability ---------------------------------------------------------

export function exportDoc(doc: DraftDoc) {
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bud-iceman-draft-${doc.season}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importDoc(file: File): Promise<DraftDoc | null> {
  try {
    const parsed = JSON.parse(await file.text()) as DraftDoc;
    if (parsed.version !== 1) return null;
    return { ...emptyDoc(parsed.season), ...parsed };
  } catch {
    return null;
  }
}
