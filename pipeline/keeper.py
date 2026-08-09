"""
Which player should I keep in 2026?

Three rules govern it, and all three are checkable against league history rather
than taken on faith:

1. A keeper costs the round he was drafted in last year, minus one. True of all
   20 keepers the league has ever declared (12 in 2025, 8 so far in 2026) with
   no exception.
2. He has to have been on your roster at the end of last season. Seven of my 16
   picks were gone by week 17 and none of them are available to me.
3. There is no round zero, so a player kept at round 1 cannot be kept again.
   That is what rules out Gibbs: he cost a 1st this year. Note the league does
   allow keeping the same player two years running in general — Bowers, Chase
   Brown, Bucky Irving and Jayden Daniels were all kept in both 2025 and 2026 —
   so the round-1 floor, not repetition, is the binding constraint.

The decision itself is a trade: you hand back a pick and get the player instead.
So the question is never "who is my best player" but "for which player is the
gap between what he is worth and what that pick would otherwise buy largest".
A stud kept at his market price is worth nothing; a late pick who broke out is
worth a fortune.

Writes data/derived/keeper.json
"""

import glob
import json
import os

from scoring import ROOT, load

DERIVED = os.path.join(ROOT, "data", "derived")
ME = "995451177204498432"
TEAMS = 12
ROUNDS = 16
REVERSAL = 3

# The declared keeper for 2026. Single source of truth: the app reads it from
# keeper.json and strategy.py plans the draft around it. Set to None to go back
# to weighing the options rather than having decided.
CHOSEN_PID = "11560"  # Caleb Williams, QB CHI — kept at round 10, pick 118


def slot_picks(slot, teams=TEAMS, rounds=ROUNDS, reversal=REVERSAL):
    out = []
    for rd in range(1, rounds + 1):
        forward = True if rd == 1 else (False if rd <= reversal else rd % 2 == 0)
        out.append((rd - 1) * teams + (slot if forward else teams - slot + 1))
    return out


def label(pick_no, teams=TEAMS):
    """Sleeper's round.pick notation — the 2.7 / 3.7 form on the draft screen."""
    rd = (pick_no - 1) // teams + 1
    return f"{rd}.{pick_no - (rd - 1) * teams}"


