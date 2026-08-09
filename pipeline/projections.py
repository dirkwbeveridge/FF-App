"""
How good are Sleeper's weekly projections in THIS league's scoring?

A start/sit tool is only as good as the numbers behind it, and last time a
number went unchecked (replacement level) it quietly reversed the whole
conclusion. So before any lineup advice leans on a projection, measure it:

  bias        does it run high or low, per position
  accuracy    RMSE and correlation against what actually happened
  spread      how wide the outcome is around a given projection

The spread matters as much as the accuracy. Knowing a receiver projected for 12
actually lands anywhere in 3-24 is what lets the lineup tool play for floor when
it is favoured and for ceiling when it is not.

Writes data/derived/projection_model.json
"""

import json
import os
import statistics
from collections import defaultdict

from scoring import RAW, ROOT, league_scoring, load, score_player

DERIVED = os.path.join(ROOT, "data", "derived")
SEASONS = ["2023", "2024", "2025"]
REG_WEEKS = list(range(1, 15))
SKILL = ("QB", "RB", "WR", "TE")


def collect():
    """Every (projected, actual) pair we have, scored in league rules."""
    meta = load("players.json", {})
    pairs = []
    for season in SEASONS:
        scoring = league_scoring(season)
        for wk in REG_WEEKS:
            proj = load(f"{season}/projections_week_{wk}.json", {}) or {}
            act = load(f"{season}/stats_week_{wk}.json", {}) or {}
            for pid, pstats in proj.items():
                if not pid.isdigit():
                    continue
                pos = (meta.get(pid) or {}).get("position")
                if pos not in SKILL:
                    continue
                # Only count players the projection actually expected to play;
                # a 0-point projection for an inactive third-stringer is not a
                # forecast, and including them flatters every accuracy metric.
                p = score_player(pstats, scoring)
                if p < 1.0:
                    continue
                a = score_player(act.get(pid), scoring)
                pairs.append((season, wk, pid, pos, round(p, 2), round(a, 2)))
    return pairs


def pearson(xs, ys):
    if len(xs) < 3:
        return 0.0
    mx, my = statistics.mean(xs), statistics.mean(ys)
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    if dx == 0 or dy == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (dx * dy)


def build(pairs):
    out = {"n": len(pairs), "by_position": {}, "tiers": {}, "calibration_note": ""}

    for pos in SKILL:
        g = [x for x in pairs if x[3] == pos]
        if len(g) < 30:
            continue
        p = [x[4] for x in g]
        a = [x[5] for x in g]
        resid = [ai - pi for pi, ai in zip(p, a)]
        out["by_position"][pos] = {
            "n": len(g),
            "proj_mean": round(statistics.mean(p), 2),
            "actual_mean": round(statistics.mean(a), 2),
            "bias": round(statistics.mean(resid), 2),
            "mae": round(statistics.mean([abs(r) for r in resid]), 2),
            "rmse": round((statistics.mean([r * r for r in resid])) ** 0.5, 2),
            "r": round(pearson(p, a), 3),
            "sd": round(statistics.pstdev(resid), 2),
            # How often the actual came in under half the projection, and over
            # 1.5x — the practical shape of a start/sit decision.
            "bust_rate": round(sum(1 for pi, ai in zip(p, a) if ai < 0.5 * pi) / len(g), 3),
            "boom_rate": round(sum(1 for pi, ai in zip(p, a) if ai > 1.5 * pi) / len(g), 3),
        }

    # Spread widens with the projection, so model it per position per tier
    # rather than assuming one number covers a QB1 and a bye-week streamer.
    TIERS = [(0, 6), (6, 10), (10, 14), (14, 18), (18, 24), (24, 999)]
    for pos in SKILL:
        rows = []
        for lo, hi in TIERS:
            g = [x for x in pairs if x[3] == pos and lo <= x[4] < hi]
            if len(g) < 20:
                continue
            p = [x[4] for x in g]
            a = [x[5] for x in g]
            resid = [ai - pi for pi, ai in zip(p, a)]
            srt = sorted(a)
            rows.append({
                "lo": lo, "hi": hi, "n": len(g),
                "proj_mean": round(statistics.mean(p), 2),
                "actual_mean": round(statistics.mean(a), 2),
                "bias": round(statistics.mean(resid), 2),
                "sd": round(statistics.pstdev(resid), 2),
                "p10": round(srt[len(srt) // 10], 2),
                "p25": round(srt[len(srt) // 4], 2),
                "median": round(statistics.median(a), 2),
                "p75": round(srt[3 * len(srt) // 4], 2),
                "p90": round(srt[9 * len(srt) // 10], 2),
            })
        out["tiers"][pos] = rows

    return out


if __name__ == "__main__":
    pairs = collect()
    model = build(pairs)
    print("=" * 92)
    print("SLEEPER WEEKLY PROJECTIONS, SCORED IN 415 FC RULES (2023-25)")
    print("=" * 92)
    print(f"{'pos':>4} {'n':>6} {'proj':>7} {'actual':>7} {'bias':>7} {'MAE':>6} "
          f"{'RMSE':>6} {'r':>6} {'bust%':>7} {'boom%':>7}")
    for pos, d in model["by_position"].items():
        print(f"{pos:>4} {d['n']:>6} {d['proj_mean']:>7.2f} {d['actual_mean']:>7.2f} "
              f"{d['bias']:>+7.2f} {d['mae']:>6.2f} {d['rmse']:>6.2f} {d['r']:>6.3f} "
              f"{d['bust_rate']*100:>6.1f}% {d['boom_rate']*100:>6.1f}%")
    print()
    print("Outcome spread by projection tier — the range you are really choosing between:")
    for pos in SKILL:
        rows = model["tiers"].get(pos) or []
        if not rows:
            continue
        print(f"\n  {pos}")
        print(f"    {'projected':>12} {'n':>5} {'actual avg':>11} {'p10':>7} {'median':>7} {'p90':>7} {'sd':>6}")
        for r in rows:
            label = f"{r['lo']}-{r['hi'] if r['hi'] < 900 else '+'}"
            print(f"    {label:>12} {r['n']:>5} {r['actual_mean']:>11.1f} {r['p10']:>7.1f} "
                  f"{r['median']:>7.1f} {r['p90']:>7.1f} {r['sd']:>6.1f}")

    path = os.path.join(DERIVED, "projection_model.json")
    with open(path, "w") as f:
        json.dump(model, f, indent=1)
    print(f"\nwrote {path}")
