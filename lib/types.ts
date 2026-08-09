export type Pos = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export const SKILL: Pos[] = ["QB", "RB", "WR", "TE"];

export interface ScarcityRow {
  j: number;
  n: number;
  vorp_mean: number;
  vorp_sd: number;
  pts_mean: number;
  samples: number[];
  avg_pick: number;
}

export interface RoundPosRow {
  round: number;
  pos: Pos;
  n: number;
  vorp_mean: number;
  vorp_median: number;
  vorp_weighted: number;
  vorp_shrunk?: number;
  pts_mean: number;
  resid_vorp: number;
  hit_rate: number;
  bust_rate: number;
  starter_pts: number;
  weeks_started: number;
}

export interface TeamProfile {
  season: string;
  roster_id: number;
  owner: string;
  slot: number;
  wins: number;
  losses: number;
  win_pct: number;
  pts_for: number;
  seed: number;
  made_playoffs: boolean;
  final_place: number | null;
  is_champion: boolean;
  is_runner_up: boolean;
  efficiency: number;
  seq6: string;
  seq8: string;
  rb4: number; wr4: number; te4: number; qb4: number;
  rb6: number; wr6: number; te6: number; qb6: number;
  rb8: number; wr8: number; te8: number; qb8: number;
  rb_total: number; wr_total: number; te_total: number; qb_total: number;
  qb_round: number;
  te_round: number;
  k_round: number;
  def_round: number;
  draft_starter_pts: number;
  draft_vorp: number;
  top3_vorp: number;
  top5_vorp: number;
  elite_hits: number;
  early_busts: number;
  hit_rate_top6: number;
}

export interface PickGrade {
  season: string;
  pick_no: number;
  round: number;
  slot: number;
  owner: string;
  name: string;
  pos: Pos;
  pos_label: string | null;
  pts_reg: number;
  vorp: number;
  residual_vorp: number;
  residual: number;
  pts_as_starter: number;
  weeks_started: number;
  is_keeper: boolean;
  best_available: string | null;
  best_available_pts: number;
  points_left_on_board: number;
  final_place: number | null;
  is_champion: boolean;
}

export interface Miss {
  season: string;
  pick_no: number;
  round: number;
  owner: string;
  took: string;
  took_vorp: number;
  pos: Pos;
  instead_of: string;
  instead_pick: number;
  instead_vorp: number;
  gap: number;
}

export interface Correlation {
  var: string;
  label: string;
  pts_for: { r: number; p: number };
  win_pct: { r: number; p: number };
}

export interface Strategy {
  strategy: string;
  n: number;
  avg_pts: number;
  avg_win_pct: number;
  playoff_rate: number;
  champs: number;
  finals?: number;
  teams?: string[];
}

export interface SlotHistory {
  slot: number;
  n: number;
  avg_pts: number;
  avg_win_pct: number;
  playoff_rate: number;
  champs: number;
  owners: string[];
}

export interface OptimalPlan {
  sequence: Pos[];
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export interface SlotOptimum {
  picks: number[];
  best: OptimalPlan;
  alternatives: OptimalPlan[];
}

export interface Analysis {
  meta: {
    seasons: string[];
    n_teams: number;
    rounds: number;
    n_team_seasons: number;
    n_picks: number;
    starter_demand: Record<string, number>;
    replacement_baselines: Record<string, number>;
    replacement_points?: Record<string, Record<string, number>>;
    waiver_blend?: number;
    objective_validation: { r: number; p: number };
    calibration?: Record<string, unknown>;
    reliability?: Record<string, number>;
  };
  scarcity: Record<Pos, ScarcityRow[]>;
  draft_flow: Record<Pos, number[]>;
  round_position: RoundPosRow[];
  best_by_round: Record<string, RoundPosRow[]>;
  positional_edge_by_round: Record<string, Record<Pos, number>>;
  profiles: TeamProfile[];
  correlations: Correlation[];
  pick_grades: PickGrade[];
  biggest_misses: Miss[];
  cohorts: Record<string, Record<string, number>>;
  strategies: Strategy[];
  strategies_simple: Strategy[];
  slots: SlotHistory[];
  optimal_by_slot: Record<string, SlotOptimum>;
  expectation_curve: Record<string, number>;
  expectation_curve_vorp: Record<string, number>;
  /** Per-round value the optimizer reasons over: raw pick-conditional vs shrunk. */
  shrunk_curve?: Record<string, Record<string, CurvePoint>>;
  named_strategies?: Record<string, NamedStrategy>;
}

export interface CurvePoint {
  raw: number | null;
  shrunk: number | null;
}

export interface NamedStrategy {
  sequence: Pos[];
  by_slot: Record<string, number>;
}

export const POS_COLOR: Record<string, string> = {
  QB: "var(--color-qb)",
  RB: "var(--color-rb)",
  WR: "var(--color-wr)",
  TE: "var(--color-te)",
  K: "var(--color-k)",
  DEF: "var(--color-def)",
};

export const POS_BG: Record<string, string> = {
  QB: "color-mix(in srgb, var(--color-qb) 18%, transparent)",
  RB: "color-mix(in srgb, var(--color-rb) 18%, transparent)",
  WR: "color-mix(in srgb, var(--color-wr) 18%, transparent)",
  TE: "color-mix(in srgb, var(--color-te) 18%, transparent)",
  K: "color-mix(in srgb, var(--color-k) 14%, transparent)",
  DEF: "color-mix(in srgb, var(--color-def) 14%, transparent)",
};