def main():
    pool = json.load(open(os.path.join(DERIVED, "pool.json")))
    by_pid = {p["pid"]: p for p in pool["players"]}
    names = {}

    def raw_name(pid):
        m = names.get(pid) or {}
        return (m.get("full_name")
                or f"{m.get('first_name', '')} {m.get('last_name', '')}".strip()
                or pid)

    names = json.load(open(os.path.join(ROOT, "data/raw/players.json")))

    # --- rule 2: who was actually still mine when the season ended -----------
    # rosters.json is the live roster of a league that is now complete, so it is
    # the end-of-season state. Cross-checked against the week-17 matchup feed,
    # which lists the same 17 players exactly.
    rosters25 = load("2025/rosters.json", []) or []
    mine = next((r for r in rosters25 if r.get("owner_id") == ME), None)
    if not mine:
        raise SystemExit("could not find my 2025 roster")
    my_rid = mine["roster_id"]
    eoy_roster = set(mine.get("players") or [])

    # --- what I drafted in 2025, which sets every price ---------------------
    picks25 = json.load(open(glob.glob(os.path.join(ROOT, "data/raw/2025/draft_*_picks.json"))[0]))
    my_2025 = sorted([p for p in picks25 if p["roster_id"] == my_rid], key=lambda p: p["pick_no"])

    # --- 2026 keepers everyone else has already declared --------------------
    d26 = json.load(open(glob.glob(os.path.join(ROOT, "data/raw/2026/draft_*_picks.json"))[0]))
    taken_2026 = {p["player_id"] for p in d26}
    keeper_picks_before = sorted(p["pick_no"] for p in d26)

    my_slot = 10
    my_picks = slot_picks(my_slot)

    # --- what a pick is otherwise worth -------------------------------------
    # Measured in the same units as the keeper: a 2026 projection against a 2026
    # projection. Comparing a forecast to what picks historically *returned*
    # mixes a forecast with a realised outcome and inflates every surplus by
    # ~100 points, because projections do not regress and results do.
    board = sorted(
        [p for p in pool["players"] if p["adp"] and p["pid"] not in taken_2026],
        key=lambda p: p["adp"],
    )

    def board_index(pick_no):
        """How far down the board you actually are at this pick.

        pick_no - 1 picks have already happened, but the declared keepers among
        them never came off the board, so they do not push you down it."""
        used_keepers = sum(1 for k in keeper_picks_before if k < pick_no)
        return max(0, pick_no - 1 - used_keepers)

    def value_at(pick_no):
        """Projected VORP of whoever is realistically there.

        Averaged over a small window because ADP is not a promise — the exact
        player at a given pick varies, the tier does not."""
        i = board_index(pick_no)
        window = board[max(0, i - 2): i + 3]
        if not window:
            return None
        return round(sum(p["vorp"] for p in window) / len(window), 1)

    def name_at(pick_no):
        i = board_index(pick_no)
        return board[i]["name"] if i < len(board) else None

    rows = []
    for pk in my_2025:
        pid = pk["player_id"]
        prev = pk["round"]
        p = by_pid.get(pid)
        on_roster = pid in eoy_roster
        was_kept_at_r1 = bool(pk.get("is_keeper")) and prev == 1

        row = {
            "pid": pid,
            "name": p["name"] if p else raw_name(pid),
            "pos": p["pos"] if p else (names.get(pid, {}) or {}).get("position", "?"),
            "team": p["team"] if p else None,
            "pos_rank": (p or {}).get("pos_rank"),
            "proj": (p or {}).get("proj"),
            "vorp": (p or {}).get("vorp"),
            "adp": (p or {}).get("adp"),
            "drafted_2025_round": prev,
            "drafted_2025_pick": pk["pick_no"],
            "drafted_2025_label": label(pk["pick_no"]),
            "was_keeper_2025": bool(pk.get("is_keeper")),
            "on_roster_at_seasons_end": on_roster,
        }

        # Eligibility, in the order the rules actually bite.
        if not on_roster:
            row.update(eligible=False, reason="off your roster before the season ended")
        elif was_kept_at_r1:
            row.update(eligible=False,
                       reason="you kept him last year at round 1 — there is no round 0 to keep him at")
        elif pid in taken_2026:
            row.update(eligible=False, reason="already declared as another manager's keeper")
        elif p is None:
            row.update(eligible=False, reason="no 2026 projection — not in the draftable pool")
        else:
            row.update(eligible=True, reason=None)

        if row["eligible"]:
            cost_round = prev - 1
            cost_pick = my_picks[cost_round - 1]
            alt = value_at(cost_pick)
            row.update(
                keep_round=cost_round,
                keep_pick=cost_pick,
                keep_label=label(cost_pick),
                pick_normally_worth=alt,
                player_likely_there=name_at(cost_pick),
                surplus=round(p["vorp"] - alt, 1) if alt is not None else None,
                # If the market says he lasts past your keeper pick, you could
                # simply draft him there and keep someone else instead.
                would_last_to_keep_pick=bool(p["adp"] and p["adp"] > cost_pick),
            )
        else:
            row.update(keep_round=None, keep_pick=None, keep_label=None,
                       pick_normally_worth=None, player_likely_there=None,
                       surplus=None, would_last_to_keep_pick=None)
        rows.append(row)

    eligible = sorted([r for r in rows if r["eligible"]],
                      key=lambda r: -(r["surplus"] if r["surplus"] is not None else -999))
    ineligible = [r for r in rows if not r["eligible"]]

    # --- does the answer survive a different replacement convention? --------
    # VORP is only as meaningful as its baseline, and the app's blended one sits
    # deep (QB28, RB41, WR62, TE27) because it splits the difference with waiver
    # churn. A quarterback gains most from a deep baseline, so a QB keeper is
    # exactly the case where the convention could be doing the work. Re-ranking
    # against the strict last-forced-starter line — the Nth best at each
    # position where N is what the league actually starts each week, measured
    # over 36 team-seasons — is the honest check. Both baselines must move
    # together: shifting only the QB line while the board stays put is the
    # mistake that flips the answer.
    baseline_app = json.load(open(os.path.join(DERIVED, "pool.json"))).get("baseline") or {}
    rep = json.load(open(os.path.join(DERIVED, "replacement.json")))
    team_weeks = 504  # 36 team-seasons x 14 regular-season weeks
    starts_per_team_week = {
        pos: (rep[pos]["drafted_starts"] + rep[pos]["waiver_starts"]) / team_weeks for pos in rep
    }

    def nth_projection(pos, n):
        ranked = sorted([x for x in pool["players"] if x["pos"] == pos and x["adp"]],
                        key=lambda x: -x["proj"])
        return ranked[min(n, len(ranked)) - 1]["proj"] if ranked else None

    strict_rank = {pos: round(v * TEAMS) for pos, v in starts_per_team_week.items()}
    baseline_strict = {pos: nth_projection(pos, n) for pos, n in strict_rank.items()}

    def rank_under(base):
        def vorp(p):
            b = base.get(p["pos"], baseline_app.get(p["pos"], 0))
            return p["proj"] - b
        out = []
        for r in eligible:
            i = board_index(r["keep_pick"])
            window = board[max(0, i - 2): i + 3]
            alt = sum(vorp(x) for x in window) / len(window)
            out.append({"name": r["name"], "pos": r["pos"], "pid": r["pid"],
                        "surplus": round(vorp(by_pid[r["pid"]]) - alt, 1)})
        return sorted(out, key=lambda r: -r["surplus"])

    sensitivity = {
        "starts_per_team_week": {k: round(v, 2) for k, v in starts_per_team_week.items()},
        "baseline_app": baseline_app,
        "baseline_strict": {k: round(v, 1) for k, v in baseline_strict.items() if v},
        "strict_rank": strict_rank,
        "ranking_app": rank_under(baseline_app),
        "ranking_strict": rank_under(baseline_strict),
    }
    sensitivity["agrees"] = (
        sensitivity["ranking_app"][0]["pid"] == sensitivity["ranking_strict"][0]["pid"]
        if sensitivity["ranking_app"] and sensitivity["ranking_strict"] else None
    )

    # Players who finished the season on my roster but were never my draft picks
    # cannot be kept — there is no round to price them from.
    acquired = []
    my_drafted = {p["player_id"] for p in my_2025}
    for pid in eoy_roster - my_drafted:
        p = by_pid.get(pid)
        acquired.append({
            "pid": pid,
            "name": p["name"] if p else raw_name(pid),
            "pos": p["pos"] if p else (names.get(pid, {}) or {}).get("position", "?"),
            "proj": (p or {}).get("proj"),
            "vorp": (p or {}).get("vorp"),
        })
    acquired.sort(key=lambda r: -(r["vorp"] if r["vorp"] is not None else -999))

    w = 24
    print("=" * 104)
    print("KEEPER OPTIONS — 2026   (cost = 2025 round minus one; slot %d)" % my_slot)
    print("=" * 104)
    print(f"{'player':<{w}} {'pos':>5} {'2025':>6} {'keep at':>10} {'VORP':>8} "
          f"{'that pick buys':>16} {'worth':>7} {'SURPLUS':>9}")
    for r in eligible:
        print(f"{r['name'][:w-1]:<{w}} {str(r['pos']) + str(r['pos_rank'] or ''):>5} "
              f"{r['drafted_2025_label']:>6} {'R%d (%s)' % (r['keep_round'], r['keep_label']):>10} "
              f"{r['vorp']:>+8.1f} {(r['player_likely_there'] or '-')[:16]:>16} "
              f"{r['pick_normally_worth']:>+7.1f} {r['surplus']:>+9.1f}"
              + ("   <- ADP says he lasts to that pick anyway" if r["would_last_to_keep_pick"] else ""))

    print(f"\nNot eligible:")
    for r in sorted(ineligible, key=lambda r: r["drafted_2025_round"]):
        print(f"  {r['drafted_2025_label']:>5}  {r['name'][:w]:<{w+1}} {r['reason']}")

    if acquired:
        print(f"\nFinished the season on my roster but were never my draft picks, "
              f"so there is no round to price them from:")
        for r in acquired[:12]:
            proj = r["proj"] if r["proj"] is not None else float("nan")
            print(f"  {r['name'][:28]:<30} {r['pos']}  2026 proj {proj:>6.1f}")

    print("\nSame question under the strict last-forced-starter baseline "
          f"({', '.join(f'{p}{n}' for p, n in sorted(strict_rank.items()))}):")
    for r in sensitivity["ranking_strict"]:
        print(f"   {r['surplus']:>+8.1f}  {r['name'][:22]:<24} {r['pos']}")
    print("   -> both conventions agree on the pick"
          if sensitivity["agrees"] else "   -> THE CONVENTIONS DISAGREE — decide on other grounds")

    chosen = next((r for r in eligible if r["pid"] == CHOSEN_PID), None)
    if CHOSEN_PID and not chosen:
        raise SystemExit(f"CHOSEN_PID {CHOSEN_PID} is not an eligible keeper")
    if chosen:
        print(f"\nDECLARED: keeping {chosen['name']} at R{chosen['keep_round']}, "
              f"pick {chosen['keep_pick']}")

    out = {
        "chosen": chosen,
        "eligible": eligible,
        "ineligible": ineligible,
        "acquired_not_drafted": acquired,
        "sensitivity": sensitivity,
        "my_slot": my_slot,
        "my_picks": my_picks,
        "rule": "keep at prior-year round minus one; must have finished the season on your roster; no round 0",
    }
    path = os.path.join(DERIVED, "keeper.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
