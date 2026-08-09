"""
The draftable player pool for 2026, scored in 415 FC rules.

Baked at build time rather than fetched live so the draft board opens instantly
and still works if Sleeper is slow on draft night — the app refreshes ADP live
when it can, but never depends on it.

Each player carries:
  proj      season projection scored in THIS league's rules (first downs, 6pt
            passing TDs) rather than the generic PPR column
  vorp      that projection above the position's replacement baseline, which is
            what makes a tight end comparable to a running back
  adp       where the market is taking him
  value     vorp minus what the pick at his ADP is normally worth — the number
            that says "this is a reach" or "this is falling"
"""

import json
import os
import statistics

from scoring import ROOT, load, score_player

DERIVED = os.path.join(ROOT, "data", "derived")
SEASON = "2026"
V2 = "https://api.sleeper.com"
SKILL = ("QB", "RB", "WR", "TE", "K", "DEF")


def fetch(url):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "415FC/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def main():
    league = json.load(open(os.path.join(DERIVED, "league.json")))
    scoring = league["scoring"]
    core = json.load(open(os.path.join(DERIVED, "core.json")))
    analysis = json.load(open(os.path.join(DERIVED, "analysis.json")))

    # Replacement baselines from the draft study, averaged across seasons. The
    # blend of last-forced-starter and waiver-churn is carried over so the pool
    # ranks on the same scale everything else in the app uses.
    rep = core.get("replacement_points") or {}
    baseline = {}
    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        vals = [rep[s][pos] for s in rep if pos in rep[s]]
        if vals:
            baseline[pos] = round(statistics.mean(vals), 1)
    print("replacement baselines:", baseline)

    season_proj = fetch(f"https://api.sleeper.app/v1/projections/nfl/regular/{SEASON}")
    meta = load("players.json", {})

    # ADP only exists on the v2 host, and only on the weekly endpoint — the
    # season-long v1 feed carries projections but no market price at all.
    positions = "&".join(f"position[]={p}" for p in SKILL)
    adp_rows = fetch(f"{V2}/projections/nfl/{SEASON}/1?season_type=regular&{positions}&order_by=adp_dd_ppr")
    adp_by_pid = {}
    for row in adp_rows:
        a = (row.get("stats") or {}).get("adp_dd_ppr")
        if a is not None and a < 400:
            adp_by_pid[row["player_id"]] = a
    print(f"ADP found for {len(adp_by_pid)} players")

    rows = []
    for pid, stats in season_proj.items():
        if not stats:
            continue
        info = meta.get(pid) or {}
        pos = info.get("position")
        if pid == pid.upper() and not pid.isdigit() and "_" not in pid:
            pos = "DEF"
        if pos not in SKILL:
            continue
        adp = adp_by_pid.get(pid) or stats.get("adp_dd_ppr")
        pts = score_player(stats, scoring)
        # Nobody with neither a projection nor a market price is draftable.
        if pts <= 0 and (adp is None or adp >= 400):
            continue
        name = (f"{info.get('first_name','')} {info.get('last_name','')}".strip()
                or (f"{pid} D/ST" if pos == "DEF" else pid))
        rows.append({
            "pid": pid,
            "name": name,
            "pos": pos,
            "team": info.get("team"),
            "adp": round(adp, 1) if adp and adp < 400 else None,
            "proj": round(pts, 1),
            "vorp": round(pts - baseline.get(pos, 0), 1),
            "bye": info.get("bye_week"),
            "age": info.get("age"),
            "exp": info.get("years_exp"),
            "injury": info.get("injury_status"),
            "rank": info.get("search_rank"),
        })

    # Positional rank by projection, so "the 14th-best WR" is legible on the board.
    for pos in SKILL:
        g = sorted([r for r in rows if r["pos"] == pos], key=lambda r: -r["proj"])
        for i, r in enumerate(g, 1):
            r["pos_rank"] = i

    # Value over the pick where the market takes him. The draft study already
    # measured what a pick at each number returns; anyone whose own projection
    # beats that is falling, anyone below it is a reach.
    curve = analysis.get("expectation_curve_vorp") or {}
    for r in rows:
        if r["adp"]:
            slot = str(int(round(r["adp"])))
            exp = curve.get(slot)
            r["value"] = round(r["vorp"] - exp, 1) if exp is not None else None
        else:
            r["value"] = None

    rows.sort(key=lambda r: (r["adp"] if r["adp"] else 999, -r["proj"]))
    drafted = [r for r in rows if r["adp"]]
    print(f"{len(rows)} players scored, {len(drafted)} with market ADP")
    print("\ntop 12 by ADP:")
    for r in drafted[:12]:
        print(f"  {r['adp']:>5.1f} {r['name']:<24} {r['pos']}{r['pos_rank']:<3} "
              f"proj={r['proj']:>6.1f} vorp={r['vorp']:>+6.1f} value={r['value']}")

    out = {"season": SEASON, "baseline": baseline, "players": rows}
    path = os.path.join(DERIVED, "pool.json")
    with open(path, "w") as f:
        json.dump(out, f)
    print(f"\nwrote {path} ({os.path.getsize(path)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
