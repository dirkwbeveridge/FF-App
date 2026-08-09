"""
Core fact tables for the 415 Football Club draft study.

Builds three linked tables from the raw Sleeper dump:

  players[season][player_id]  season-long value for EVERY NFL player, scored in
                              league rules, including players nobody drafted
  teams[season][roster_id]    record, points, playoff seed, final finish,
                              championship flags, draft slot, success weight
  picks[season][pick_no]      every draft pick joined to the outcome of both the
                              player and the team that made it

Written to data/derived/core.json
"""

import glob
import json
import os
import statistics
from collections import Counter, defaultdict

from scoring import RAW, ROOT, league_scoring, load, weekly_points

DERIVED = os.path.join(ROOT, "data", "derived")

SEASONS = ["2023", "2024", "2025"]
REG_WEEKS = list(range(1, 15))       # league regular season
POST_WEEKS = [15, 16, 17]            # league playoffs
ALL_WEEKS = list(range(1, 18))
N_TEAMS = 12
ROUNDS = 16
SKILL = ("QB", "RB", "WR", "TE")


# --------------------------------------------------------------------------
# Players
# --------------------------------------------------------------------------

def build_players(meta):
    """Season-long, league-scored value for every player with a stat line."""
    out = {}
    for season in SEASONS:
        scoring = league_scoring(season)
        wk_pts = {wk: weekly_points(season, wk, scoring) for wk in ALL_WEEKS}
        stats_present = {
            wk: set((load(f"{season}/stats_week_{wk}.json", {}) or {}).keys())
            for wk in ALL_WEEKS
        }

        pids = set()
        for wk in ALL_WEEKS:
            pids |= set(wk_pts[wk].keys())

        season_players = {}
        for pid in pids:
            info = meta.get(pid) or {}
            pos = info.get("position")
            if pid == pid.upper() and not pid.isdigit():
                # Team defenses are keyed by bare abbreviation ("SF"). The stats
                # feed ALSO carries "TEAM_SF" rows holding whole-team offensive
                # totals; scoring those as a D/ST yields ~1500 fantasy points and
                # poisons every "best player available" comparison in the draft.
                if "_" in pid:
                    continue
                pos = "DEF"
            if pos not in ("QB", "RB", "WR", "TE", "K", "DEF"):
                continue

            weekly = [wk_pts[wk].get(pid, 0.0) for wk in ALL_WEEKS]
            played = [wk for wk in ALL_WEEKS if pid in stats_present[wk]]
            reg = [wk_pts[wk].get(pid, 0.0) for wk in REG_WEEKS]
            post = [wk_pts[wk].get(pid, 0.0) for wk in POST_WEEKS]
            reg_played = [wk_pts[wk].get(pid, 0.0) for wk in REG_WEEKS
                          if pid in stats_present[wk]]

            name = (
                f"{info.get('first_name','')} {info.get('last_name','')}".strip()
                or info.get("team") or pid
            )
            if pos == "DEF":
                name = f"{pid} D/ST"

            season_players[pid] = {
                "pid": pid,
                "name": name,
                "pos": pos,
                "nfl_team": info.get("team"),
                "weekly": [round(x, 2) for x in weekly],
                "pts_reg": round(sum(reg), 2),
                "pts_post": round(sum(post), 2),
                "pts_total": round(sum(weekly), 2),
                "games": len(played),
                "games_reg": len([w for w in played if w <= 14]),
                "ppg_reg": round(sum(reg_played) / len(reg_played), 2) if reg_played else 0.0,
                "best_week": round(max(weekly), 2) if weekly else 0.0,
            }

        # Positional ranks by regular-season total
        for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
            group = sorted(
                [p for p in season_players.values() if p["pos"] == pos],
                key=lambda p: -p["pts_reg"],
            )
            for i, p in enumerate(group, 1):
                p["pos_rank"] = i
                p["pos_label"] = f"{pos}{i}"
            group_ppg = sorted(
                [p for p in season_players.values() if p["pos"] == pos and p["games_reg"] >= 6],
                key=lambda p: -p["ppg_reg"],
            )
            for i, p in enumerate(group_ppg, 1):
                p["pos_rank_ppg"] = i

        out[season] = season_players
    return out


