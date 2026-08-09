"use client";

import { useMemo, useState } from "react";
import keeperData from "@/data/derived/keeper.json";
import { useDraftDoc } from "@/lib/store";
import { useSort, SortTh } from "@/components/sortable";
import { POS_COLOR, POS_BG } from "@/lib/types";

interface Row {
  pid: string; name: string; pos: string; team: string | null;
  proj: number; vorp: number; adp: number | null; pos_rank: number | null;
  drafted_2025_round: number | null;
  keep_round: number | null; keep_pick: number | null;
  pick_normally_worth: number | null;
  player_likely_there: string | null;
  surplus: number | null;
}

const ELIGIBLE = keeperData.eligible as Row[];
const WAIVER = keeperData.waiver_acquired as Row[];

export default function Keeper() {
  const { doc, setPlan } = useDraftDoc();
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(
    () => (showAll ? ELIGIBLE : ELIGIBLE.filter((r) => (r.surplus ?? -999) > -40)),
    [showAll],
  );
  const { sorted, key, dir, toggle } = useSort<Row>(rows, "surplus", "desc");
  const best = ELIGIBLE[0];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="display text-[28px] font-bold uppercase tracking-tight"
          style={{ color: "var(--color-bears)" }}>
          Keeper
        </h1>
        <p className="mt-2 max-w-[880px] text-[14px] leading-relaxed text-muted">
          Your league keeps one player at{" "}
          <strong className="text-chalk">the round you drafted him last year, minus one</strong> —
          confirmed on all twelve of the 2025 keepers without exception. So keeping is a trade: you
          hand back that pick and get the player instead. The question is never who your best player
          is, it is where the gap between a player and the pick he costs comes out largest.
        </p>
      </header>

      {best && (
        <div className="slab rounded-lg border px-4 py-4" style={{ borderColor: "var(--color-bears)" }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="display text-[20px] font-bold uppercase"
              style={{ color: "var(--color-bears-bright)" }}>
              Keep {best.name}
            </span>
            <span className="text-[13px] text-muted">
              at round {best.keep_round} (pick {best.keep_pick})
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-good">
              +{best.surplus} surplus
            </span>
          </div>
          <p className="mt-2 max-w-[860px] text-[12.5px] leading-relaxed text-muted">
            He projects {best.proj} points ({best.vorp > 0 ? "+" : ""}{best.vorp} above replacement)
            and costs you pick {best.keep_pick}, where the board would otherwise offer someone around{" "}
            {best.player_likely_there} at about {best.pick_normally_worth}. Keeping him is worth
            roughly {best.surplus} points more than using the pick.
          </p>
        </div>
      )}

      <section className="slab rounded-lg border border-line">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Every option
            </h2>
            <p className="mt-1 text-[12px] text-muted">
              Tap any column to sort. Surplus is the player&rsquo;s projected value minus what his
              keeper pick would otherwise buy.
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-bears)]" />
            show clearly bad options
          </label>
        </header>
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <SortTh label="Player" sortKey="name" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
                <SortTh label="Pos" sortKey="pos" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
                <SortTh label="2026 proj" sortKey="proj" active={key} dir={dir} onClick={toggle} align="right" />
                <SortTh label="VORP" sortKey="vorp" active={key} dir={dir} onClick={toggle} align="right" />
                <SortTh label="Keep at" sortKey="keep_pick" active={key} dir={dir} onClick={toggle} align="right" defaultDir="asc" />
                <SortTh label="That pick buys" sortKey="pick_normally_worth" active={key} dir={dir} onClick={toggle} align="right"
                  title="Projected value of the player likely available at that pick" />
                <SortTh label="Surplus" sortKey="surplus" active={key} dir={dir} onClick={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.pid} className="border-b border-line/40 last:border-0">
                  <td className="px-2.5 py-1.5 text-[12.5px]">{r.name}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                      style={{ color: POS_COLOR[r.pos], background: POS_BG[r.pos] }}>
                      {r.pos}{r.pos_rank}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums">{r.proj}</td>
                  <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums text-muted">
                    {r.vorp > 0 ? "+" : ""}{r.vorp}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">
                    R{r.keep_round} · {r.keep_pick}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">
                    <span title={r.player_likely_there ?? ""}>
                      {r.pick_normally_worth != null
                        ? `${r.pick_normally_worth > 0 ? "+" : ""}${r.pick_normally_worth}`
                        : "—"}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[13px] font-semibold tabular-nums"
                    style={{ color: (r.surplus ?? 0) > 0 ? "var(--color-good)" : "var(--color-bad)" }}>
                    {r.surplus != null ? `${r.surplus > 0 ? "+" : ""}${r.surplus}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {WAIVER.length > 0 && (
        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Picked up in-season — cost unknown
            </h2>
          </header>
          <div className="px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {WAIVER.sort((a, b) => b.vorp - a.vorp).map((r) => (
                <span key={r.pid} className="rounded border border-line px-2 py-1 text-[12px]"
                  style={{ background: POS_BG[r.pos] }}>
                  <span className="font-semibold" style={{ color: POS_COLOR[r.pos] }}>{r.name}</span>
                  <span className="ml-1.5 text-[11px] text-muted tabular-nums">
                    {r.proj} · {r.vorp > 0 ? "+" : ""}{r.vorp}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-3 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-muted">
              These were added off waivers, so they have no prior draft round to price from. Every
              keeper in the league&rsquo;s history was drafted the year before, so there is no
              precedent to infer a cost from &mdash; worth asking the commissioner before Thursday.
              Alec Pierce is the one that matters: at {WAIVER.find((w) => w.name.includes("Pierce"))?.proj ?? "—"}{" "}
              projected he would beat several of the priced options if he can be kept late.
            </p>
          </div>
        </section>
      )}

      <section className="slab rounded-lg border border-line">
        <header className="border-b border-line px-4 py-3">
          <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
            Your decision
          </h2>
        </header>
        <div className="px-4 py-3">
          <textarea
            rows={3}
            defaultValue={doc.plan.keeper ?? ""}
            onBlur={(e) => setPlan("keeper", e.target.value)}
            placeholder="Who are you keeping, and why?"
            className="w-full rounded border border-line bg-panel-2 px-3 py-2 text-[13px] leading-relaxed text-chalk placeholder:text-muted"
          />
        </div>
      </section>
    </div>
  );
}
