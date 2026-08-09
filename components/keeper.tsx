"use client";

import { useMemo, useState } from "react";
import keeperData from "@/data/derived/keeper.json";
import strategy from "@/data/derived/strategy.json";
import { useDraftDoc } from "@/lib/store";
import { useSort, SortTh } from "@/components/sortable";
import { POS_COLOR, POS_BG } from "@/lib/types";

interface Row {
  pid: string; name: string; pos: string; team: string | null;
  proj: number | null; vorp: number | null; adp: number | null; pos_rank: number | null;
  drafted_2025_round: number; drafted_2025_pick: number; drafted_2025_label: string;
  was_keeper_2025: boolean; on_roster_at_seasons_end: boolean;
  eligible: boolean; reason: string | null;
  keep_round: number | null; keep_pick: number | null; keep_label: string | null;
  pick_normally_worth: number | null; player_likely_there: string | null;
  surplus: number | null; would_last_to_keep_pick: boolean | null;
}

interface Acquired { pid: string; name: string; pos: string; proj: number | null; vorp: number | null }

const ELIGIBLE = keeperData.eligible as Row[];
const INELIGIBLE = (keeperData.ineligible as Row[])
  .slice()
  .sort((a, b) => a.drafted_2025_round - b.drafted_2025_round);
const ACQUIRED = keeperData.acquired_not_drafted as Acquired[];
const SENS = keeperData.sensitivity;
const CHOSEN = keeperData.chosen as Row | null;
const CONTENDERS = strategy.contenders as {
  pid: string; name: string; pos: string; keep_round: number;
  vorp_surplus: number; reliability: number | null;
  market_value: number; proj_vorp: number; priced_at: number;
  lineup_market: number; lineup_projection: number; lineup_value: number;
}[];
const MODEL_AGREES = strategy.lineup_model_agrees as boolean | null;