def empirical_starter_demand(seasons=SEASONS):
    """
    How many of each position the league ACTUALLY starts in a week, averaged
    over every team-week. This sets the replacement-level baseline instead of
    assuming a flex split.
    """
    counts = Counter()
    team_weeks = 0
    meta_cache = {}
    for season in seasons:
        pos_of = {}
        for wk in REG_WEEKS:
            for m in load(f"{season}/matchups_{wk}.json", []) or []:
                starters = [s for s in (m.get("starters") or []) if s and s != "0"]
                if not starters:
                    continue
                team_weeks += 1
                for pid in starters:
                    if pid not in pos_of:
                        pos_of[pid] = _pos_lookup(pid, meta_cache)
                    counts[pos_of[pid]] += 1
    per_team = {p: counts[p] / team_weeks for p in counts if p}
    return per_team, team_weeks


_META = None


def _pos_lookup(pid, cache):
    global _META
    if pid in cache:
        return cache[pid]
    if pid == pid.upper() and not pid.isdigit():
        cache[pid] = "DEF"
        return "DEF"
    if _META is None:
        _META = load("players.json", {})
    pos = (_META.get(pid) or {}).get("position")
    cache[pid] = pos
    return pos


# What a started-off-waivers player produced per game, 2023-25 (pipeline/replacement.py).
# Recomputed there; duplicated as a constant so core.py stays runnable standalone.
WAIVER_PPG = {"QB": 17.69, "RB": 12.67, "WR": 11.37, "TE": 10.89}

# Weight on the waiver-churn baseline vs the last-forced-starter baseline.
# The two disagree, and which is "right" is not resolvable from this data:
# predictive power against actual team scoring is flat across the whole range
# (r .769 -> .741, inside the calibration noise band), while the apparent
# RB-over-WR edge in rounds 1-4 swings from +18.5 to -2.0 depending purely on
# this choice. An edge that exists only under one arbitrary convention is not
# an edge, so we sit at the midpoint rather than let the convention pick a
# strategy for us.
WAIVER_BLEND = 0.5


def add_vorp(players, demand, blend=WAIVER_BLEND):
    """
    VORP against a blended replacement baseline.

    Two defensible definitions of replacement level:
      last forced starter  the (12 * starters_per_team)-th best player at the
                           position — the worst guy someone still has to start
      waiver churn         what teams actually got from players they started
                           but never drafted, annualised

    The second lands well above the first (RB 177 vs 138, TE 153 vs 123),
    because the wire is not empty — teams stream it all year. We use the
    midpoint of the two.
    """
    baselines = {}
    for pos, per_team in demand.items():
        baselines[pos] = max(1, round(per_team * N_TEAMS))

    used = {}
    for season in SEASONS:
        sp = players[season]
        season_base = {}
        for pos, n in baselines.items():
            group = sorted(
                [p for p in sp.values() if p["pos"] == pos], key=lambda p: -p["pts_reg"]
            )
            if not group:
                continue
            idx = min(n, len(group)) - 1
            rank_base = group[idx]["pts_reg"]
            wv = WAIVER_PPG.get(pos)
            if wv is None:
                season_base[pos] = rank_base
            else:
                season_base[pos] = (1 - blend) * rank_base + blend * (wv * 14)
        used[season] = {k: round(v, 1) for k, v in season_base.items()}
        for p in sp.values():
            base = season_base.get(p["pos"], 0.0)
            p["vorp"] = round(p["pts_reg"] - base, 2)
            p["vorp_total"] = round(p["pts_total"] - base, 2)
    return baselines, used


# --------------------------------------------------------------------------
# Teams
# --------------------------------------------------------------------------

def parse_bracket(bracket):
    """Winners bracket -> {roster_id: final_place} for the placement games."""
    place = {}
    for m in bracket or []:
        p = m.get("p")
        if p and m.get("w") and m.get("l"):
            place[m["w"]] = p
            place[m["l"]] = p + 1
    return place


