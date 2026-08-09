"""
Would the start/sit tool have actually helped?

Replays every week of every completed season: for each team, compare what they
really started against what the tool would have told them to start, using only
the projections that existed at the time. Then converts the point difference
into the thing that matters — games won.

This is the same check the draft model got. A tool that cannot beat the manager
it is advising is not worth opening on a Sunday.
"""

import json
import os
import statistics
from collections import defaultdict

from scoring import RAW, ROOT, league_scoring, load, score_player

DERIVED = os.path.join(ROOT, "data", "derived")
SEASONS = ["2023", "2024", "2025"]
REG_WEEKS = list(range(1, 15))
LINEUP = ["QB", "RB", "RB", "WR", "WR", "TE", "K", "DEF"]
N_FLEX = 2
FLEX_OK = {"RB", "WR", "TE"}

MODEL = json.load(open(os.path.join(DERIVED, "projection_model.json")))
TIERS = MODEL["tiers"]
BY_POS = MODEL["by_position"]


def corrected(pos, raw):
    """Same bias correction the app applies, so we test what ships."""
    rows = TIERS.get(pos) or []
    for t in rows:
        if t["lo"] <= raw < t["hi"]:
            return max(0.0, raw + t["bias"])
    return max(0.0, raw + BY_POS.get(pos, {}).get("bias", 0.0))


def best_lineup(players, value):
    """players: [(pid,pos)] -> (total_actual, chosen_pids) picking by `value`."""
    by = defaultdict(list)
    for pid, pos in players:
        by[pos].append(pid)
    for pos in by:
        by[pos].sort(key=lambda p: -value(p, pos))
    used, chosen = set(), []
    for slot in LINEUP:
        for pid in by.get(slot, []):
            if pid not in used:
                used.add(pid)
                chosen.append(pid)
                break
    flex = [(pid, pos) for pid, pos in players if pos in FLEX_OK and pid not in used]
    flex.sort(key=lambda x: -value(x[0], x[1]))
    for pid, _ in flex[:N_FLEX]:
        used.add(pid)
        chosen.append(pid)
    return chosen


def run():
    meta = load("players.json", {})
    rows = []
    for season in SEASONS:
        scoring = league_scoring(season)
        for wk in REG_WEEKS:
            proj = load(f"{season}/projections_week_{wk}.json", {}) or {}
            matchups = load(f"{season}/matchups_{wk}.json", []) or []
            for m in matchups:
                pp = m.get("players_points") or {}
                roster = []
                for pid in (m.get("players") or []):
                    pos = (meta.get(pid) or {}).get("position")
                    if pid == pid.upper() and not pid.isdigit():
                        pos = "DEF"
                    if pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
                        roster.append((pid, pos))
                if len(roster) < 10:
                    continue

                pcache = {}
                def val(pid, pos):
                    if pid not in pcache:
                        pcache[pid] = corrected(pos, score_player(proj.get(pid), scoring))
                    return pcache[pid]

                chosen = best_lineup(roster, val)
                tool_pts = round(sum(pp.get(pid, 0.0) for pid in chosen), 2)
                actual = round(m.get("points") or 0.0, 2)

                # Perfect hindsight, for scale.
                best = best_lineup(roster, lambda pid, pos: pp.get(pid, 0.0))
                perfect = round(sum(pp.get(pid, 0.0) for pid in best), 2)

                rows.append({
                    "season": season, "week": wk, "roster_id": m["roster_id"],
                    "matchup_id": m.get("matchup_id"),
                    "actual": actual, "tool": tool_pts, "perfect": perfect,
                })
    return rows


