"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getState, getRosters, getUsers, getMatchups, getProjections,
  score, PLAYOFF_WEEK, type Roster, type LeagueUser, type ProjRow,
} from "@/lib/season";
import {
  outlook, recommend, lineupSpread, winProbability, PROJECTION_QUALITY,
  type Candidate,
} from "@/lib/lineup";
import { POS_COLOR, POS_BG } from "@/lib/types";
import { ME } from "@/lib/sleeper";
import backtest from "@/data/derived/backtest.json";

const POSTURE_LABEL = {
  balanced: "Maximise points",
  floor: "Protect the lead",
  ceiling: "Chase the upset",
} as const;

export default function MyTeam() {
  const [week, setWeek] = useState<number | null>(null);
  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [users, setUsers] = useState<LeagueUser[] | null>(null);
  const [proj, setProj] = useState<ProjRow[] | null>(null);
  const [oppRosterId, setOppRosterId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (wk?: number) => {
    setLoading(true);
    const state = await getState();
    const useWeek = wk ?? Math.max(1, state?.week ?? 1);
    setWeek(useWeek);

    const [r, u, m, p] = await Promise.all([
      getRosters(),
      getUsers(),
      getMatchups(useWeek),
      getProjections(state?.season ?? String(new Date().getFullYear()), useWeek),
    ]);
    setRosters(r);
    setUsers(u);
    setProj(p);

    if (r && m) {
      const mine = r.find((x) => x.owner_id === ME.userId);
      const myMatch = m.find((x) => x.roster_id === mine?.roster_id);
      const opp = m.find(
        (x) => x.matchup_id != null && x.matchup_id === myMatch?.matchup_id && x.roster_id !== mine?.roster_id,
      );
      setOppRosterId(opp?.roster_id ?? null);
    }
    if (!p?.length) {
      setNote("No projections published for this week yet — they appear a few days before kickoff.");
    } else {
      setNote(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const myRoster = rosters?.find((r) => r.owner_id === ME.userId) ?? null;

  /** Roster player ids -> scored, bias-corrected outlooks. */
  const candidatesFor = useCallback(
    (roster: Roster | null | undefined): Candidate[] => {
      if (!roster?.players || !proj) return [];
      const byId = new Map(proj.map((p) => [p.player_id, p]));
      return roster.players
        .map((pid) => {
          const row = byId.get(pid);
          if (!row) return null;
          const raw = score(row.stats);
          if (raw <= 0) return null;
          const pos = row.player?.position ?? "?";
          return {
            pid,
            name: `${row.player?.first_name ?? ""} ${row.player?.last_name ?? ""}`.trim(),
            pos,
            team: row.team,
            opponent: row.opponent,
            injury: row.player?.injury_status ?? null,
            outlook: outlook(pos, raw),
          } as Candidate;
        })
        .filter((c): c is Candidate => !!c);
    },
    [proj],
  );

  const mine = useMemo(() => candidatesFor(myRoster), [candidatesFor, myRoster]);
  const oppRoster = rosters?.find((r) => r.roster_id === oppRosterId) ?? null;
  const theirs = useMemo(() => candidatesFor(oppRoster), [candidatesFor, oppRoster]);

  const oppSpread = useMemo(() => {
    if (!theirs.length) return null;
    const l = recommend(theirs, null).lineup;
    return lineupSpread(l.slots);
  }, [theirs]);

  const rec = useMemo(
    () => (mine.length ? recommend(mine, oppSpread) : null),
    [mine, oppSpread],
  );

  /** What they have set right now, for the "you are leaving X on the bench" line. */
  const current = useMemo(() => {
    if (!myRoster?.starters || !mine.length) return null;
    const byId = new Map(mine.map((c) => [c.pid, c]));
    const started = myRoster.starters.map((pid) => byId.get(pid)).filter((c): c is Candidate => !!c);
    const mean = started.reduce((s, c) => s + c.outlook.mean, 0);
    const sd = Math.sqrt(started.reduce((s, c) => s + c.outlook.sd ** 2, 0));
    return { players: started, mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10 };
  }, [myRoster, mine]);

  const gain = rec && current ? Math.round((rec.lineup.total - current.mean) * 10) / 10 : null;
  const currentWp =
    current && oppSpread ? winProbability({ mean: current.mean, sd: current.sd }, oppSpread) : null;

  const teamName = (rid: number | null) => {
    if (rid == null) return "—";
    const r = rosters?.find((x) => x.roster_id === rid);
    const u = users?.find((x) => x.user_id === r?.owner_id);
    return u?.metadata?.team_name || u?.display_name || `Roster ${rid}`;
  };

  if (loading) return <p className="text-[13px] text-muted">Loading week&hellip;</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="display text-[28px] font-bold uppercase tracking-tight"
            style={{ color: "var(--color-bears)" }}
          >
            Start / Sit
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Week {week}
            {week != null && week >= PLAYOFF_WEEK && " · playoffs"}
            {oppRosterId != null && <> · vs {teamName(oppRosterId)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted">
            Week{" "}
            <select
              value={week ?? 1}
              onChange={(e) => load(Number(e.target.value))}
              className="rounded border border-line bg-panel-2 px-2 py-1 text-[12px] text-chalk"
            >
              {Array.from({ length: 17 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => load(week ?? undefined)}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-[12px] transition-colors hover:border-muted active:scale-95"
          >
            Refresh
          </button>
        </div>
      </header>

      {note && (
        <div className="slab rounded-lg border border-line px-4 py-3 text-[13px] text-muted">
          {note}
        </div>
      )}

      {!myRoster && !note && (
        <div className="slab rounded-lg border border-line px-4 py-3 text-[13px] text-muted">
          No roster found for your account in the {new Date().getFullYear()} league yet.
        </div>
      )}

      {rec && (
        <>
          {/* ---- the headline decision ---- */}
          <div className="slab rounded-lg border px-4 py-4" style={{ borderColor: "var(--color-bears)" }}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span
                className="display text-[18px] font-bold uppercase"
                style={{ color: "var(--color-bears-bright)" }}
              >
                {POSTURE_LABEL[rec.posture]}
              </span>
              {rec.winProb != null && (
                <span className="text-[13px]">
                  <span className="text-muted">win probability </span>
                  <span className="font-semibold tabular-nums">
                    {(rec.winProb * 100).toFixed(0)}%
                  </span>
                  {currentWp != null && Math.abs(rec.winProb - currentWp) > 0.004 && (
                    <span
                      className="ml-1.5 tabular-nums"
                      style={{ color: rec.winProb > currentWp ? "var(--color-good)" : "var(--color-bad)" }}
                    >
                      ({rec.winProb > currentWp ? "+" : ""}
                      {((rec.winProb - currentWp) * 100).toFixed(1)} vs your current lineup)
                    </span>
                  )}
                </span>
              )}
              {gain != null && Math.abs(gain) >= 0.1 && (
                <span
                  className="text-[13px] tabular-nums"
                  style={{ color: gain > 0 ? "var(--color-good)" : "var(--color-muted)" }}
                >
                  {gain > 0 ? `+${gain} pts vs your current lineup` : "your lineup is already optimal"}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-[840px] text-[12.5px] leading-relaxed text-muted">{rec.reason}</p>
            {rec.alternatives.length > 0 && rec.winProb != null && (
              <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-muted">
                {rec.alternatives.map((a) => (
                  <span key={a.posture} className="tabular-nums">
                    {POSTURE_LABEL[a.posture]}: {a.total} pts
                    {a.winProb != null && ` · ${(a.winProb * 100).toFixed(0)}% win`}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ---- the lineup ---- */}
          <section className="slab rounded-lg border border-line">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
                Recommended lineup
              </h2>
              <span className="text-[12px] tabular-nums text-muted">
                {rec.lineup.total} projected
                {oppSpread && <> · opponent {oppSpread.mean}</>}
              </span>
            </header>
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Slot</Th><Th>Player</Th><Th>Matchup</Th>
                    <Th align="right">Floor</Th><Th align="right">Proj</Th><Th align="right">Ceiling</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rec.lineup.slots.map((s, i) => {
                    const p = s.player;
                    const wasStarting = current?.players.some((c) => c.pid === p?.pid);
                    return (
                      <tr key={i} className="border-b border-line/40 last:border-0">
                        <Td className="text-muted">{s.slot}</Td>
                        <Td>
                          {p ? (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                                style={{ color: POS_COLOR[p.pos], background: POS_BG[p.pos] }}
                              >
                                {p.pos}
                              </span>
                              <span>{p.name}</span>
                              {p.injury && (
                                <span className="text-[10px] font-semibold text-bad">{p.injury}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted">empty</span>
                          )}
                        </Td>
                        <Td className="text-muted">
                          {p?.team}
                          {p?.opponent ? ` vs ${p.opponent}` : ""}
                        </Td>
                        <Td align="right" className="tabular-nums text-muted">{p?.outlook.floor ?? "—"}</Td>
                        <Td align="right" className="font-semibold tabular-nums">{p?.outlook.mean ?? "—"}</Td>
                        <Td align="right" className="tabular-nums text-muted">{p?.outlook.ceiling ?? "—"}</Td>
                        <Td>
                          {p && current && !wasStarting && (
                            <span className="text-[10.5px] font-semibold text-good">START</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---- bench, with the ones you're wrongly starting called out ---- */}
          {rec.lineup.bench.length > 0 && (
            <section className="slab rounded-lg border border-line">
              <header className="border-b border-line px-4 py-3">
                <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">Bench</h2>
              </header>
              <div className="scroll-x">
                <table className="w-full border-collapse">
                  <tbody>
                    {rec.lineup.bench.map((p) => {
                      const wasStarting = current?.players.some((c) => c.pid === p.pid);
                      return (
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
                              {p.injury && (
                                <span className="text-[10px] font-semibold text-bad">{p.injury}</span>
                              )}
                            </span>
                          </Td>
                          <Td className="text-muted">
                            {p.team}{p.opponent ? ` vs ${p.opponent}` : ""}
                          </Td>
                          <Td align="right" className="tabular-nums text-muted">{p.outlook.floor}</Td>
                          <Td align="right" className="tabular-nums">{p.outlook.mean}</Td>
                          <Td align="right" className="tabular-nums text-muted">{p.outlook.ceiling}</Td>
                          <Td>
                            {wasStarting && (
                              <span className="text-[10.5px] font-semibold text-bad">SIT</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* ---- the tool's own track record, stated up front ---- */}
      <section className="slab rounded-lg border border-line">
        <header className="border-b border-line px-4 py-3">
          <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
            What this tool has been worth
          </h2>
          <p className="mt-1 text-[12px] text-muted">
            Replayed across all {backtest.n_team_weeks} team-weeks of 2023&ndash;25: what each
            manager really started, against what this tool would have said using only the
            projections available at the time.
          </p>
        </header>
        <div className="px-4 py-3">
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Season</Th><Th align="right">Pts / week</Th><Th align="right">Season</Th>
                  <Th align="right">Wins gained</Th><Th align="right">Wins lost</Th>
                </tr>
              </thead>
              <tbody>
                {backtest.mine.map((r) => (
                  <tr key={r.season} className="border-b border-line/40 last:border-0">
                    <Td>{r.season}</Td>
                    <Td align="right" className="tabular-nums text-good">+{r.per_week}</Td>
                    <Td align="right" className="tabular-nums text-muted">+{r.season_total}</Td>
                    <Td align="right" className="tabular-nums">{r.wins_gained}</Td>
                    <Td align="right" className="tabular-nums text-muted">{r.wins_lost}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-muted">
            Across your three seasons it would have added{" "}
            <strong className="text-chalk">
              {backtest.mine.reduce((s, r) => s + r.wins_gained, 0)} wins and cost{" "}
              {backtest.mine.reduce((s, r) => s + r.wins_lost, 0)}
            </strong>
            . League-wide the edge is smaller — {backtest.league_per_week} points a week and a net
            of {backtest.league_wins_gained - backtest.league_wins_lost} wins across 36
            team-seasons. Worth being straight about the ceiling: managers leave{" "}
            {backtest.gap_manager} points a week on the bench against perfect hindsight, and this
            tool only recovers {backtest.gap_closed_pct}% of that. The rest is not recoverable
            from projections — nobody knew which back would find the end zone.
          </p>
        </div>
      </section>

      {/* ---- how much to trust any of this ---- */}
      <section className="slab rounded-lg border border-line">
        <header className="border-b border-line px-4 py-3">
          <h2 className="display text-[13px] font-bold uppercase tracking-[0.1em]">
            How much to trust the projections
          </h2>
          <p className="mt-1 text-[12px] text-muted">
            Measured against three seasons of this league&rsquo;s actual results, in its own scoring.
          </p>
        </header>
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Pos</Th><Th align="right">Correlation</Th><Th align="right">Avg miss</Th>
                <Th align="right">Runs high by</Th><Th align="right">Bust rate</Th><Th>Read</Th>
              </tr>
            </thead>
            <tbody>
              {(["RB", "WR", "TE", "QB"] as const).map((pos) => {
                const q = PROJECTION_QUALITY[pos];
                if (!q) return null;
                return (
                  <tr key={pos} className="border-b border-line/40 last:border-0">
                    <Td>
                      <span
                        className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
                        style={{ color: POS_COLOR[pos], background: POS_BG[pos] }}
                      >
                        {pos}
                      </span>
                    </Td>
                    <Td align="right" className="tabular-nums">{q.r.toFixed(2)}</Td>
                    <Td align="right" className="tabular-nums text-muted">{q.rmse.toFixed(1)} pts</Td>
                    <Td align="right" className="tabular-nums text-muted">{Math.abs(q.bias).toFixed(1)}</Td>
                    <Td align="right" className="tabular-nums text-muted">
                      {(q.bust_rate * 100).toFixed(0)}%
                    </Td>
                    <Td className="text-muted">
                      {q.r > 0.65 ? "most reliable" : q.r > 0.55 ? "usable" : "close to a coin flip"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-muted">
          Quarterback projections correlate 0.39 with what actually happens — barely better than
          guessing. Treat any QB start/sit call as close to a coin flip and spend your attention on
          the flex, where the projections are twice as informative. Every number above is already
          bias-corrected; the floor and ceiling columns are the real 10th and 90th percentile
          outcomes for players projected in that range, not a formula.
        </p>
      </section>
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
  children, align = "left", className = "",
}: { children?: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-2.5 py-1.5 text-[12.5px] text-${align} ${className}`}>
      {children}
    </td>
  );
}