def build_teams(players):
    out = {}
    for season in SEASONS:
        users = {u["user_id"]: u for u in load(f"{season}/users.json", []) or []}
        rosters = load(f"{season}/rosters.json", []) or []
        draft = load_draft(season)
        slot_to_roster = {int(k): v for k, v in (draft.get("slot_to_roster_id") or {}).items()}
        roster_to_slot = {v: k for k, v in slot_to_roster.items()}

        wb = load(f"{season}/winners_bracket.json", [])
        places = parse_bracket(wb)

        # Regular-season seeding: wins, then points for.
        ranked = sorted(
            rosters,
            key=lambda r: (
                -(r["settings"].get("wins", 0)),
                -(r["settings"].get("fpts", 0) + r["settings"].get("fpts_decimal", 0) / 100),
            ),
        )
        seed = {r["roster_id"]: i for i, r in enumerate(ranked, 1)}

        season_teams = {}
        for r in rosters:
            rid = r["roster_id"]
            s = r["settings"]
            uid = r.get("owner_id")
            u = users.get(uid) or {}
            fpts = s.get("fpts", 0) + s.get("fpts_decimal", 0) / 100
            fpa = s.get("fpts_against", 0) + s.get("fpts_against_decimal", 0) / 100
            ppts = s.get("ppts", 0) + s.get("ppts_decimal", 0) / 100
            wins, losses, ties = s.get("wins", 0), s.get("losses", 0), s.get("ties", 0)
            games = wins + losses + ties
            final_place = places.get(rid)
            made_po = seed[rid] <= 6

            season_teams[rid] = {
                "season": season,
                "roster_id": rid,
                "user_id": uid,
                "owner": u.get("display_name") or f"roster{rid}",
                "team_name": (u.get("metadata") or {}).get("team_name") or u.get("display_name"),
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "win_pct": round((wins + 0.5 * ties) / games, 4) if games else 0,
                "pts_for": round(fpts, 2),
                "pts_against": round(fpa, 2),
                "max_pts": round(ppts, 2),
                "efficiency": round(fpts / ppts, 4) if ppts else 0,
                "seed": seed[rid],
                "made_playoffs": made_po,
                "final_place": final_place,
                "is_champion": final_place == 1,
                "is_runner_up": final_place == 2,
                "draft_slot": roster_to_slot.get(rid),
            }
        out[season] = season_teams
    return out


def success_weight(team):
    """
    How much this team's strategy should count as evidence.
    Champions are proof; last-place teams are a cautionary tale, not noise.
    """
    if team["is_champion"]:
        return 3.0
    if team["is_runner_up"]:
        return 2.25
    if team["final_place"] in (3, 4):
        return 1.75
    if team["made_playoffs"]:
        return 1.5
    return 1.0


def success_score(team):
    """
    Continuous 0-100 outcome score, for correlations that need more resolution
    than a champion/not flag over 36 team-seasons.
    """
    # regular season strength (0-60): win% and points-for percentile
    base = 60.0 * team["win_pct"]
    bonus = 0.0
    if team["made_playoffs"]:
        bonus += 12.0
    fp = team.get("final_place")
    if fp == 1:
        bonus += 28.0
    elif fp == 2:
        bonus += 20.0
    elif fp == 3:
        bonus += 14.0
    elif fp == 4:
        bonus += 10.0
    elif fp in (5, 6):
        bonus += 6.0
    return round(base + bonus, 2)


# --------------------------------------------------------------------------
# Picks
# --------------------------------------------------------------------------

def load_draft(season):
    f = glob.glob(os.path.join(RAW, season, "draft_*.json"))
    f = [x for x in f if "_picks" not in x and "_traded" not in x]
    with open(f[0]) as fh:
        return json.load(fh)


def load_picks(season):
    f = glob.glob(os.path.join(RAW, season, "draft_*_picks.json"))
    with open(f[0]) as fh:
        return json.load(fh)


def build_picks(players, teams):
    out = {}
    for season in SEASONS:
        sp = players[season]
        st = teams[season]
        rows = []
        for pk in load_picks(season):
            pid = pk["player_id"]
            p = sp.get(pid)
            md = pk.get("metadata") or {}
            rid = pk["roster_id"]
            team = st.get(rid, {})
            pos = (p or {}).get("pos") or md.get("position")
            rows.append({
                "season": season,
                "pick_no": pk["pick_no"],
                "round": pk["round"],
                "slot": pk["draft_slot"],
                "roster_id": rid,
                "owner": team.get("owner"),
                "is_keeper": bool(pk.get("is_keeper")),
                "pid": pid,
                "name": (p or {}).get("name") or f"{md.get('first_name','')} {md.get('last_name','')}".strip(),
                "pos": pos,
                "nfl_team": md.get("team"),
                "pts_reg": (p or {}).get("pts_reg", 0.0),
                "pts_total": (p or {}).get("pts_total", 0.0),
                "ppg_reg": (p or {}).get("ppg_reg", 0.0),
                "games_reg": (p or {}).get("games_reg", 0),
                "pos_rank": (p or {}).get("pos_rank"),
                "pos_label": (p or {}).get("pos_label"),
                "vorp": (p or {}).get("vorp", 0.0),
                "weekly": (p or {}).get("weekly", []),
                # team outcome attached to the pick
                "team_win_pct": team.get("win_pct"),
                "team_seed": team.get("seed"),
                "made_playoffs": team.get("made_playoffs"),
                "final_place": team.get("final_place"),
                "is_champion": team.get("is_champion"),
                "success_weight": success_weight(team) if team else 1.0,
                "success_score": success_score(team) if team else 0.0,
            })
        rows.sort(key=lambda r: r["pick_no"])
        out[season] = rows
    return out


