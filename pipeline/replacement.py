"""
Measure what the waiver wire is actually worth, by position.

The optimizer needs to know what happens when a drafted player busts. The
answer is not "you eat his negative season" — it is "you cut him and start
whoever is free." How much that costs depends entirely on the position: a
12-team league rosters 12 of ~32 startable NFL quarterbacks, so QB help is
always sitting there; it rosters nearly every usable running back, so there is
nothing behind them.

We measure it directly: every player a team STARTED but did not DRAFT is a
waiver/trade acquisition. Their per-game scoring, relative to the drafted
starters at that position, is the real replacement level.
"""

import json
import os
import statistics
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
DERIVED = os.path.join(ROOT, "data", "derived")

C = json.load(open(os.path.join(DERIVED, "core.json")))
SEASONS = C["seasons"]
PLAYERS, PICKS = C["players"], C["picks"]
REG_WEEKS = list(range(1, 15))
SKILL = ("QB", "RB", "WR", "TE")


def load(rel, default=None):
    p = os.path.join(RAW, rel)
    if not os.path.exists(p):
        return default
    with open(p) as f:
        d = json.load(f)
    return default if d is None else d


def measure():
    per_pos_drafted = defaultdict(list)     # points/game from drafted starters
    per_pos_waiver = defaultdict(list)      # points/game from acquired starters
    waiver_starts = defaultdict(int)
    drafted_starts = defaultdict(int)

    for season in SEASONS:
        sp = PLAYERS[season]
        drafted_by = defaultdict(set)       # roster_id -> set(player_id)
        for p in PICKS[season]:
            drafted_by[p["roster_id"]].add(p["pid"])

        for wk in REG_WEEKS:
            for m in load(f"{season}/matchups_{wk}.json", []) or []:
                rid = m["roster_id"]
                starters = m.get("starters") or []
                spts = m.get("starters_points") or []
                for pid, pts in zip(starters, spts):
                    if not pid or pid == "0":
                        continue
                    pos = (sp.get(pid) or {}).get("pos")
                    if pos not in SKILL:
                        continue
                    if pid in drafted_by[rid]:
                        per_pos_drafted[pos].append(pts)
                        drafted_starts[pos] += 1
                    else:
                        per_pos_waiver[pos].append(pts)
                        waiver_starts[pos] += 1

    out = {}
    for pos in SKILL:
        d, w = per_pos_drafted[pos], per_pos_waiver[pos]
        n_d, n_w = len(d), len(w)
        md = statistics.mean(d) if d else 0
        mw = statistics.mean(w) if w else 0
        out[pos] = {
            "drafted_starts": n_d,
            "waiver_starts": n_w,
            "waiver_share": round(n_w / (n_d + n_w), 3) if (n_d + n_w) else 0,
            "drafted_ppg": round(md, 2),
            "waiver_ppg": round(mw, 2),
            "gap_ppg": round(md - mw, 2),
            # Season-equivalent (14 games) VORP cost of replacing a drafted
            # starter with the best thing available on the wire.
            "replacement_floor_season": round(-14 * (md - mw), 1),
        }
    return out


if __name__ == "__main__":
    res = measure()
    print("=" * 88)
    print("WAIVER-WIRE REPLACEMENT VALUE BY POSITION (2023-25 regular seasons)")
    print("=" * 88)
    print(f"{'pos':>4} {'drafted':>9} {'waiver':>8} {'wv share':>9} "
          f"{'draft ppg':>10} {'waiver ppg':>11} {'gap':>7} {'season floor':>13}")
    for pos in SKILL:
        r = res[pos]
        print(f"{pos:>4} {r['drafted_starts']:>9} {r['waiver_starts']:>8} "
              f"{r['waiver_share']*100:>8.1f}% {r['drafted_ppg']:>10.2f} "
              f"{r['waiver_ppg']:>11.2f} {r['gap_ppg']:>7.2f} "
              f"{r['replacement_floor_season']:>13.1f}")
    print()
    print("Read: 'season floor' is how far below replacement a busted pick can")
    print("actually drag you once you cut him and start the best free option.")
    with open(os.path.join(DERIVED, "replacement.json"), "w") as f:
        json.dump(res, f, indent=1)
    print(f"\nwrote {os.path.join(DERIVED, 'replacement.json')}")
