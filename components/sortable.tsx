"use client";

import { useCallback, useMemo, useState } from "react";

export type Dir = "asc" | "desc";

/**
 * Sorting for the data tables.
 *
 * Nulls always sink to the bottom regardless of direction — a player with no
 * ADP is not "the best" just because you sorted ascending, and having them
 * float to the top is the single most annoying thing a sortable table can do.
 */
export function useSort<T>(rows: T[], initialKey: string, initialDir: Dir = "asc") {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<Dir>(initialDir);

  const toggle = useCallback(
    (k: string, defaultDir: Dir = "desc") => {
      if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setKey(k);
        setDir(defaultDir);
      }
    },
    [key],
  );

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return dir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, key, dir]);

  return { sorted, key, dir, toggle };
}

/** A table header that sorts on click and shows which way it is pointing. */
export function SortTh({
  label,
  sortKey,
  active,
  dir,
  onClick,
  align = "left",
  defaultDir = "desc",
  title,
}: {
  label: string;
  sortKey: string;
  active: string;
  dir: Dir;
  onClick: (k: string, d?: Dir) => void;
  align?: "left" | "right" | "center";
  defaultDir?: Dir;
  title?: string;
}) {
  const on = active === sortKey;
  return (
    <th
      className={`whitespace-nowrap border-b border-line px-2.5 py-2 text-${align}`}
      title={title}
    >
      <button
        onClick={() => onClick(sortKey, defaultDir)}
        className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors"
        style={{ color: on ? "var(--color-bears-bright)" : "var(--color-muted)" }}
      >
        {label}
        <span className="text-[8px] leading-none opacity-80">
          {on ? (dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}
