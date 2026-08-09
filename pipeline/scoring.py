"""
League-accurate fantasy scoring engine.

Sleeper's /matchups endpoint only reports points for players who were rostered.
To evaluate a draft we need points for EVERY player — including the ones that
went undrafted and the ones sitting on someone else's bench — so we recompute
fantasy points from raw weekly stats using the league's own scoring_settings.

validate() checks our recomputation against Sleeper's own players_points.
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")


def load(relpath, default=None):
    path = os.path.join(RAW, relpath)
    if not os.path.exists(path):
        return default
    with open(path) as f:
        data = json.load(f)
    return default if data is None else data


def league_scoring(season):
    return load(f"{season}/league.json")["scoring_settings"]


def score_player(stats, scoring):
    """Dot-product of a player's stat line with the league scoring settings."""
    if not stats:
        return 0.0
    total = 0.0
    for stat, value in stats.items():
        mult = scoring.get(stat)
        if mult:
            total += value * mult
    return round(total, 2)


def weekly_points(season, week, scoring=None):
    """{player_id: fantasy_points} for one week, in this league's scoring."""
    scoring = scoring or league_scoring(season)
    stats = load(f"{season}/stats_week_{week}.json", {}) or {}
    return {pid: score_player(line, scoring) for pid, line in stats.items()}


def weekly_projections(season, week, scoring=None):
    scoring = scoring or league_scoring(season)
    proj = load(f"{season}/projections_week_{week}.json", {}) or {}
    return {pid: score_player(line, scoring) for pid, line in proj.items()}


def validate(season, weeks=(1, 5, 9, 13)):
    """
    Compare recomputed points against Sleeper's players_points from matchups.
    Returns (n_compared, n_within_tolerance, worst_diffs).
    """
    scoring = league_scoring(season)
    compared = matched = 0
    worst = []
    for wk in weeks:
        ours = weekly_points(season, wk, scoring)
        matchups = load(f"{season}/matchups_{wk}.json", []) or []
        for m in matchups:
            for pid, theirs in (m.get("players_points") or {}).items():
                mine = ours.get(pid, 0.0)
                compared += 1
                diff = abs(mine - theirs)
                if diff <= 0.11:
                    matched += 1
                else:
                    worst.append((diff, season, wk, pid, mine, theirs))
    worst.sort(reverse=True)
    return compared, matched, worst[:15]


if __name__ == "__main__":
    for season in ("2023", "2024", "2025"):
        n, ok, worst = validate(season)
        pct = 100.0 * ok / n if n else 0
        print(f"{season}: {ok}/{n} within 0.11 pts ({pct:.2f}%)")
        for d, s, wk, pid, mine, theirs in worst[:5]:
            print(f"    wk{wk} player {pid}: ours={mine} sleeper={theirs} diff={d:.2f}")
