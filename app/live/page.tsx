import { getAnalysis } from "@/lib/data";
import LiveDraft from "@/components/live-draft";
import type { Pos } from "@/lib/types";

export const metadata = { title: "Live Draft — Bud Iceman" };

const SKILL: Pos[] = ["QB", "RB", "WR", "TE"];

/**
 * Reads the study at build time and hands the live view only the slices it
 * needs — the value curve, the historical positional pace, and the per-slot
 * plans. Shipping the whole 380KB analysis to a phone would be wasteful.
 */
export default function LivePage() {
  const A = getAnalysis();
  const curve = A.shrunk_curve ?? {};

  const valueByRound: Record<number, Partial<Record<Pos, number>>> = {};
  Object.entries(curve).forEach(([rd, row]) => {
    const out: Partial<Record<Pos, number>> = {};
    SKILL.forEach((p) => {
      const v = row?.[p]?.shrunk;
      if (v != null) out[p] = v;
    });
    valueByRound[Number(rd)] = out;
  });

  const plans: Record<number, { sequence: string[]; picks: number[]; value: number }> = {};
  Object.entries(A.optimal_by_slot).forEach(([slot, o]) => {
    plans[Number(slot)] = {
      sequence: o.best.sequence,
      picks: o.picks,
      value: o.best.mean,
    };
  });

  return (
    <LiveDraft
      valueByRound={valueByRound}
      draftFlow={A.draft_flow}
      plans={plans}
    />
  );
}