const num = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined ? "—" : n.toFixed(d);
const signed = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(d)}`;

function Chip({ pos, rank }: { pos: string; rank?: number | null }) {
  return (
    <span
      className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
      style={{ color: POS_COLOR[pos], background: POS_BG[pos] }}
    >
      {pos}{rank ?? ""}
    </span>
  );
}

export default function Keeper() {
  const { doc, setPlan } = useDraftDoc();
  const [hideBad, setHideBad] = useState(false);

  const rows = useMemo(
    () => (hideBad ? ELIGIBLE.filter((r) => (r.surplus ?? -999) > 0) : ELIGIBLE),
    [hideBad],
  );
  const { sorted, key, dir, toggle } = useSort<Row>(rows, "surplus", "desc");
  const best = ELIGIBLE[0];
  const runnerUp = ELIGIBLE[1];

  return (
    <div className="space-y-5">
      <header>
        <h1
          className="display text-[28px] font-bold uppercase tracking-tight"
          style={{ color: "var(--color-bears)" }}
        >
          Keeper
        </h1>
        <p className="mt-2 max-w-[880px] text-[14px] leading-relaxed text-muted">
          Three rules decide who is even available to you, and all three are checkable against
          league history rather than taken on faith.
        </p>
        <ol className="mt-3 max-w-[880px] space-y-1.5 text-[13px] leading-relaxed text-muted">
          <li>
            <span className="mr-1.5 font-semibold text-chalk">1.</span>
            A keeper costs the round you drafted him last year,{" "}
            <strong className="text-chalk">minus one</strong>. True of all 20 keepers the league has
            ever declared — 12 in 2025, 8 so far for 2026 — without a single exception.
          </li>
          <li>
            <span className="mr-1.5 font-semibold text-chalk">2.</span>
            He has to have{" "}
            <strong className="text-chalk">finished last season on your roster</strong>. Seven of
            your sixteen picks were gone by week 17, and none of them are available to you.
          </li>
          <li>
            <span className="mr-1.5 font-semibold text-chalk">3.</span>
            There is <strong className="text-chalk">no round zero</strong>, so a player who cost a
            1st cannot be kept again. That is what rules out Gibbs.
          </li>
        </ol>
        <p className="mt-3 max-w-[880px] text-[13px] leading-relaxed text-muted">
          Keeping is a trade: you hand back a pick and get the player instead. So the question is
          never who your best player is — it is where the gap between a player and the pick he costs
          comes out largest.
        </p>
      </header>

      {CHOSEN && (
        <div className="slab rounded-lg border px-4 py-4" style={{ borderColor: "var(--color-bears)" }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="rounded px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.1em]"
              style={{ background: "var(--color-bears)", color: "#fff" }}>
              Declared
            </span>
            <span className="display text-[20px] font-bold uppercase"
              style={{ color: "var(--color-bears-bright)" }}>
              {CHOSEN.name}
            </span>
            <span className="text-[13px] text-muted">
              kept at round {CHOSEN.keep_round} · pick {CHOSEN.keep_pick}
            </span>
          </div>
          <p className="mt-2 max-w-[860px] text-[12.5px] leading-relaxed text-muted">
            Round {CHOSEN.keep_round} is spent. You draft {strategy.picks.length} times, starting at
            pick {strategy.picks[0]}, and you never take a quarterback — a second one cannot enter
            the lineup. The <a href="/plan" className="underline decoration-dotted">draft plan</a> and{" "}
            <a href="/board" className="underline decoration-dotted">board</a> are both built around
            that.
          </p>
        </div>
      )}

      {best && (
        <div className="slab rounded-lg border border-line px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="display text-[15px] font-bold uppercase text-muted">
              On VORP surplus alone: {best.name}
            </span>
            <span className="text-[13px] text-muted">
              at round {best.keep_round} · pick {best.keep_pick}
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-good">
              {signed(best.surplus)} surplus
            </span>
          </div>
          <p className="mt-2 max-w-[860px] text-[12.5px] leading-relaxed text-muted">
            You took him in round {best.drafted_2025_round} last year ({best.drafted_2025_label}), so
            he costs a round {best.keep_round} pick — number {best.keep_pick} overall from slot{" "}
            {keeperData.my_slot}. He projects {num(best.proj)} points, and the market has him going
            around pick {num(best.adp, 0)}, so he would be{" "}
            {best.keep_pick! - (best.adp ?? 0) > 0
              ? `about ${Math.round(best.keep_pick! - (best.adp ?? 0))} picks gone`
              : "still available"}{" "}
            by the time your keeper pick comes round. That pick would otherwise buy someone like{" "}
            {best.player_likely_there} at about {signed(best.pick_normally_worth)}.
            {runnerUp && (
              <>
                {" "}The next best option is {runnerUp.name} at {signed(runnerUp.surplus)}.
              </>
            )}
          </p>
        </div>
      )}

      {CONTENDERS.length > 0 && (
        <section className="slab rounded-lg border px-0 py-0"
          style={{ borderColor: MODEL_AGREES ? "var(--color-line)" : "var(--color-warn)" }}>
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              The same question, run as a full draft
            </h2>
            <p className="mt-1 max-w-[880px] text-[12px] leading-relaxed text-muted">
              VORP surplus treats a point of quarterback the same as a point of running back. The
              lineup simulator does not: it knows you start one QB and up to four RB/WR/TE, it knows
              which pick you give up, and it is calibrated against what the league&rsquo;s 36 real
              teams actually scored (r = {strategy.objective_r.toFixed(2)}). Each row is a full
              16-round draft, simulated.
            </p>
          </header>
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Keep</th>
                  <th className="border-b border-line px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Cost</th>
                  <th className="border-b border-line px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted" title="Projection reliability for this position, measured over 12,322 player-weeks">Proj r</th>
                  <th className="border-b border-line px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">VORP surp</th>
                  <th className="border-b border-line px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted" title="Priced by what a player taken at his ADP has historically returned">By market</th>
                  <th className="border-b border-line px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted" title="Priced by his raw 2026 projection, with no uncertainty">By proj</th>
                  <th className="border-b border-line px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-bears-bright)" }} title="Projection regressed toward the market by this position's measured reliability">Blend</th>
                </tr>
              </thead>
              <tbody>
                {CONTENDERS.map((c) => {
                  const isChosen = c.pid === CHOSEN?.pid;
                  const isBest = c.pid === CONTENDERS[0].pid;
                  return (
                    <tr key={c.pid} className="border-b border-line/40 last:border-0"
                      style={{ background: isChosen ? "color-mix(in srgb, var(--color-bears) 10%, transparent)" : undefined }}>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-[12.5px]">
                        {c.name}
                        {isChosen && <span className="ml-1.5 text-[9.5px] uppercase tracking-wide" style={{ color: "var(--color-bears-bright)" }}>yours</span>}
                        {isBest && !isChosen && <span className="ml-1.5 text-[9.5px] uppercase tracking-wide text-warn">model&rsquo;s pick</span>}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">R{c.keep_round}</td>
                      <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">{c.reliability?.toFixed(2) ?? "—"}</td>
                      <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">{signed(c.vorp_surplus)}</td>
                      <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">{num(c.lineup_market, 0)}</td>
                      <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">{num(c.lineup_projection, 0)}</td>
                      <td className="px-2.5 py-1.5 text-right text-[13px] font-semibold tabular-nums"
                        style={{ color: isBest ? "var(--color-good)" : "var(--color-chalk)" }}>
                        {num(c.lineup_value, 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            {MODEL_AGREES ? (
              <>The simulator agrees with the VORP ranking, so the decision is settled from both
                directions.</>
            ) : (
              <>
                <strong className="text-warn">These disagree, and it matters.</strong>{" "}
                {CHOSEN?.name} wins on VORP surplus and wins again if you price a keeper at his raw
                projection — but that column hands a point forecast a certainty no drafted player
                gets, and it leans hardest on the position whose projections are measured least
                reliable (QB r = 0.39, against RB 0.69). Regress each projection toward what its
                market price has historically returned, and{" "}
                <strong className="text-chalk">{CONTENDERS[0].name}</strong> comes out{" "}
                {Math.round(
                  CONTENDERS[0].lineup_value -
                    (CONTENDERS.find((c) => c.pid === CHOSEN?.pid)?.lineup_value ?? 0),
                )}{" "}
                points ahead. The mechanism is that only one quarterback can start, while a running
                back fills two starting slots and both flexes.
              </>
            )}
          </p>
        </section>
      )}

      <section className="slab rounded-lg border border-line">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Eligible — {ELIGIBLE.length} players
            </h2>
            <p className="mt-1 text-[12px] text-muted">
              Tap any column to sort. Surplus is the player&rsquo;s projected value minus what his
              keeper pick would otherwise buy.
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={hideBad}
              onChange={(e) => setHideBad(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-bears)]"
            />
            only positive surplus
          </label>
        </header>
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <SortTh label="Player" sortKey="name" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
                <SortTh label="Pos" sortKey="pos" active={key} dir={dir} onClick={toggle} defaultDir="asc" />
                <SortTh label="2025 rd" sortKey="drafted_2025_round" active={key} dir={dir} onClick={toggle}
                  align="right" defaultDir="asc" title="The round you drafted him in last year" />
                <SortTh label="Keep at" sortKey="keep_pick" active={key} dir={dir} onClick={toggle}
                  align="right" defaultDir="asc" title="One round earlier — the pick it costs you" />
                <SortTh label="2026 proj" sortKey="proj" active={key} dir={dir} onClick={toggle} align="right" />
                <SortTh label="VORP" sortKey="vorp" active={key} dir={dir} onClick={toggle} align="right" />
                <SortTh label="ADP" sortKey="adp" active={key} dir={dir} onClick={toggle} align="right" defaultDir="asc"
                  title="Where the market is drafting him this year" />
                <SortTh label="That pick buys" sortKey="pick_normally_worth" active={key} dir={dir} onClick={toggle}
                  align="right" title="Projected value of the player likely available at that pick" />
                <SortTh label="Surplus" sortKey="surplus" active={key} dir={dir} onClick={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.pid} className="border-b border-line/40 last:border-0">
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-[12.5px]">
                    {r.name}
                    {r.would_last_to_keep_pick && (
                      <span
                        className="ml-1.5 text-[10px] uppercase tracking-wide text-bad"
                        title="ADP says he would still be on the board at your keeper pick — you could just draft him there"
                      >
                        would last
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5"><Chip pos={r.pos} rank={r.pos_rank} /></td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">
                    {r.drafted_2025_round} <span className="text-[10.5px]">({r.drafted_2025_label})</span>
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-[12px] tabular-nums">
                    R{r.keep_round} <span className="text-[10.5px] text-muted">· {r.keep_pick}</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums">{num(r.proj)}</td>
                  <td className="px-2.5 py-1.5 text-right text-[12.5px] tabular-nums text-muted">
                    {signed(r.vorp)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">
                    {num(r.adp, 0)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">
                    <span title={r.player_likely_there ?? ""}>{signed(r.pick_normally_worth)}</span>
                  </td>
                  <td
                    className="px-2.5 py-1.5 text-right text-[13px] font-semibold tabular-nums"
                    style={{ color: (r.surplus ?? 0) > 0 ? "var(--color-good)" : "var(--color-bad)" }}
                  >
                    {signed(r.surplus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted">
          <strong className="text-chalk">Would last</strong> means the market has him going after
          your keeper pick — you could simply draft him there and keep someone else instead, so his
          surplus overstates what keeping actually gains you.
        </p>
      </section>

      {SENS && (
        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Does the answer survive a different baseline?
            </h2>
          </header>
          <div className="space-y-3 px-4 py-3">
            <p className="max-w-[880px] text-[12.5px] leading-relaxed text-muted">
              VORP is only as meaningful as the replacement line under it. This app&rsquo;s baseline
              sits deep — {SENS.strict_rank && Object.entries(SENS.baseline_app as Record<string, number>)
                .filter(([p]) => ["QB", "RB", "WR", "TE"].includes(p))
                .map(([p, v]) => `${p} ${v}`)
                .join(", ")}{" "}
              points — because it splits the difference with what actually churns through waivers. A
              quarterback gains more from a deep line than anyone, so a QB keeper is exactly the case
              where the convention might be doing the work rather than the player. The check is to
              re-rank against the strict last-forced-starter line instead: the{" "}
              {Object.entries(SENS.strict_rank as Record<string, number>)
                .sort()
                .map(([p, n]) => `${p}${n}`)
                .join(", ")}{" "}
              — where those ranks are what the league genuinely starts each week, measured across 36
              team-seasons.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: "This app's blended baseline", rows: SENS.ranking_app as { name: string; pos: string; surplus: number }[] },
                { title: "Strict last-forced-starter", rows: SENS.ranking_strict as { name: string; pos: string; surplus: number }[] },
              ].map((col) => (
                <div key={col.title} className="min-w-0 rounded border border-line bg-panel-2 px-3 py-2.5">
                  <div className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-muted">
                    {col.title}
                  </div>
                  {col.rows.slice(0, 4).map((r, i) => (
                    <div key={r.name} className="flex items-baseline justify-between gap-2 py-[3px] text-[12.5px]">
                      <span className="min-w-0 truncate">
                        <span className="mr-1.5 text-muted tabular-nums">{i + 1}</span>
                        {r.name}
                      </span>
                      <span
                        className="shrink-0 font-semibold tabular-nums"
                        style={{ color: r.surplus > 0 ? "var(--color-good)" : "var(--color-bad)" }}
                      >
                        {signed(r.surplus)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="border-l-2 pl-3 text-[12.5px] leading-relaxed text-muted"
              style={{ borderColor: SENS.agrees ? "var(--color-good)" : "var(--color-bad)" }}>
              {SENS.agrees ? (
                <>
                  Both conventions put <strong className="text-chalk">{best?.name}</strong> first, so
                  the pick is not an artifact of the baseline. What does move is the margin: his edge
                  over {runnerUp?.name} narrows from{" "}
                  {Math.abs(
                    (SENS.ranking_app as { surplus: number }[])[0].surplus -
                      (SENS.ranking_app as { surplus: number }[])[1].surplus,
                  ).toFixed(0)}{" "}
                  points to{" "}
                  {Math.abs(
                    (SENS.ranking_strict as { surplus: number }[])[0].surplus -
                      (SENS.ranking_strict as { surplus: number }[])[1].surplus,
                  ).toFixed(0)}
                  . Treat the ordering as solid and the size of the gap as uncertain.
                </>
              ) : (
                <>The two conventions disagree on the top pick, so this decision cannot be settled on
                  value alone — weigh it on the other evidence.</>
              )}
            </p>
          </div>
        </section>
      )}

      <section className="slab rounded-lg border border-line">
        <header className="border-b border-line px-4 py-3">
          <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
            Not eligible — the other {INELIGIBLE.length} of your 16 picks
          </h2>
        </header>
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <tbody>
              {INELIGIBLE.map((r) => (
                <tr key={r.pid} className="border-b border-line/40 last:border-0">
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-[12px] tabular-nums text-muted">
                    {r.drafted_2025_label}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-[12.5px] text-muted">{r.name}</td>
                  <td className="px-2.5 py-1.5"><Chip pos={r.pos} /></td>
                  <td className="px-2.5 py-1.5 text-[12px] leading-snug text-muted">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {ACQUIRED.length > 0 && (
        <section className="slab rounded-lg border border-line">
          <header className="border-b border-line px-4 py-3">
            <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
              Finished the season with you but were never your picks
            </h2>
          </header>
          <div className="px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {ACQUIRED.map((r) => (
                <span
                  key={r.pid}
                  className="rounded border border-line px-2 py-1 text-[12px]"
                  style={{ background: POS_BG[r.pos] }}
                >
                  <span className="font-semibold" style={{ color: POS_COLOR[r.pos] }}>{r.name}</span>
                  <span className="ml-1.5 text-[11px] tabular-nums text-muted">{num(r.proj)}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-muted">
              Added off waivers or by trade, so there is no draft round to price them from and the
              keeper rule has nothing to subtract one from. Joe Burrow is the one that stings —
              he projects {num(ACQUIRED.find((a) => a.name.includes("Burrow"))?.proj)} and would be
              the best keeper on this page if he had a round attached to him.
            </p>
          </div>
        </section>
      )}

      <section className="slab rounded-lg border border-line">
        <header className="border-b border-line px-4 py-3">
          <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">Your decision</h2>
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
