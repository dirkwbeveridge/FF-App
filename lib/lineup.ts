/**
 * Turning a projection into a lineup decision.
 *
 * Measured against three seasons of this league (pipeline/projections.py),
 * Sleeper's weekly projections are:
 *
 *   RB  r=0.69   WR  r=0.62   TE  r=0.60   QB  r=0.39
 *
 * and they run optimistic by about a point at RB and WR. A quarterback
 * projection correlates 0.39 with the outcome, which is barely better than a
 * coin flip — so this module corrects the known bias, and never presents a
 * projection as a single number when the spread around it is the actual
 * decision. A receiver projected for 16 lands between 3.8 and 25.1 four times
 * out of five.
 */

import model from "@/data/derived/projection_model.json";
import { STARTING_SLOTS, FLEX_ELIGIBLE } from "./season";

type Tier = {
  lo: number;
  hi: number;
  n: number;
  bias: number;
  sd: number;
  p10: number;
  median: number;
  p90: number;
};

const TIERS = model.tiers as Record<string, Tier[]>;
const BY_POS = model.by_position as Record<
  string,
  { bias: number; sd: number; r: number; rmse: number; bust_rate: number; boom_rate: number }
>;

export const PROJECTION_QUALITY = BY_POS;

function tierFor(pos: string, proj: number): Tier | null {
  const rows = TIERS[pos];
  if (!rows?.length) return null;
  return rows.find((t) => proj >= t.lo && proj < t.hi) ?? rows[rows.length - 1];
}

export interface Outlook {
  /** Bias-corrected expected points in league scoring. */
  mean: number;
  /** 10th and 90th percentile outcomes — the range you are really choosing between. */
  floor: number;
  ceiling: number;
  sd: number;
  /** Raw projection before correction, so the adjustment is auditable. */
  raw: number;
}

/**
 * Bias-correct a projection and attach the outcome spread its tier has
 * historically produced. Percentiles are shifted with the projection inside the
 * tier rather than taken flat, so a 17-point receiver is not given the same
 * floor as a 14-point one.
 */
export function outlook(pos: string, raw: number): Outlook {
  const t = tierFor(pos, raw);
  const bias = t ? t.bias : (BY_POS[pos]?.bias ?? 0);
  const sd = t ? t.sd : (BY_POS[pos]?.sd ?? 6);
  const mean = Math.max(0, raw + bias);
  const shift = t ? mean - (t.median || mean) : 0;
  return {
    raw: Math.round(raw * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    floor: Math.round(Math.max(0, (t ? t.p10 + shift : mean - 1.28 * sd)) * 10) / 10,
    ceiling: Math.round((t ? t.p90 + shift : mean + 1.28 * sd) * 10) / 10,
    sd: Math.round(sd * 10) / 10,
  };
}

export interface Candidate {
  pid: string;
  name: string;
  pos: string;
  team: string | null;
  opponent: string | null;
  injury: string | null;
  outlook: Outlook;
}

export interface Slotted {
  slot: string;
  player: Candidate | null;
}

/**
 * Fill dedicated slots first, then FLEX from the best remaining eligible
 * players. `key` decides what "best" means: expected points normally, floor
 * when protecting a lead, ceiling when chasing one.
 */
export function buildLineup(
  players: Candidate[],
  key: (c: Candidate) => number,
): { slots: Slotted[]; bench: Candidate[]; total: number } {
  const pool = [...players].sort((a, b) => key(b) - key(a));
  const used = new Set<string>();
  const slots: Slotted[] = [];

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
  const order = [...STARTING_SLOTS];
  slots.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));

  return {
    slots,
    bench: pool.filter((p) => !used.has(p.pid)),
    total: Math.round(slots.reduce((s, x) => s + (x.player?.outlook.mean ?? 0), 0) * 10) / 10,
  };
}

/** Normal CDF — good enough for a win-probability read on a 10-player sum. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export interface Matchup {
  mean: number;
  sd: number;
}

/** Probability my lineup outscores theirs, treating both totals as normal. */
export function winProbability(me: Matchup, them: Matchup): number {
  const sd = Math.sqrt(me.sd ** 2 + them.sd ** 2) || 1;
  return phi((me.mean - them.mean) / sd);
}

export function lineupSpread(slots: Slotted[]): Matchup {
  const players = slots.map((s) => s.player).filter((p): p is Candidate => !!p);
  const mean = players.reduce((s, p) => s + p.outlook.mean, 0);
  // Independent enough week to week that summing variances is a fair
  // approximation; correlated stacks would tighten this slightly.
  const sd = Math.sqrt(players.reduce((s, p) => s + p.outlook.sd ** 2, 0));
  return { mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10 };
}

export type Posture = "balanced" | "floor" | "ceiling";

/**
 * Which lineup to actually field.
 *
 * Maximising expected points is only right when the matchup is close. A heavy
 * favourite should cut variance — it is already winning the average case and
 * only loses by blowing up. A heavy underdog should do the opposite and chase
 * the tail, because the average case already loses. This is the part no
 * generic ranking can do for you: it depends on who you are playing this week.
 */
export function recommend(
  players: Candidate[],
  opponent: Matchup | null,
): {
  posture: Posture;
  reason: string;
  lineup: ReturnType<typeof buildLineup>;
  winProb: number | null;
  alternatives: { posture: Posture; total: number; winProb: number | null }[];
} {
  const byMean = buildLineup(players, (c) => c.outlook.mean);
  const byFloor = buildLineup(players, (c) => c.outlook.floor);
  const byCeiling = buildLineup(players, (c) => c.outlook.ceiling);

  const wp = (l: ReturnType<typeof buildLineup>) =>
    opponent ? winProbability(lineupSpread(l.slots), opponent) : null;

  const options: { posture: Posture; lineup: typeof byMean; winProb: number | null }[] = [
    { posture: "balanced", lineup: byMean, winProb: wp(byMean) },
    { posture: "floor", lineup: byFloor, winProb: wp(byFloor) },
    { posture: "ceiling", lineup: byCeiling, winProb: wp(byCeiling) },
  ];

  if (!opponent) {
    return {
      posture: "balanced",
      reason: "No opponent set yet, so this maximises expected points.",
      lineup: byMean,
      winProb: null,
      alternatives: options
        .filter((o) => o.posture !== "balanced")
        .map((o) => ({ posture: o.posture, total: o.lineup.total, winProb: o.winProb })),
    };
  }

  // Pick whichever posture actually wins most often — the direct objective,
  // rather than inferring it from a favourite/underdog rule of thumb.
  options.sort((a, b) => (b.winProb ?? 0) - (a.winProb ?? 0));
  const best = options[0];
  const base = options.find((o) => o.posture === "balanced")!;
  const edge = ((best.winProb ?? 0) - (base.winProb ?? 0)) * 100;

  const reason =
    best.posture === "balanced" || edge < 0.5
      ? "The matchup is close enough that maximising expected points is also the best way to win it."
      : best.posture === "floor"
        ? `You are favoured, so the safer lineup wins more often — it gives up ${(
            base.lineup.total - best.lineup.total
          ).toFixed(1)} expected points to cut the chance of a blow-up.`
        : `You are the underdog, so the higher-variance lineup wins more often — the average case already loses, and this buys a bigger tail.`;

  return {
    posture: best.posture,
    reason,
    lineup: best.lineup,
    winProb: best.winProb,
    alternatives: options
      .filter((o) => o.posture !== best.posture)
      .map((o) => ({ posture: o.posture, total: o.lineup.total, winProb: o.winProb })),
  };
}
