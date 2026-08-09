"use client";

import { useSort, SortTh } from "@/components/sortable";
import { PosChip } from "@/components/ui";
import type { PickGrade } from "@/lib/types";

/**
 * Client-side so the columns can sort. The page that renders it stays a server
 * component — it reads the study off disk, which a client bundle cannot do.
 */
export default function PickTable({
  rows,
  showFinish = false,
  initialKey = "residual_vorp",
  initialDir = "desc" as const,
}: {
  rows: PickGrade[];
  showFinish?: boolean;
  initialKey?: string;
  initialDir?: "asc" | "desc";
}) {
  const { sorted, key, dir, toggle } = useSort(rows, initialKey, initialDir);
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <SortTh label="Season" sortKey="season" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
            <SortTh label="Pick" sortKey="pick_no" active={key} dir={dir} onClick={toggle} align="right" defaultDir="asc" />
            <SortTh label="Player" sortKey="name" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
            <SortTh label="Pos" sortKey="pos" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
            <SortTh label="Manager" sortKey="owner" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
            <SortTh label="Pts" sortKey="pts_reg" active={key} dir={dir} onClick={toggle} align="right" />
            <th className="whitespace-nowrap border-b border-line px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Finish
            </th>
            <SortTh label="Grade" sortKey="residual_vorp" active={key} dir={dir} onClick={toggle} align="right" />
            {showFinish && (
              <SortTh label="Team" sortKey="final_place" active={key} dir={dir} onClick={toggle} align="right" defaultDir="asc" />
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={`${p.season}-${p.pick_no}`} className="border-b border-line/40 last:border-0">
              <td className="px-2.5 py-1.5 text-[12.5px] tabular-nums text-muted">{p.season}</td>
              <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums text-muted">{p.pick_no}</td>
              <td className="max-w-[150px] truncate px-2.5 py-1.5 text-[12.5px]" title={p.name}>{p.name}</td>
              <td className="px-2.5 py-1.5"><PosChip pos={p.pos} size="sm" /></td>
              <td className="max-w-[110px] truncate px-2.5 py-1.5 text-[12.5px] text-muted" title={p.owner}>
                {p.owner}
              </td>
              <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums text-muted">
                {Math.round(p.pts_reg)}
              </td>
              <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums text-muted">
                {p.pos_label ?? "—"}
              </td>
              <td
                className="px-2.5 py-1.5 text-right text-[12.5px] font-semibold tabular-nums"
                style={{ color: p.residual_vorp >= 0 ? "var(--color-good)" : "var(--color-bad)" }}
              >
                {p.residual_vorp >= 0 ? "+" : "−"}{Math.abs(Math.round(p.residual_vorp))}
              </td>
              {showFinish && (
                <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums text-muted">
                  {p.final_place ? `${p.final_place}${p.is_champion ? " 🏆" : ""}` : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
