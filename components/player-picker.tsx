"use client";

/**
 * A type-to-filter player dropdown.
 *
 * A native <select> with 600 options is unusable on a phone, and a plain text
 * box lets you record "Jamyr Gibs" and silently lose the pick. This is the
 * middle: you type a few letters, tap the player, and what gets stored is his
 * id — so every downstream lookup is exact.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { POS_COLOR, POS_BG } from "@/lib/types";

export interface PickablePlayer {
  pid: string;
  name: string;
  pos: string;
  team: string | null;
  adp: number | null;
  proj: number;
  pos_rank: number;
}

export default function PlayerPicker({
  players,
  onPick,
  placeholder = "Type a player…",
  value,
  onClear,
  limit = 40,
  autoFocus = false,
  className = "",
}: {
  players: PickablePlayer[];
  onPick: (p: PickablePlayer) => void;
  placeholder?: string;
  /** The currently chosen player, if this picker is showing a selection. */
  value?: PickablePlayer | null;
  onClear?: () => void;
  limit?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Close when the tap lands anywhere else — on a phone there is no blur to
  // rely on once the list itself is scrollable.
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? players.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.team ?? "").toLowerCase().includes(q) ||
            p.pos.toLowerCase() === q,
        )
      : players;
    // Ranked by ADP so an empty box still shows the sensible next names.
    return [...base]
      .sort((a, b) => (a.adp ?? 9999) - (b.adp ?? 9999) || b.proj - a.proj)
      .slice(0, limit);
  }, [players, query, limit]);

  useEffect(() => setActive(0), [query]);

  const choose = (p: PickablePlayer) => {
    onPick(p);
    setQuery("");
    setOpen(false);
  };

  if (value) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span
          className="min-w-0 truncate rounded px-1.5 py-[2px] text-[11.5px] font-semibold"
          style={{ color: POS_COLOR[value.pos], background: POS_BG[value.pos] }}
        >
          {value.name}
        </span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-muted">
          ADP {value.adp ?? "—"}
        </span>
        {onClear && (
          <button
            onClick={onClear}
            title="Clear"
            className="shrink-0 text-[11px] text-muted hover:text-bad active:scale-90"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={box} className={`relative min-w-0 ${className}`}>
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded border border-line bg-panel-2 px-2 py-1.5 text-[12.5px] text-chalk placeholder:text-muted"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[46vh] overflow-y-auto rounded border border-line bg-panel shadow-lg">
          {matches.map((p, i) => (
            <button
              key={p.pid}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(p)}
              className="flex w-full items-center gap-2 border-b border-line/40 px-2 py-1.5 text-left last:border-0"
              style={{ background: i === active ? "var(--color-panel-2)" : "transparent" }}
            >
              <span
                className="shrink-0 rounded px-1.5 py-[1px] text-[10px] font-semibold"
                style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}
              >
                {p.pos}{p.pos_rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{p.name}</span>
              <span className="shrink-0 text-[10.5px] tabular-nums text-muted">
                {p.team} · {p.adp ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
