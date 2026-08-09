/**
 * In-season data layer — everything the weekly tools run on.
 *
 * All of it is fetched in the browser (the site is a static export with no
 * server), scored with THIS league's rules rather than a generic PPR column.
 * That distinction is the whole point: this league pays 0.5 per first down and
 * 6 per passing TD, so a generic ranking is systematically wrong about
 * high-volume possession receivers and about quarterbacks.
 */

import leagueCfg from "@/data/derived/league.json";

const V1 = "https://api.sleeper.app/v1";
const V2 = "https://api.sleeper.com";

export const LEAGUE_ID = leagueCfg.league_id as string;
export const SEASON = leagueCfg.season as string;
export const SCORING = leagueCfg.scoring as Record<string, number>;
export const ROSTER_POSITIONS = leagueCfg.roster_positions as string[];
export const PLAYOFF_WEEK = leagueCfg.playoff_week_start as number;
export const PLAYOFF_TEAMS = leagueCfg.playoff_teams as number;
export const TRADE_DEADLINE = leagueCfg.trade_deadline as number;

export const STARTING_SLOTS = ROSTER_POSITIONS.filter((p) => p !== "BN");
export const BENCH_SLOTS = ROSTER_POSITIONS.filter((p) => p === "BN").length;
export const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

export type StatLine = Record<string, number>;

/**
 * Dot-product a stat line with the league's scoring settings.
 *
 * The Python pipeline does exactly this and reproduces Sleeper's own numbers
 * on 2,368 of 2,368 rostered player-weeks, so the same operation applied to a
 * projected stat line gives a projection in real league points — including the
 * first-down bonus, which no off-the-shelf ranking accounts for.
 */
export function score(stats: StatLine | null | undefined): number {
  if (!stats) return 0;
  let total = 0;
  for (const [stat, value] of Object.entries(stats)) {
    const mult = SCORING[stat];
    if (mult && typeof value === "number") total += value * mult;
  }
  return Math.round(total * 100) / 100;
}

/** Generic PPR score, for showing how far this league's rules move a player. */
export function scorePPR(stats: StatLine | null | undefined): number {
  return stats?.pts_ppr ?? 0;
}

async function get<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface NflState {
  season: string;
  week: number;
  season_type: string;
  display_week: number;
}

export const getState = () => get<NflState>(`${V1}/state/nfl`);

export interface Roster {
  roster_id: number;
  owner_id: string;
  players: string[] | null;
  starters: string[] | null;
  settings: { wins: number; losses: number; ties: number; fpts: number; fpts_decimal: number };
}

export interface LeagueUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
}

export const getRosters = () => get<Roster[]>(`${V1}/league/${LEAGUE_ID}/rosters`);
export const getUsers = () => get<LeagueUser[]>(`${V1}/league/${LEAGUE_ID}/users`);
export const getMatchups = (week: number) =>
  get<
    {
      roster_id: number;
      matchup_id: number | null;
      points: number;
      starters: string[];
      starters_points: number[];
      players: string[];
      players_points: Record<string, number>;
    }[]
  >(`${V1}/league/${LEAGUE_ID}/matchups/${week}`);

export interface ProjRow {
  player_id: string;
  team: string | null;
  opponent: string | null;
  stats: StatLine | null;
  player: {
    first_name: string;
    last_name: string;
    position: string;
    injury_status: string | null;
    years_exp: number;
  };
}

/**
 * Weekly projections with opponent attached. The v2 host is the only one that
 * returns `opponent`, which is what makes matchup and strength-of-schedule
 * analysis possible at all — the v1 stats feed has no schedule information.
 */
export async function getProjections(season: string, week: number): Promise<ProjRow[]> {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"]
    .map((p) => `position[]=${p}`)
    .join("&");
  const rows = await get<ProjRow[]>(
    `${V2}/projections/nfl/${season}/${week}?season_type=regular&${positions}&order_by=ppr`,
  );
  return rows ?? [];
}

/** Actual results with opponent attached — used for the season research pages. */
export async function getWeekStats(season: string, week: number): Promise<ProjRow[]> {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"]
    .map((p) => `position[]=${p}`)
    .join("&");
  const rows = await get<ProjRow[]>(
    `${V2}/stats/nfl/${season}/${week}?season_type=regular&${positions}&order_by=ppr`,
  );
  return rows ?? [];
}

export const getTrending = (type: "add" | "drop", hours = 24, limit = 40) =>
  get<{ player_id: string; count: number }[]>(
    `${V1}/players/nfl/trending/${type}?lookback_hours=${hours}&limit=${limit}`,
  );

// ---------------------------------------------------------------- lineups

export interface LineupPlayer {
  pid: string;
  name: string;
  pos: string;
  team: string | null;
  opponent: string | null;
  proj: number;
  injury: string | null;
}

export interface LineupSlot {
  slot: string;
  player: LineupPlayer | null;
}

/**
 * Best legal lineup from a set of players, filling dedicated slots before FLEX.
 *
 * Greedy by slot is not enough — taking the best RB for RB1 and RB2 can strand
 * a better flex option. We fill dedicated slots first, then give FLEX the best
 * remaining eligible players, which is optimal for this roster shape because
 * every flex-eligible position also has a dedicated slot of equal or higher
 * value.
 */
export function optimalLineup(players: LineupPlayer[]): {
  slots: LineupSlot[];
  total: number;
  bench: LineupPlayer[];
} {
  const pool = [...players].sort((a, b) => b.proj - a.proj);
  const used = new Set<string>();
  const slots: LineupSlot[] = [];

  for (const slot of STARTING_SLOTS) {
    if (slot === "FLEX") continue;
    const pick = pool.find((p) => !used.has(p.pid) && p.pos === slot);
    if (pick) used.add(pick.pid);
    slots.push({ slot, player: pick ?? null });
  }

  const flexCount = STARTING_SLOTS.filter((s) => s === "FLEX").length;
  for (let i = 0; i < flexCount; i++) {
    const pick = pool.find((p) => !used.has(p.pid) && FLEX_ELIGIBLE.includes(p.pos));
    if (pick) used.add(pick.pid);
    slots.push({ slot: "FLEX", player: pick ?? null });
  }

  // Present in roster order rather than fill order.
  const order = [...STARTING_SLOTS];
  slots.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));

  return {
    slots,
    total: Math.round(slots.reduce((s, x) => s + (x.player?.proj ?? 0), 0) * 100) / 100,
    bench: pool.filter((p) => !used.has(p.pid)),
  };
}
