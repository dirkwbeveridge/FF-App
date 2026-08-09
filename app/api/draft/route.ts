import { NextResponse } from "next/server";
import { getAnalysis, LEAGUE } from "@/lib/data";
import type { Analysis, Pos } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SLEEPER = "https://api.sleeper.app/v1";
const SEASON = "2026";

async function sleeper<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SLEEPER}${path}`, {
      cache: "no-store",
      headers: { "User-Agent": "415FC-draft-assistant" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface SleeperDraft {
  draft_id: string;
  status: string;
  settings: { rounds: number; teams: number; reversal_round?: number };
  slot_to_roster_id: Record<string, number>;
  draft_order: Record<string, number> | null;
}

/**
 * Pick numbers owned by a slot, honouring the league's third-round reversal.
 * With reversal_round=3, round 3 repeats round 2's order rather than flipping
 * back, and every round from 4 on has inverted parity.
 */
function slotPicks(slot: number, teams: number, rounds: number, reversal: number): number[] {
  const out: number[] = [];
  for (let rd = 1; rd <= rounds; rd++) {
    const forward = rd === 1 ? true : rd <= reversal ? false : rd % 2 === 0;
    out.push((rd - 1) * teams + (forward ? slot : teams - slot + 1));
  }
  return out;
}

interface SleeperPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  player_id: string;
  picked_by: string;
  is_keeper: boolean | null;
  metadata: { first_name?: string; last_name?: string; position?: string; team?: string };
}

/**
 * Live state of the 2026 draft, joined to the model's recommendation for
 * whichever slot belongs to this manager.
 */
export async function GET() {
  const leagueId = LEAGUE.leagueIds[SEASON];
  const drafts = await sleeper<SleeperDraft[]>(`/league/${leagueId}/drafts`);
  const draft = drafts?.[0] ?? null;

  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "No 2026 draft found on Sleeper yet." },
      { status: 200 },
    );
  }

  const [picks, users] = await Promise.all([
    sleeper<SleeperPick[]>(`/draft/${draft.draft_id}/picks`),
    sleeper<{ user_id: string; display_name: string }[]>(`/league/${leagueId}/users`),
  ]);

  const A = getAnalysis();
  const teams = draft.settings?.teams ?? LEAGUE.teams;
  const rounds = draft.settings?.rounds ?? LEAGUE.rounds;
  const reversal = draft.settings?.reversal_round ?? 3;
  const made = picks ?? [];

  // Keepers are written into the board at the pick they cost, scattered through
  // the draft rather than filling it from pick 1. Counting picks made would put
  // the clock in the wrong place, so find the first pick number nobody holds.
  const taken = new Set(made.map((p) => p.pick_no));
  const total = teams * rounds;
  let nextPickNo = total + 1;
  for (let n = 1; n <= total; n++) {
    if (!taken.has(n)) {
      nextPickNo = n;
      break;
    }
  }

  // draft_order maps user_id -> slot. Absent until the commissioner sets it.
  const mySlot = draft.draft_order?.[LEAGUE.me.userId] ?? null;
  const myPicks = mySlot ? slotPicks(mySlot, teams, rounds, reversal) : [];
  const myPickSet = new Set(myPicks);

  const myRoster = made
    .filter((p) => p.picked_by === LEAGUE.me.userId || myPickSet.has(p.pick_no))
    .map((p) => ({
      pick_no: p.pick_no,
      round: p.round,
      name: `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim(),
      pos: (p.metadata?.position ?? "?") as Pos,
      team: p.metadata?.team,
      keeper: !!p.is_keeper,
    }));

  // Keepers already off the board change what is actually available.
  const keepers = made
    .filter((p) => p.is_keeper)
    .map((p) => ({
      pick_no: p.pick_no,
      round: p.round,
      slot: p.draft_slot,
      name: `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim(),
      pos: p.metadata?.position,
    }))
    .sort((a, b) => a.pick_no - b.pick_no);

  // Positional runs: how the board is moving right now.
  const goneByPos: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  made.forEach((p) => {
    const pos = p.metadata?.position;
    if (pos && pos in goneByPos) goneByPos[pos] += 1;
  });
  const last12 = made.slice(-12);
  const recentByPos: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  last12.forEach((p) => {
    const pos = p.metadata?.position;
    if (pos && pos in recentByPos) recentByPos[pos] += 1;
  });

  const myNextPick = myPicks.find((n) => n >= nextPickNo && !taken.has(n)) ?? null;
  const myNextRound = myNextPick ? Math.ceil(myNextPick / teams) : null;

  // What the model says about the round my next pick falls in, plus how far
  // the historical pace is from what is actually happening on the board.
  const curve: NonNullable<Analysis["shrunk_curve"]> = A.shrunk_curve ?? {};
  const guidance = myNextRound
    ? (["QB", "RB", "WR", "TE"] as Pos[])
        .map((pos) => ({
          pos,
          value: curve[myNextRound]?.[pos]?.shrunk ?? null,
          typicalGone: A.draft_flow[pos]?.[Math.min(nextPickNo, 192)] ?? null,
          actuallyGone: goneByPos[pos],
        }))
        .filter((g) => g.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    : [];

  const plan = mySlot ? A.optimal_by_slot[String(mySlot)] : null;

  return NextResponse.json({
    ok: true,
    draft: {
      id: draft.draft_id,
      status: draft.status,
      teams,
      rounds,
      orderSet: !!draft.draft_order,
    },
    mySlot,
    myPicks,
    myNextPick,
    myNextRound,
    nextPickNo,
    picksMade: made.length,
    myRoster,
    keepers,
    goneByPos,
    recentByPos,
    guidance,
    plan: plan
      ? { sequence: plan.best.sequence, picks: plan.picks, value: plan.best.mean }
      : null,
    recent: made.slice(-10).reverse().map((p) => ({
      pick_no: p.pick_no,
      round: p.round,
      slot: p.draft_slot,
      name: `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim(),
      pos: p.metadata?.position,
      by: users?.find((u) => u.user_id === p.picked_by)?.display_name ?? null,
    })),
  });
}
