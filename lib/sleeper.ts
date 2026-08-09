/**
 * Browser-side Sleeper client.
 *
 * On GitHub Pages there is no server to proxy through, so the live draft page
 * talks to Sleeper directly. Sleeper returns `access-control-allow-origin: *`
 * on its public v1 endpoints, which is what makes this possible at all.
 */

const SLEEPER = "https://api.sleeper.app/v1";

export const LEAGUE_2026 = "1382449755451301888";
export const ME = { username: "dirkwbeveridge", userId: "995451177204498432" };

export interface SleeperDraft {
  draft_id: string;
  status: string;
  settings: { rounds: number; teams: number; reversal_round?: number };
  draft_order: Record<string, number> | null;
}

export interface SleeperPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  player_id: string;
  picked_by: string;
  is_keeper: boolean | null;
  metadata: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SLEEPER}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Pick numbers owned by a slot, honouring the league's third-round reversal.
 * With reversal_round=3, round 3 repeats round 2's order rather than flipping
 * back, and every round from 4 on has inverted parity. Verified against all
 * three completed drafts.
 */
export function slotPicks(
  slot: number,
  teams: number,
  rounds: number,
  reversal: number,
): number[] {
  const out: number[] = [];
  for (let rd = 1; rd <= rounds; rd++) {
    const forward = rd === 1 ? true : rd <= reversal ? false : rd % 2 === 0;
    out.push((rd - 1) * teams + (forward ? slot : teams - slot + 1));
  }
  return out;
}

export interface DraftSnapshot {
  draftId: string;
  status: string;
  teams: number;
  rounds: number;
  orderSet: boolean;
  mySlot: number | null;
  myPicks: number[];
  myNextPick: number | null;
  myNextRound: number | null;
  nextPickNo: number;
  picksMade: number;
  myRoster: {
    pick_no: number;
    round: number;
    name: string;
    pos: string;
    team?: string;
    keeper: boolean;
  }[];
  keepers: {
    pick_no: number;
    round: number;
    slot: number;
    name: string;
    pos?: string;
  }[];
  goneByPos: Record<string, number>;
  recent: {
    pick_no: number;
    round: number;
    name: string;
    pos?: string;
    by: string | null;
  }[];
}

/** Every pick on the 2026 board with the slot that made it. */
export async function loadAllPicks(): Promise<
  { pid: string; slot: number; pickNo: number; isKeeper: boolean }[]
> {
  const drafts = await get<SleeperDraft[]>(`/league/${LEAGUE_2026}/drafts`);
  const draft = drafts?.[0];
  if (!draft) return [];
  const picks = await get<SleeperPick[]>(`/draft/${draft.draft_id}/picks`);
  return (picks ?? []).map((p) => ({
    pid: p.player_id,
    slot: p.draft_slot,
    pickNo: p.pick_no,
    isKeeper: !!p.is_keeper,
  }));
}

export async function loadDraft(): Promise<DraftSnapshot | { error: string }> {
  const drafts = await get<SleeperDraft[]>(`/league/${LEAGUE_2026}/drafts`);
  const draft = drafts?.[0];
  if (!draft) return { error: "No 2026 draft found on Sleeper yet." };

  const [picks, users] = await Promise.all([
    get<SleeperPick[]>(`/draft/${draft.draft_id}/picks`),
    get<SleeperUser[]>(`/league/${LEAGUE_2026}/users`),
  ]);

  const teams = draft.settings?.teams ?? 12;
  const rounds = draft.settings?.rounds ?? 16;
  const reversal = draft.settings?.reversal_round ?? 3;
  const made = picks ?? [];

  // Keepers sit at the pick they cost, scattered through the board rather than
  // filling it from pick 1 — so the clock is the first pick nobody holds, not
  // the count of picks made.
  const taken = new Set(made.map((p) => p.pick_no));
  const total = teams * rounds;
  let nextPickNo = total + 1;
  for (let n = 1; n <= total; n++) {
    if (!taken.has(n)) {
      nextPickNo = n;
      break;
    }
  }

  const mySlot = draft.draft_order?.[ME.userId] ?? null;
  const myPicks = mySlot ? slotPicks(mySlot, teams, rounds, reversal) : [];
  const myPickSet = new Set(myPicks);

  const name = (p: SleeperPick) =>
    `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim();

  const goneByPos: Record<string, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DEF: 0,
  };
  made.forEach((p) => {
    const pos = p.metadata?.position;
    if (pos && pos in goneByPos) goneByPos[pos] += 1;
  });

  return {
    draftId: draft.draft_id,
    status: draft.status,
    teams,
    rounds,
    orderSet: !!draft.draft_order,
    mySlot,
    myPicks,
    myNextPick: myPicks.find((n) => n >= nextPickNo && !taken.has(n)) ?? null,
    myNextRound: (() => {
      const n = myPicks.find((x) => x >= nextPickNo && !taken.has(x));
      return n ? Math.ceil(n / teams) : null;
    })(),
    nextPickNo,
    picksMade: made.length,
    myRoster: made
      .filter((p) => p.picked_by === ME.userId || myPickSet.has(p.pick_no))
      .sort((a, b) => a.pick_no - b.pick_no)
      .map((p) => ({
        pick_no: p.pick_no,
        round: p.round,
        name: name(p),
        pos: p.metadata?.position ?? "?",
        team: p.metadata?.team,
        keeper: !!p.is_keeper,
      })),
    keepers: made
      .filter((p) => p.is_keeper)
      .sort((a, b) => a.pick_no - b.pick_no)
      .map((p) => ({
        pick_no: p.pick_no,
        round: p.round,
        slot: p.draft_slot,
        name: name(p),
        pos: p.metadata?.position,
      })),
    goneByPos,
    recent: made
      .slice()
      .sort((a, b) => b.pick_no - a.pick_no)
      .slice(0, 10)
      .map((p) => ({
        pick_no: p.pick_no,
        round: p.round,
        name: name(p),
        pos: p.metadata?.position,
        by: users?.find((u) => u.user_id === p.picked_by)?.display_name ?? null,
      })),
  };
}
