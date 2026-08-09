"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getState, getRosters, getUsers, getProjections, getTrending,
  score, type Roster, type ProjRow,
} from "@/lib/season";
import { outlook, recommend, type Candidate } from "@/lib/lineup";
import { POS_COLOR, POS_BG } from "@/lib/types";
import { ME } from "@/lib/sleeper";

/**
 * The waiver question is never "who is the best free agent" — it is "who would
 * actually crack my lineup, and who comes off for them". This league's own
 * history is blunt about the difference: playoff teams made FEWER pickups
 * (19.5 a season) than teams that missed (21.7), and finalists fewest of all
 * (16.8). Churn is a symptom of a broken roster, not a cure. So every row here
 * is scored as an upgrade over the player it would displace.
 */
export default function Waivers() {
  const [week, setWeek] = useState<number | null>(null);
  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [proj, setProj] = useState<ProjRow[] | null>(null);
  const [trending, setTrending] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const state = await getState();
    const wk = Math.max(1, state?.week ?? 1);
    setWeek(wk);
    const [r, , p, t] = await Promise.all([
      getRosters(),
      getUsers(),
      getProjections(state?.season ?? String(new Date().getFullYear()), wk),
      getTrending("add", 48, 60),
    ]);
    setRosters(r);
    setProj(p);
    setTrending(new Map((t ?? []).map((x) => [x.player_id, x.count])));
    setNote(p?.length ? null : "No projections published for this week yet.");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const myRoster = rosters?.find((r) => r.owner_id === ME.userId) ?? null;

  const toCandidate = useCallback((row: ProjRow): Candidate | null => {
    const raw = score(row.stats);
    if (raw <= 0) return null;
    const pos = row.player?.position ?? "?";
    if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(pos)) return null;
    return {
      pid: row.player_id,
      name: `${row.player?.first_name ?? ""} ${row.player?.last_name ?? ""}`.trim(),
      pos,
      team: row.team,
      opponent: row.opponent,
      injury: row.player?.injury_status ?? null,
      outlook: outlook(pos, raw),
    };
  }, []);

  const analysis = useMemo(() => {
    if (!proj || !rosters || !myRoster?.players) return null;

    const rostered = new Set(rosters.flatMap((r) => r.players ?? []));
    const mine = myRoster.players
      .map((pid) => proj.find((p) => p.player_id === pid))
      .filter((r): r is ProjRow => !!r)
      .map(toCandidate)
      .filter((c): c is Candidate => !!c);

    const myLineup = recommend(mine, null).lineup;
    const startingTotal = myLineup.total;

    const free = proj
      .filter((p) => !rostered.has(p.player_id))
      .map(toCandidate)
      .filter((c): c is Candidate => !!c);

    // Value a pickup by what it does to the lineup we could actually field —
    // not by its raw projection. A 12-point WR is worthless if we already
    // start four better ones, and a 9-point TE can be a real upgrade.
    const scored = free
      .map((f) => {
        const withHim = recommend([...mine, f], null).lineup;
        const upgrade = Math.round((withHim.total - startingTotal) * 10) / 10;
        const startsNow = withHim.slots.some((s) => s.player?.pid === f.pid);
        // Who falls out of the lineup to make room.
        const before = new Set(myLineup.slots.map((s) => s.player?.pid).filter(Boolean));
        const after = new Set(withHim.slots.map((s) => s.player?.pid).filter(Boolean));
        const displaced = [...before].find((pid) => !after.has(pid as string));
        return {
          player: f,
          upgrade,
          startsNow,
          displaced: mine.find((m) => m.pid === displaced) ?? null,
          trend: trending.get(f.pid) ?? 0,
        };
      })
      .filter((x) => x.upgrade > 0 || x.trend > 0)
      .sort((a, b) => b.upgrade - a.upgrade || b.trend - a.trend);

    // Drop candidates: rostered players who never crack the lineup and have
    // the least upside if someone ahead of them gets hurt.
    const drops = [...myLineup.bench]
      .sort((a, b) => a.outlook.ceiling - b.outlook.ceiling)
      .slice(0, 5);

    return { scored: scored.slice(0, 25), drops, startingTotal, rosterSize: myRoster.players.length };
  }, [proj, rosters, myRoster, toCandidate, trending]);

  if (loading) return <p className="text-[13px] text-muted">Reading the wire&hellip;</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="display text-[28px] font-bold uppercase tracking-tight"
            style={{ color: "var(--color-bears)" }}
          >
            Waiver wire
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Week {week} · ranked by what they add to the lineup you can actually field
          </p>
        </div>
        <button
          onClick={load}
          className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] transition-colors hover:border-muted active:scale-95"
        >
          Refresh
        </button>
      </header>

      {note && (
        <div className="slab rounded-lg border border-line px-4 py-3 text-[13px] text-muted">
          {note}
        </div>
      )}

      <div className="slab rounded-lg border border-line px-4 py-3">
        <p className="max-w-[860px] text-[12.5px] leading-relaxed text-muted">
          In this league, more pickups has meant <em>worse</em> results — playoff teams averaged
          19.5 adds a season, teams that missed 21.7, and the six finalists just 16.8. Churn tracks
          a broken roster rather than a fixed one. A pickup is only worth a roster spot if it
          changes your starting lineup, so that is what the <strong className="text-chalk">upgrade</strong>{" "}
          column measures. Rows worth zero are shown only if the league is adding them heavily.
        </p>
      </div>

      {analysis && (
        <>
          <section className="slab rounded-lg border border-line">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">Targets</h2>
              <span className="text-[12px] tabular-nums text-muted">
                your lineup projects {analysis.startingTotal}
              </span>
            </header>
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Player</Th><Th>Matchup</Th><Th align="right">Proj</Th>
                    <Th align="right">Ceiling</Th><Th align="right">Upgrade</Th>
                    <Th>Would replace</Th><Th align="right">League adds</Th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.scored.map((x) => (
                    <tr key={x.player.pid} className="border-b border-line/40 last:border-0">
                      <Td>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                            style={{ color: POS_COLOR[x.player.pos], background: POS_BG[x.player.pos] }}
                          >
                            {x.player.pos}
                          </span>
                          {x.player.name}
                          {x.player.injury && (
                            <span className="text-[10px] font-semibold text-bad">{x.player.injury}</span>
                          )}
                        </span>
                      </Td>
                      <Td className="text-muted">
                        {x.player.team}{x.player.opponent ? ` vs ${x.player.opponent}` : ""}
                      </Td>
                      <Td align="right" className="tabular-nums">{x.player.outlook.mean}</Td>
                      <Td align="right" className="tabular-nums text-muted">{x.player.outlook.ceiling}</Td>
                      <Td
                        align="right"
                        className="font-semibold tabular-nums"
                        style={{ color: x.upgrade > 0 ? "var(--color-good)" : "var(--color-muted)" }}
                      >
                        {x.upgrade > 0 ? `+${x.upgrade}` : "—"}
                      </Td>
                      <Td className="text-muted">{x.displaced?.name ?? "—"}</Td>
                      <Td align="right" className="tabular-nums text-muted">
                        {x.trend ? x.trend.toLocaleString("en-US") : "—"}
                      </Td>
                    </tr>
                  ))}
                  {analysis.scored.length === 0 && (
                    <tr>
                      <Td className="text-muted">
                        Nothing on the wire would improve your starting lineup. That is a good sign
                        — hold your roster spot.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {analysis.drops.length > 0 && (
            <section className="slab rounded-lg border border-line">
              <header className="border-b border-line px-4 py-3">
                <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
                  If you need the roster spot
                </h2>
                <p className="mt-1 text-[12px] text-muted">
                  Bench players ranked by ceiling, lowest first — the ones least likely to matter
                  even if someone ahead of them goes down.
                </p>
              </header>
              <div className="scroll-x">
                <table className="w-full border-collapse">
                  <tbody>
                    {analysis.drops.map((p) => (
                      <tr key={p.pid} className="border-b border-line/40 last:border-0">
                        <Td>
                          <span className="flex items-center gap-1.5">
                            <span
                              className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                              style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}
                            >
                              {p.pos}
                            </span>
                            {p.name}
                          </span>
                        </Td>
                        <Td className="text-muted">{p.team}</Td>
                        <Td align="right" className="tabular-nums text-muted">proj {p.outlook.mean}</Td>
                        <Td align="right" className="tabular-nums text-muted">
                          ceiling {p.outlook.ceiling}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-line px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted text-${align}`}
    >
      {children}
    </th>
  );
}
function Td({
  children, align = "left", className = "", style,
}: {
  children?: React.ReactNode; align?: "left" | "right"; className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`whitespace-nowrap px-2.5 py-1.5 text-[12.5px] text-${align} ${className}`}
      style={style}
    >
      {children}
    </td>
  );
}