def evaluate(rows):
    teams = json.load(open(os.path.join(DERIVED, "core.json")))["teams"]
    by_key = {(r["season"], r["week"], r["matchup_id"]): [] for r in rows}
    for r in rows:
        by_key[(r["season"], r["week"], r["matchup_id"])].append(r)

    per_team = defaultdict(lambda: {"d": 0.0, "n": 0, "flips": 0, "unflips": 0})
    for key, pair in by_key.items():
        if len(pair) != 2 or key[2] is None:
            continue
        a, b = pair
        for me, opp in ((a, b), (b, a)):
            k = (me["season"], me["roster_id"])
            per_team[k]["d"] += me["tool"] - me["actual"]
            per_team[k]["n"] += 1
            won_before = me["actual"] > opp["actual"]
            # Opponent keeps their real lineup: this measures the edge from
            # using the tool unilaterally, which is the real-world case.
            won_after = me["tool"] > opp["actual"]
            if won_after and not won_before:
                per_team[k]["flips"] += 1
            if won_before and not won_after:
                per_team[k]["unflips"] += 1

    print("=" * 96)
    print("BACKTEST — tool lineup vs what each manager actually started")
    print("=" * 96)
    print(f"{'season':>7} {'owner':<20} {'pts/wk':>8} {'season':>8} {'wins+':>6} {'wins-':>6} {'net':>5}")
    tot_d, tot_f, tot_u = [], 0, 0
    mine = []
    for (season, rid), d in sorted(per_team.items()):
        t = teams[season][str(rid)]
        per_wk = d["d"] / d["n"]
        net = d["flips"] - d["unflips"]
        tot_d.append(per_wk)
        tot_f += d["flips"]
        tot_u += d["unflips"]
        line = (f"{season:>7} {t['owner'][:19]:<20} {per_wk:>+8.2f} {d['d']:>+8.1f} "
                f"{d['flips']:>6} {d['unflips']:>6} {net:>+5}")
        if t["owner"] == "dirkwbeveridge":
            mine.append((season, per_wk, d, t))
            line += "   <<< YOU"
        print(line)

    print()
    print(f"league-wide: {statistics.mean(tot_d):+.2f} pts/week, "
          f"{tot_f} wins gained, {tot_u} wins lost, net {tot_f - tot_u:+d} across 36 team-seasons")
    print()
    print("YOUR seasons:")
    for season, per_wk, d, t in mine:
        print(f"  {season}: {per_wk:+.2f} pts/wk ({d['d']:+.0f} over the season) · "
              f"{d['flips']} wins gained, {d['unflips']} lost · actual record {t['wins']}-{t['losses']}")

    # How much of the theoretical maximum does the tool capture?
    gap_actual = statistics.mean([r["perfect"] - r["actual"] for r in rows])
    gap_tool = statistics.mean([r["perfect"] - r["tool"] for r in rows])
    print()
    print(f"points left vs perfect hindsight: managers {gap_actual:.1f}/wk, "
          f"tool {gap_tool:.1f}/wk  ({100*(gap_actual-gap_tool)/gap_actual:.0f}% of the gap closed)")


def export(rows):
    """Headline numbers the app shows, so the tool states its own track record."""
    teams = json.load(open(os.path.join(DERIVED, "core.json")))["teams"]
    per = defaultdict(lambda: {"d": 0.0, "n": 0, "flips": 0, "unflips": 0})
    by_key = defaultdict(list)
    for r in rows:
        by_key[(r["season"], r["week"], r["matchup_id"])].append(r)
    for key, pair in by_key.items():
        if len(pair) != 2 or key[2] is None:
            continue
        for me, opp in ((pair[0], pair[1]), (pair[1], pair[0])):
            k = (me["season"], me["roster_id"])
            per[k]["d"] += me["tool"] - me["actual"]
            per[k]["n"] += 1
            if me["tool"] > opp["actual"] and not me["actual"] > opp["actual"]:
                per[k]["flips"] += 1
            if me["actual"] > opp["actual"] and not me["tool"] > opp["actual"]:
                per[k]["unflips"] += 1

    mine, league = [], []
    for (season, rid), d in per.items():
        t = teams[season][str(rid)]
        row = {"season": season, "owner": t["owner"],
               "per_week": round(d["d"] / d["n"], 2), "season_total": round(d["d"], 1),
               "wins_gained": d["flips"], "wins_lost": d["unflips"]}
        league.append(row)
        if t["owner"] == "dirkwbeveridge":
            mine.append(row)

    out = {
        "n_team_weeks": len(rows),
        "league_per_week": round(statistics.mean([r["per_week"] for r in league]), 2),
        "league_wins_gained": sum(r["wins_gained"] for r in league),
        "league_wins_lost": sum(r["wins_lost"] for r in league),
        "mine": sorted(mine, key=lambda r: r["season"]),
        "gap_manager": round(statistics.mean([r["perfect"] - r["actual"] for r in rows]), 1),
        "gap_tool": round(statistics.mean([r["perfect"] - r["tool"] for r in rows]), 1),
    }
    out["gap_closed_pct"] = round(
        100 * (out["gap_manager"] - out["gap_tool"]) / out["gap_manager"], 0)
    path = os.path.join(DERIVED, "backtest.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"\nwrote {path}")


if __name__ == "__main__":
    rows = run()
    print(f"replayed {len(rows)} team-weeks\n")
    evaluate(rows)
    export(rows)
