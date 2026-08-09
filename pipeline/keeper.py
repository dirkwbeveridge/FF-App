"""
Which player should I keep in 2026?

The league's rule, confirmed on all 12 of the 2025 keepers without exception:
you keep a player one round earlier than where you drafted him last year. So
keeping is a trade — you give up that pick and get the player instead.

The right question is therefore never "who is my best player" but "for which
player does the gap between what he is worth and what that pick would otherwise
buy come out largest". A stud kept at his market price is worth nothing; a
mid-round pick who broke out is worth a fortune.

Writes data/derived/keeper.json
"""

import glob
import json
import os

from scoring import ROOT, load

DERIVED = os.path.join(ROOT, "data", "derived")
ME = "995451177204498432"
TEAMS = 12
REVERSAL = 3


def slot_picks(slot, teams=TEAMS, rounds=16, reversal=REVERSAL):
    out = []
    for rd in range(1, rounds + 1):
        forward = True if rd == 1 else (False if rd <= reversal else rd % 2 == 0)
        out.append((rd - 1) * teams + (slot if forward else teams - slot + 1))
    return out


def main():
    pool = json.load(open(os.path.join(DERIVED, "pool.json")))
    by_pid = {p["pid"]: p for p in pool["players"]}

    # My 2025 roster at season's end = the pool of players I could keep.
    rosters25 = load("2025/rosters.json", []) or []
    mine = next((r for r in rosters25 if r.get("owner_id") == ME), None)
    if not mine:
        raise SystemExit("could not find my 2025 roster")
    roster = set(mine.get("players") or [])

    # Where each was drafted in 2025 — that sets next year's price.
    picks25 = json.load(open(glob.glob(os.path.join(ROOT, "data/raw/2025/draft_*_picks.json"))[0]))
    drafted_round = {p["player_id"]: p["round"] for p in picks25}
    drafted_by = {p["player_id"]: p["roster_id"] for p in picks25}

    # 2026 keepers already declared by everyone else, so we know which of my
    # own picks are still live and who is off the board.
    d26 = json.load(open(glob.glob(os.path.join(ROOT, "data/raw/2026/draft_*_picks.json"))[0]))
    taken_2026 = {p["player_id"] for p in d26}

    my_slot = 10
    my_picks = slot_picks(my_slot)

    # Opportunity cost has to be measured in the SAME units as the keeper.
    # Comparing a 2026 projection against what picks historically *returned*
    # mixes a forecast with a realised outcome and inflates every surplus by
    # ~100 points — projections do not regress, results do. So the cost of a
    # keeper pick is the projected value of whoever is actually there at it.
    #
    # Board order is ADP with the already-declared keepers removed, since those
    # players never reach the board and everyone behind them slides up.
    board = sorted(
        [p for p in pool["players"] if p["adp"] and p["pid"] not in taken_2026],
        key=lambda p: p["adp"],
    )

    def value_at(pick_no):
        """Projected VORP of the player you would realistically get at this pick.

        Averaged over a small window because ADP is not a promise — the exact
        player at 10 varies, the tier does not."""
        i = pick_no - 1
        window = board[max(0, i - 2): i + 3]
        if not window:
            return None
        return round(sum(p["vorp"] for p in window) / len(window), 1)

    def name_at(pick_no):
        i = pick_no - 1
        return board[i]["name"] if i < len(board) else None

    rows = []
    for pid in roster:
        p = by_pid.get(pid)
        if not p:
            continue
        prev = drafted_round.get(pid)
        if prev is None:
            # Picked up in-season. Every keeper in league history was drafted
            # the prior year, so there is no precedent for what a waiver add
            # costs — flagged rather than guessed at.
            cost_round = None
        else:
            cost_round = max(1, prev - 1)

        cost_pick = my_picks[cost_round - 1] if cost_round else None
        alt = value_at(cost_pick) if cost_pick else None
        surplus = round(p["vorp"] - alt, 1) if (alt is not None) else None

        rows.append({
            "pid": pid,
            "name": p["name"],
            "pos": p["pos"],
            "team": p["team"],
            "proj": p["proj"],
            "vorp": p["vorp"],
            "adp": p["adp"],
            "pos_rank": p.get("pos_rank"),
            "drafted_2025_round": prev,
            "mine_in_2025_draft": drafted_by.get(pid) == mine["roster_id"],
            "keep_round": cost_round,
            "keep_pick": cost_pick,
            "pick_normally_worth": alt,
            "player_likely_there": name_at(cost_pick) if cost_pick else None,
            "surplus": surplus,
            "already_kept_by_other": pid in taken_2026,
        })

    eligible = [r for r in rows if r["keep_round"] and not r["already_kept_by_other"]]
    eligible.sort(key=lambda r: -(r["surplus"] if r["surplus"] is not None else -999))
    waiver = [r for r in rows if not r["keep_round"]]

    print("=" * 100)
    print("KEEPER OPTIONS — 2026  (cost = 2025 draft round minus one)")
    print("=" * 100)
    print(f"{'player':<22} {'pos':>5} {'VORP':>8} {'keep at':>11} {'that pick buys':>15} "
          f"{'worth':>7} {'SURPLUS':>9}")
    for r in eligible:
        alt = r["pick_normally_worth"]
        print(f"{r['name'][:21]:<22} {r['pos']+str(r['pos_rank'] or ''):>5} {r['vorp']:>+8.1f} "
              f"R{r['keep_round']:<2} (p{r['keep_pick']:<3}) {(r['player_likely_there'] or '-')[:15]:>15} "
              f"{alt if alt is not None else 0:>+7.1f} {r['surplus']:>+9.1f}")

    if waiver:
        print(f"\nAcquired in-season, so no prior draft round and no precedent for the cost:")
        for r in sorted(waiver, key=lambda r: -r["vorp"])[:12]:
            print(f"  {r['name'][:28]:<30} {r['pos']}  2026 proj {r['proj']:>6.1f}  VORP {r['vorp']:>+7.1f}")

    out = {"eligible": eligible, "waiver_acquired": waiver, "my_slot": my_slot,
           "my_picks": my_picks, "rule": "keep at prior-year round minus one"}
    path = os.path.join(DERIVED, "keeper.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