def add_pick_context(players, picks):
    """
    For each pick, what was still on the board — the counterfactual that turns
    'he scored 180' into 'he was the 9th-best option you could have taken'.
    """
    for season in SEASONS:
        sp = players[season]
        rows = picks[season]
        drafted_order = [r["pid"] for r in rows]

        for i, r in enumerate(rows):
            taken_later = set(drafted_order[i:])          # includes this pick
            # Everyone available at this pick: undrafted-so-far players.
            avail = [
                p for pid, p in sp.items()
                if pid in taken_later or pid not in set(drafted_order[:i])
            ]
            avail = [p for p in avail if p["pid"] not in set(drafted_order[:i])]
            avail.sort(key=lambda p: -p["pts_reg"])

            r["best_available_pts"] = avail[0]["pts_reg"] if avail else 0.0
            r["best_available"] = avail[0]["name"] if avail else None
            r["best_available_pos"] = avail[0]["pos"] if avail else None
            # Rank of the player taken among all players still available
            board_rank = next(
                (j for j, p in enumerate(avail, 1) if p["pid"] == r["pid"]), None
            )
            r["board_rank"] = board_rank
            r["points_left_on_board"] = round(r["best_available_pts"] - r["pts_reg"], 2)

            # Best available at each position
            bapos = {}
            for pos in SKILL:
                cands = [p for p in avail if p["pos"] == pos]
                if cands:
                    bapos[pos] = {
                        "name": cands[0]["name"],
                        "pts": cands[0]["pts_reg"],
                        "vorp": cands[0]["vorp"],
                    }
            r["best_available_by_pos"] = bapos
    return picks


def _smooth_isotonic(by_pick, n_picks, window=5):
    """Centered-window mean, then forced monotone decreasing (pool-adjacent-violators).

    n=3 observations per exact pick number is too thin to trust, so each estimate
    borrows from its neighbours (~21 obs), then we impose the one thing we know
    a priori: a later pick cannot be worth more than an earlier one in expectation.
    """
    curve = {}
    for pick_no in range(1, n_picks + 1):
        pool = []
        for k in range(pick_no - window, pick_no + window + 1):
            pool.extend(by_pick.get(k, []))
        curve[pick_no] = statistics.mean(pool) if pool else 0.0

    keys = sorted(curve)
    vals = [curve[k] for k in keys]
    for i in range(1, len(vals)):
        if vals[i] > vals[i - 1]:
            j = i
            while j > 0 and vals[j] > vals[j - 1]:
                merged = statistics.mean(vals[j - 1:i + 1])
                for t in range(j - 1, i + 1):
                    vals[t] = merged
                j -= 1
    return {k: round(v, 2) for k, v in zip(keys, vals)}


def add_expectation(picks):
    """
    Market expectation curves and residuals.

    Two currencies, and the difference between them matters:

      pts_reg  raw fantasy points. A position-blind curve on raw points makes
               every QB look like a genius pick, because 6-point passing TDs
               mean QB1 outscores RB1 by ~100 points while both are one
               lineup slot. That is an artifact, not an edge.

      vorp     points above the position's replacement level. This is the
               honest currency and is what residual_vorp / the optimizer use.
    """
    n_picks = N_TEAMS * ROUNDS
    by_pick_pts = defaultdict(list)
    by_pick_vorp = defaultdict(list)
    for season in SEASONS:
        for r in picks[season]:
            by_pick_pts[r["pick_no"]].append(r["pts_reg"])
            by_pick_vorp[r["pick_no"]].append(r["vorp"])

    exp_curve = _smooth_isotonic(by_pick_pts, n_picks)
    exp_curve_vorp = _smooth_isotonic(by_pick_vorp, n_picks)

    # Per-position expectation by pick number: what a WR taken at pick N has
    # historically returned, vs what an RB taken at pick N returned.
    pos_curves = {}
    for pos in SKILL:
        bp = defaultdict(list)
        for season in SEASONS:
            for r in picks[season]:
                if r["pos"] == pos:
                    bp[r["pick_no"]].append(r["vorp"])
        pos_curves[pos] = _smooth_isotonic(bp, n_picks, window=12)

    # Positional expectation: value of the Nth player taken at each position
    pos_exp = defaultdict(lambda: defaultdict(list))
    for season in SEASONS:
        counts = Counter()
        for r in picks[season]:
            if r["pos"] in SKILL:
                counts[r["pos"]] += 1
                pos_exp[r["pos"]][counts[r["pos"]]].append(r["pts_reg"])

    for season in SEASONS:
        for r in picks[season]:
            e = exp_curve.get(r["pick_no"], 0.0)
            ev = exp_curve_vorp.get(r["pick_no"], 0.0)
            r["expected_pts"] = e
            r["expected_vorp"] = ev
            r["residual"] = round(r["pts_reg"] - e, 2)
            r["residual_vorp"] = round(r["vorp"] - ev, 2)
            r["value_ratio"] = round(r["pts_reg"] / e, 3) if e > 0 else None

    return (exp_curve, exp_curve_vorp, pos_curves,
            {p: {k: round(statistics.mean(v), 2) for k, v in d.items()}
             for p, d in pos_exp.items()})


