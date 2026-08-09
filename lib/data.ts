import fs from "fs";
import path from "path";
import type { Analysis } from "./types";

const DERIVED = path.join(process.cwd(), "data", "derived");

let cached: Analysis | null = null;

/** Load the precomputed draft study. Built by `npm run data`. */
export function getAnalysis(): Analysis {
  if (!cached) {
    cached = JSON.parse(
      fs.readFileSync(path.join(DERIVED, "analysis.json"), "utf8"),
    ) as Analysis;
  }
  return cached;
}

export const LEAGUE = {
  name: "415 Football Club",
  teams: 12,
  rounds: 16,
  scoring: "Full PPR + 0.5 per first down, 6-pt passing TDs",
  lineup: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"],
  bench: 6,
  playoffTeams: 6,
  playoffStart: 15,
  leagueIds: {
    "2023": "992314411404591104",
    "2024": "1124402776542392320",
    "2025": "1240782642371104768",
    "2026": "1382449755451301888",
  } as Record<string, string>,
  me: { username: "dirkwbeveridge", userId: "995451177204498432" },
};

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function signed(n: number, digits = 0): string {
  const s = fmt(Math.abs(n), digits);
  return `${n >= 0 ? "+" : "−"}${s}`;
}

/** p-value formatted for a reader who needs to know how much to trust it. */
export function pLabel(p: number): { text: string; tone: "strong" | "weak" | "none" } {
  if (p < 0.01) return { text: `p<0.01`, tone: "strong" };
  if (p < 0.05) return { text: `p=${p.toFixed(3)}`, tone: "strong" };
  if (p < 0.15) return { text: `p=${p.toFixed(2)}`, tone: "weak" };
  return { text: `p=${p.toFixed(2)}`, tone: "none" };
}