# --------------------------------------------------------------------------
# Roster usage — did the drafted player actually start for the drafting team?
# --------------------------------------------------------------------------

def add_usage(picks, teams):
    """
    Points a drafted player actually contributed to the team that drafted him,
    while starting. A pick only pays off if it goes in the lineup.
    """
    for season in SEASONS:
        started_pts = defaultdict(float)     # (rid, pid) -> points as a starter
        started_wks = defaultdict(int)
        rostered_wks = defaultdict(int)
        for wk in ALL_WEEKS:
            for m in load(f"{season}/matchups_{wk}.json", []) or []:
                rid = m["roster_id"]
                starters = m.get("starters") or []
                spts = m.get("starters_points") or []
                for pid in (m.get("players") or []):
                    rostered_wks[(rid, pid)] += 1
                for pid, pts in zip(starters, spts):
                    if pid and pid != "0":
                        started_pts[(rid, pid)] += pts
                        started_wks[(rid, pid)] += 1

        for r in picks[season]:
            key = (r["roster_id"], r["pid"])
            r["pts_as_starter"] = round(started_pts.get(key, 0.0), 2)
            r["weeks_started"] = started_wks.get(key, 0)
            r["weeks_rostered"] = rostered_wks.get(key, 0)
            r["kept_all_season"] = rostered_wks.get(key, 0) >= 14
    return picks


def main():
    os.makedirs(DERIVED, exist_ok=True)
    print("loading player metadata…")
    meta = load("players.json", {})

    print("building player season values…")
    players = build_players(meta)
    for s in SEASONS:
        print(f"   {s}: {len(players[s])} players scored")

    print("computing empirical starter demand…")
    demand, tw = empirical_starter_demand()
    print("   per-team starters/week:", {k: round(v, 2) for k, v in sorted(demand.items())},
          f"over {tw} team-weeks")
    baselines, base_pts = add_vorp(players, demand)
    print("   replacement ranks:", baselines)
    print("   blended baseline points:", base_pts[SEASONS[-1]])

    print("building teams…")
    teams = build_teams(players)
    for s in SEASONS:
        champ = [t for t in teams[s].values() if t["is_champion"]]
        print(f"   {s}: champion = {champ[0]['owner'] if champ else '?'}"
              f" (slot {champ[0]['draft_slot'] if champ else '?'})")

    print("building picks…")
    picks = build_picks(players, teams)
    picks = add_pick_context(players, picks)
    exp_curve, exp_curve_vorp, pos_curves, pos_exp = add_expectation(picks)
    picks = add_usage(picks, teams)

    out = {
        "seasons": SEASONS,
        "n_teams": N_TEAMS,
        "rounds": ROUNDS,
        "starter_demand": {k: round(v, 3) for k, v in demand.items()},
        "replacement_baselines": baselines,
        "replacement_points": base_pts,
        "waiver_blend": WAIVER_BLEND,
        "expectation_curve": exp_curve,
        "expectation_curve_vorp": exp_curve_vorp,
        "positional_vorp_curves": pos_curves,
        "positional_expectation": pos_exp,
        "players": players,
        "teams": teams,
        "picks": picks,
    }
    path = os.path.join(DERIVED, "core.json")
    with open(path, "w") as f:
        json.dump(out, f)
    print(f"\nwrote {path} ({os.path.getsize(path)/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
