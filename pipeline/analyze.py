"""
The 415 Football Club draft study.

Turns the core fact tables into the answers: which positions pay in which
rounds, what champions did differently, which picks were steals and which were
disasters, and — via Monte Carlo over the league's own positional scarcity
curves — the optimal position sequence for every one of the 12 draft slots.

Writes data/derived/analysis.json (consumed by the web app) and prints a
readable report.
"""

import json
import math
import os
import random
import statistics
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DERIVED = os.path.join(ROOT, "data", "derived")
C = json.load(open(os.path.join(DERIVED, "core.json")))

SEASONS = C["seasons"]
TEAMS, PICKS, PLAYERS = C["teams"], C["picks"], C["players"]
N_TEAMS, ROUNDS = C["n_teams"], C["rounds"]
SKILL = ("QB", "RB", "WR", "TE")
ALL_PICKS = [p for s in SEASONS for p in PICKS[s]]

# Starting lineup: QB, RB, RB, WR, WR, TE, FLEX, FLEX (+K, +DEF)
LINEUP = {"QB": 1, "RB": 2, "WR": 2, "TE": 1}
N_FLEX = 2
FLEX_OK = ("RB", "WR", "TE")

RNG = random.Random(20260809)


# ---------------------------------------------------------------- utilities

def wmean(pairs):
    """pairs = [(value, weight)]"""
    tw = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / tw if tw else 0.0


def pearson(xs, ys, trials=20000, seed=7):
    n = len(xs)
    if n < 3:
        return 0.0, 1.0
    mx, my = statistics.mean(xs), statistics.mean(ys)
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx == 0 or dy == 0:
        return 0.0, 1.0
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    r = num / (dx * dy)
    rng = random.Random(seed)
    ys2 = list(ys)
    hits = 0
    for _ in range(trials):
        rng.shuffle(ys2)
        n2 = sum((x - mx) * (y - my) for x, y in zip(xs, ys2))
        if abs(n2 / (dx * dy)) >= abs(r) - 1e-12:
            hits += 1
    return round(r, 4), round((hits + 1) / (trials + 1), 4)


REVERSAL_ROUND = 3


def snake_picks(slot, n_teams=N_TEAMS, rounds=ROUNDS, reversal=REVERSAL_ROUND):
    """
    Pick numbers owned by a draft slot — with this league's third-round reversal.

    Every 415 FC draft from 2023 through 2026 is set to reversal_round=3, so
    round 3 repeats round 2's order instead of flipping back, and the parity
    inverts from round 4 on. Assuming a plain snake puts nearly every pick
    after round 2 in the wrong place: slot 10's third-round pick is 27, not 34.
    Verified against the first pick of each round in all three completed drafts.
    """
    out = []
    for rd in range(1, rounds + 1):
        if rd == 1:
            forward = True
        elif rd <= reversal:
            forward = False          # round 2 reverses, round 3 repeats it
        else:
            forward = rd % 2 == 0
        offset = slot if forward else (n_teams - slot + 1)
        out.append((rd - 1) * n_teams + offset)
    return out


def team_picks(season, rid):
    return sorted([p for p in PICKS[season] if p["roster_id"] == int(rid)],
                  key=lambda p: p["pick_no"])


def team_rows():
    for s in SEASONS:
        for rid, t in TEAMS[s].items():
            yield s, int(rid), t


# ------------------------------------------------- 1. positional value model

def positional_scarcity():
    """
    The j-th player taken at each position, and what he actually returned.

    This is the backbone of the optimizer: it answers "if I take a WR now, and
    8 WRs are already gone, what am I actually getting?" — pooled across three
    seasons and smoothed across adjacent ranks so n=3 becomes n~9.
    """
    obs = defaultdict(lambda: defaultdict(list))   # pos -> j -> [vorp]
    pts = defaultdict(lambda: defaultdict(list))
    pick_at = defaultdict(lambda: defaultdict(list))  # pos -> j -> [pick_no]
    for s in SEASONS:
        cnt = Counter()
        for p in sorted(PICKS[s], key=lambda x: x["pick_no"]):
            if p["pos"] not in SKILL:
                continue
            cnt[p["pos"]] += 1
            j = cnt[p["pos"]]
            obs[p["pos"]][j].append(p["vorp"])
            pts[p["pos"]][j].append(p["pts_reg"])
            pick_at[p["pos"]][j].append(p["pick_no"])

    curves = {}
    for pos in SKILL:
        maxj = max(obs[pos]) if obs[pos] else 0
        rows = []
        for j in range(1, maxj + 1):
            pool, ppool = [], []
            for k in range(j - 1, j + 2):           # +/- 1 positional rank
                pool.extend(obs[pos].get(k, []))
                ppool.extend(pts[pos].get(k, []))
            if not pool:
                continue
            rows.append({
                "j": j,
                "n": len(obs[pos].get(j, [])),
                "vorp_mean": round(statistics.mean(pool), 2),
                "vorp_sd": round(statistics.pstdev(pool), 2) if len(pool) > 1 else 25.0,
                "pts_mean": round(statistics.mean(ppool), 2),
                "samples": [round(v, 2) for v in pool],
                "avg_pick": round(statistics.mean(pick_at[pos].get(j, [0])), 1),
            })
        # Enforce monotone-decreasing expected value as more of a position goes
        # off the board. With n=3 per cell the raw curve is jagged noise; the
        # one thing we know a priori is that the 8th RB drafted cannot be worth
        # more in expectation than the 7th. Full pool-adjacent-violators, not a
        # single pairwise pass — a lone average can leave the run still violating.
        vals = [r["vorp_mean"] for r in rows]
        i = 1
        while i < len(vals):
            if vals[i] > vals[i - 1]:
                j = i
                while j > 0 and vals[j] > vals[j - 1]:
                    merged = statistics.mean(vals[j - 1:i + 1])
                    for t in range(j - 1, i + 1):
                        vals[t] = merged
                    j -= 1
            i += 1
        for r, v in zip(rows, vals):
            r["vorp_mean"] = round(v, 2)
        curves[pos] = rows
    return curves


def draft_flow():
    """
    How many of each position are off the board by pick N, on average.
    This is the league's revealed positional demand — the thing you are
    competing against when you decide to wait.
    """
    flow = {pos: [] for pos in SKILL}
    for n in range(0, N_TEAMS * ROUNDS + 1):
        for pos in SKILL:
            counts = []
            for s in SEASONS:
                counts.append(sum(1 for p in PICKS[s]
                                  if p["pick_no"] <= n and p["pos"] == pos))
            flow[pos].append(round(statistics.mean(counts), 2))
    return flow


# ---------------------------------------------------- 2. round x position value

def round_position_table():
    rows = []
    cells = defaultdict(list)
    for p in ALL_PICKS:
        if p["pos"] in SKILL:
            cells[(p["round"], p["pos"])].append(p)

    hit_rank = {"QB": 12, "RB": 24, "WR": 30, "TE": 10}
    for rd in range(1, ROUNDS + 1):
        for pos in SKILL:
            g = cells.get((rd, pos), [])
            if not g:
                continue
            vorp = [x["vorp"] for x in g]
            rows.append({
                "round": rd,
                "pos": pos,
                "n": len(g),
                "vorp_mean": round(statistics.mean(vorp), 1),
                "vorp_median": round(statistics.median(vorp), 1),
                "vorp_weighted": round(wmean([(x["vorp"], x["success_weight"]) for x in g]), 1),
                "pts_mean": round(statistics.mean([x["pts_reg"] for x in g]), 1),
                "resid_vorp": round(statistics.mean([x["residual_vorp"] for x in g]), 1),
                "hit_rate": round(sum(1 for x in g if (x["pos_rank"] or 999) <= hit_rank[pos]) / len(g), 3),
                "bust_rate": round(sum(1 for x in g if x["vorp"] < -20) / len(g), 3),
                "starter_pts": round(statistics.mean([x["pts_as_starter"] for x in g]), 1),
                "weeks_started": round(statistics.mean([x["weeks_started"] for x in g]), 1),
            })
    return rows


def best_position_by_round():
    """For each round, rank positions by success-weighted VORP with a shrinkage prior."""
    tbl = round_position_table()
    by_round = defaultdict(list)
    grand = statistics.mean([r["vorp_weighted"] for r in tbl])
    K = 6.0    # shrinkage strength: a cell with n=6 gets half its own signal
    for r in tbl:
        shrunk = (r["n"] * r["vorp_weighted"] + K * grand) / (r["n"] + K)
        by_round[r["round"]].append({**r, "vorp_shrunk": round(shrunk, 1)})
    for rd in by_round:
        by_round[rd].sort(key=lambda r: -r["vorp_shrunk"])
    return dict(by_round)


# --------------------------------------------------- 3. team-level construction

def team_profiles():
    rows = []
    for s, rid, t in team_rows():
        ps = team_picks(s, rid)
        skill = [p for p in ps if p["pos"] in SKILL]
        c_all = Counter(p["pos"] for p in ps)
        c4 = Counter(p["pos"] for p in ps if p["round"] <= 4)
        c6 = Counter(p["pos"] for p in ps if p["round"] <= 6)
        c8 = Counter(p["pos"] for p in ps if p["round"] <= 8)

        # value actually captured by the draft
        starter_pts = sum(p["pts_as_starter"] for p in ps)
        top_vorp = sorted([p["vorp"] for p in skill], reverse=True)
        elite = sum(1 for p in skill if p["vorp"] >= 100)
        busts = sum(1 for p in ps if p["round"] <= 6 and p["vorp"] < -20)

        rows.append({
            "season": s, "roster_id": rid, "owner": t["owner"],
            "slot": t["draft_slot"], "wins": t["wins"], "losses": t["losses"],
            "win_pct": t["win_pct"], "pts_for": t["pts_for"], "seed": t["seed"],
            "made_playoffs": t["made_playoffs"], "final_place": t.get("final_place"),
            "is_champion": t["is_champion"], "is_runner_up": t["is_runner_up"],
            "efficiency": t["efficiency"],
            "seq6": "-".join(p["pos"] for p in ps[:6]),
            "seq8": "-".join(p["pos"] for p in ps[:8]),
            "rb4": c4["RB"], "wr4": c4["WR"], "te4": c4["TE"], "qb4": c4["QB"],
            "rb6": c6["RB"], "wr6": c6["WR"], "te6": c6["TE"], "qb6": c6["QB"],
            "rb8": c8["RB"], "wr8": c8["WR"], "te8": c8["TE"], "qb8": c8["QB"],
            "rb_total": c_all["RB"], "wr_total": c_all["WR"],
            "te_total": c_all["TE"], "qb_total": c_all["QB"],
            "qb_round": min([p["round"] for p in ps if p["pos"] == "QB"], default=99),
            "te_round": min([p["round"] for p in ps if p["pos"] == "TE"], default=99),
            "k_round": min([p["round"] for p in ps if p["pos"] == "K"], default=99),
            "def_round": min([p["round"] for p in ps if p["pos"] == "DEF"], default=99),
            "draft_starter_pts": round(starter_pts, 1),
            "draft_vorp": round(sum(p["vorp"] for p in skill), 1),
            "top3_vorp": round(sum(top_vorp[:3]), 1),
            "top5_vorp": round(sum(top_vorp[:5]), 1),
            "elite_hits": elite,
            "early_busts": busts,
            "hit_rate_top6": round(sum(1 for p in ps[:6] if p["vorp"] > 0) / 6, 3),
        })
    return rows


def correlations(profiles):
    targets = {"pts_for": "Points For", "win_pct": "Win %"}
    variables = [
        ("wr6", "WRs in rounds 1-6"), ("rb6", "RBs in rounds 1-6"),
        ("wr4", "WRs in rounds 1-4"), ("rb4", "RBs in rounds 1-4"),
        ("te6", "TEs in rounds 1-6"), ("qb6", "QBs in rounds 1-6"),
        ("wr8", "WRs in rounds 1-8"), ("rb8", "RBs in rounds 1-8"),
        ("wr_total", "Total WRs drafted"), ("rb_total", "Total RBs drafted"),
        ("qb_round", "Round of first QB"), ("te_round", "Round of first TE"),
        ("k_round", "Round of kicker"), ("def_round", "Round of defense"),
        ("draft_starter_pts", "Points from drafted players (as starters)"),
        ("draft_vorp", "Total VORP drafted"),
        ("top3_vorp", "VORP of top 3 picks"), ("top5_vorp", "VORP of top 5 picks"),
        ("elite_hits", "Elite hits (VORP>=100)"), ("early_busts", "Busts in rounds 1-6"),
        ("hit_rate_top6", "Hit rate, first 6 picks"),
    ]
    out = []
    for var, label in variables:
        xs = [p[var] for p in profiles]
        row = {"var": var, "label": label}
        for tk, tlabel in targets.items():
            ys = [p[tk] for p in profiles]
            r, pv = pearson(xs, ys)
            row[tk] = {"r": r, "p": pv}
        out.append(row)
    out.sort(key=lambda r: -abs(r["pts_for"]["r"]))
    return out


# ------------------------------------------------------------ 4. pick grades

def pick_grades():
    rows = []
    for p in ALL_PICKS:
        if p["pos"] not in SKILL:
            continue
        rows.append({
            "season": p["season"], "pick_no": p["pick_no"], "round": p["round"],
            "slot": p["slot"], "owner": p["owner"], "name": p["name"],
            "pos": p["pos"], "pos_label": p.get("pos_label"),
            "pts_reg": p["pts_reg"], "vorp": p["vorp"],
            "residual_vorp": p["residual_vorp"], "residual": p["residual"],
            "pts_as_starter": p["pts_as_starter"], "weeks_started": p["weeks_started"],
            "is_keeper": p["is_keeper"],
            "best_available": p.get("best_available"),
            "best_available_pts": p.get("best_available_pts"),
            "points_left_on_board": p.get("points_left_on_board"),
            "final_place": p.get("final_place"),
            "is_champion": p.get("is_champion"),
        })
    rows.sort(key=lambda r: -r["residual_vorp"])
    return rows


def biggest_misses():
    """Picks where a far better player at the same position went shortly after."""
    misses = []
    for s in SEASONS:
        rows = sorted(PICKS[s], key=lambda x: x["pick_no"])
        for i, p in enumerate(rows):
            if p["pos"] not in SKILL or p["round"] > 10:
                continue
            # same-position players taken in the next 24 picks
            later = [q for q in rows[i + 1:i + 25] if q["pos"] == p["pos"]]
            if not later:
                continue
            best = max(later, key=lambda q: q["vorp"])
            gap = best["vorp"] - p["vorp"]
            if gap > 60:
                misses.append({
                    "season": s, "pick_no": p["pick_no"], "round": p["round"],
                    "owner": p["owner"], "took": p["name"], "took_vorp": p["vorp"],
                    "pos": p["pos"], "instead_of": best["name"],
                    "instead_pick": best["pick_no"], "instead_vorp": best["vorp"],
                    "gap": round(gap, 1),
                })
    misses.sort(key=lambda m: -m["gap"])
    return misses


# ------------------------------------------- 5. champions vs the rest

def cohort_compare(profiles):
    cohorts = {
        "champions": [p for p in profiles if p["is_champion"]],
        "finalists": [p for p in profiles if p["is_champion"] or p["is_runner_up"]],
        "top4": [p for p in profiles if (p["final_place"] or 99) <= 4],
        "playoff": [p for p in profiles if p["made_playoffs"]],
        "missed": [p for p in profiles if not p["made_playoffs"]],
        "bottom4": [p for p in profiles if p["seed"] >= 9],
        "all": profiles,
    }
    fields = ["rb4", "wr4", "te4", "qb4", "rb6", "wr6", "te6", "qb6",
              "rb_total", "wr_total", "te_total", "qb_total",
              "qb_round", "te_round", "k_round", "def_round",
              "draft_starter_pts", "draft_vorp", "top3_vorp", "top5_vorp",
              "elite_hits", "early_busts", "hit_rate_top6",
              "pts_for", "win_pct", "efficiency"]
    # 99 is the "never drafted one" sentinel on the *_round fields only. Applying
    # that cutoff to every field silently deleted points-for, VORP and starter
    # points from the comparison — all of which are far larger than 99.
    SENTINEL_FIELDS = {"qb_round", "te_round", "k_round", "def_round"}
    out = {}
    for name, group in cohorts.items():
        if not group:
            continue
        out[name] = {"n": len(group)}
        for f in fields:
            vals = [g[f] for g in group if g[f] is not None]
            if f in SENTINEL_FIELDS:
                vals = [v for v in vals if v < 90]
            if vals:
                out[name][f] = round(statistics.mean(vals), 2)
    return out


def strategy_winrates(profiles):
    """Group team-seasons by early-draft archetype and score the outcomes."""
    def bucket(p):
        return f"{p['rb4']}RB/{p['wr4']}WR" + (f"/{p['te4']}TE" if p["te4"] else "") + \
               (f"/{p['qb4']}QB" if p["qb4"] else "")

    groups = defaultdict(list)
    for p in profiles:
        groups[bucket(p)].append(p)

    rows = []
    for k, g in groups.items():
        rows.append({
            "strategy": k, "n": len(g),
            "avg_pts": round(statistics.mean([x["pts_for"] for x in g]), 1),
            "avg_win_pct": round(statistics.mean([x["win_pct"] for x in g]), 3),
            "playoff_rate": round(sum(1 for x in g if x["made_playoffs"]) / len(g), 3),
            "champs": sum(1 for x in g if x["is_champion"]),
            "finals": sum(1 for x in g if x["is_champion"] or x["is_runner_up"]),
            "teams": [f"{x['owner']} {x['season']}" for x in g],
        })
    rows.sort(key=lambda r: (-r["playoff_rate"], -r["avg_pts"]))

    # Simpler, higher-n cut: does the team go RB-first or WR-first?
    simple = defaultdict(list)
    for p in profiles:
        first = p["seq6"].split("-")[0]
        simple[f"R1 {first}"].append(p)
    for p in profiles:
        simple["WR-heavy start (3+ WR in R1-4)" if p["wr4"] >= 3
               else ("RB-heavy start (3+ RB in R1-4)" if p["rb4"] >= 3
                     else "Balanced start (2/2)")].append(p)
    simple_rows = []
    for k, g in simple.items():
        simple_rows.append({
            "strategy": k, "n": len(g),
            "avg_pts": round(statistics.mean([x["pts_for"] for x in g]), 1),
            "avg_win_pct": round(statistics.mean([x["win_pct"] for x in g]), 3),
            "playoff_rate": round(sum(1 for x in g if x["made_playoffs"]) / len(g), 3),
            "champs": sum(1 for x in g if x["is_champion"]),
        })
    simple_rows.sort(key=lambda r: -r["avg_pts"])
    return rows, simple_rows


def slot_history():
    rows = defaultdict(list)
    for s, rid, t in team_rows():
        rows[t["draft_slot"]].append(t)
    out = []
    for slot in range(1, N_TEAMS + 1):
        g = rows.get(slot, [])
        if not g:
            continue
        out.append({
            "slot": slot, "n": len(g),
            "avg_pts": round(statistics.mean([x["pts_for"] for x in g]), 1),
            "avg_win_pct": round(statistics.mean([x["win_pct"] for x in g]), 3),
            "playoff_rate": round(sum(1 for x in g if x["made_playoffs"]) / len(g), 3),
            "champs": sum(1 for x in g if x["is_champion"]),
            "owners": [f"{x['owner']} {x['season']} ({x.get('final_place') or '-'})" for x in g],
        })
    return out


# ------------------------------------------------------- 6. the optimizer

class DraftModel:
    """
    Monte Carlo model of what a strategy is worth at a given draft slot.

    Positional scarcity is learned from the league's own three drafts: we know
    how many RB/WR/TE/QB are typically gone by any pick, and what the j-th
    player off the board at each position actually returned. Simulating a
    strategy draws real historical outcomes rather than point estimates, so
    variance and depth are priced correctly instead of assumed away.
    """

    # Position-specific bust floors, MEASURED (pipeline/replacement.py) from what
    # teams actually got when they started a player they hadn't drafted. A busted
    # QB costs little because 20% of QB starts already come off the wire; a busted
    # WR costs most because the league rosters nearly every usable one.
    FLOOR = {"QB": -36.2, "RB": -44.3, "WR": -49.0, "TE": -25.4}
    BENCH_W = 0.15       # what depth is worth once starters are covered
    EMPTY = -80.0        # cost of going into a week with no drafted starter

    def __init__(self, scarcity, flow, floor=None, bench_w=None, empty=None):
        self.scarcity = scarcity
        self.flow = flow
        self.floor = dict(self.FLOOR) if floor is None else floor
        if isinstance(self.floor, (int, float)):
            self.floor = {p: float(self.floor) for p in SKILL}
        self.bench_w = self.BENCH_W if bench_w is None else bench_w
        self.empty = self.EMPTY if empty is None else empty
        self.pool = {pos: {r["j"]: r["samples"] for r in scarcity[pos]} for pos in SKILL}
        self.maxj = {pos: (max(self.pool[pos]) if self.pool[pos] else 1) for pos in SKILL}
        # Value floor for a position we've exhausted the history for.
        self.tail = {pos: min(
            (r["vorp_mean"] for r in scarcity[pos]), default=-60.0) for pos in SKILL}
        # Every historical (pick_no, vorp) observation, indexed by position.
        self.by_pos_pick = {pos: [] for pos in SKILL}
        self.by_season_pos_pick = {s: {pos: [] for pos in SKILL} for s in SEASONS}
        for s in SEASONS:
            for p in PICKS[s]:
                if p["pos"] in SKILL:
                    self.by_pos_pick[p["pos"]].append((p["pick_no"], p["vorp"]))
                    self.by_season_pos_pick[s][p["pos"]].append((p["pick_no"], p["vorp"]))
        self._pool_cache = {}
        self._shrink_cache = {}
        self._stats_cache = {}
        self._edges = None
        self._rel = None
        self._dev = None

        # Pick-conditional pools describe a LEAGUE-AVERAGE drafter at that pick.
        # If I hoard a position, the players left for my own later picks at it
        # are worse than that average by roughly the slope of its scarcity
        # curve. Charge each extra body at a position that slope.
        self.self_depletion = {}
        for pos in SKILL:
            rows = scarcity[pos]
            if len(rows) >= 8:
                span = rows[0]["vorp_mean"] - rows[min(15, len(rows) - 1)]["vorp_mean"]
                steps = min(15, len(rows) - 1)
                self.self_depletion[pos] = max(0.0, span / steps)
            else:
                self.self_depletion[pos] = 4.0

    def expected_j(self, pos, pick_no, my_taken):
        """How many players at this position are gone when my pick arrives."""
        base = self.flow[pos][min(pick_no, len(self.flow[pos]) - 1)]
        return max(1, int(round(base)) + 1)

    def pick_pool(self, pos, pick_no, bandwidth=18.0, min_n=8):
        """
        What this position has actually returned when taken around this pick.

        Preferred over the j-th-player-off-the-board curve, which distorts
        exactly where it matters most: smoothing across adjacent positional
        ranks let elite round-2 quarterbacks leak into the round-3 estimate and
        made QB-at-25 look like +33 VORP when round-3 QBs really returned +9.
        Sampling conditioned directly on pick number asks the question we
        actually care about — "take this position here, and what happens?"

        Falls back to the scarcity curve when a position is too thinly drafted
        near this pick to estimate from.
        """
        key = (pos, pick_no)
        if key in self._pool_cache:
            return self._pool_cache[key]
        weighted = []
        for pk, v in self.by_pos_pick[pos]:
            d = abs(pk - pick_no)
            if d <= 3 * bandwidth:
                w = math.exp(-0.5 * (d / bandwidth) ** 2)
                weighted.append((v, w))
        eff_n = sum(w for _, w in weighted)
        if eff_n < min_n:
            self._pool_cache[key] = None
            return None
        # Expand into a resampling pool with frequency proportional to weight.
        pool = []
        for v, w in weighted:
            for _ in range(max(1, int(round(w * 10)))):
                pool.append(v)
        self._pool_cache[key] = pool
        return pool

    def pool_stats(self, pos, pick_no):
        """(mean, sd, effective n) of the pick-conditional pool, or None."""
        key = (pos, pick_no)
        if key in self._stats_cache:
            return self._stats_cache[key]
        pool = self.pick_pool(pos, pick_no)
        if not pool:
            self._stats_cache[key] = None
            return None
        n_eff = len(pool) / 10.0
        mean = statistics.mean(pool)
        sd = statistics.pstdev(pool) if len(pool) > 1 else 40.0
        self._stats_cache[key] = (mean, sd, n_eff)
        return self._stats_cache[key]

    ANCHORS = tuple(range(6, N_TEAMS * ROUNDS + 1, 6))

    def _season_dev(self, pos, pick_no, season, bw=30.0):
        """One season's positional deviation from the all-position mean at a pick."""
        per = {}
        for p in SKILL:
            num = den = 0.0
            for pk, v in self.by_season_pos_pick[season][p]:
                d = abs(pk - pick_no)
                if d <= 3 * bw:
                    w = math.exp(-0.5 * (d / bw) ** 2)
                    num += w * v
                    den += w
            if den >= 2.5:
                per[p] = num / den
        if pos not in per or len(per) < 2:
            return None
        return per[pos] - statistics.mean(per.values())

    def _build_reliability(self):
        """
        One reliability weight per position, from how well its edge repeats.

        Estimating a separate shrinkage factor for every 2-round block was
        itself too noisy with three seasons — it swung between 0.00 and 0.89 on
        adjacent blocks and produced an artificial cliff where a position's
        value jumped 60 points between rounds 4 and 5 purely because a different
        block answered. One weight per position, applied to a smooth per-pick
        deviation curve, keeps the shape the data shows and scales it by how
        much of that shape survives from season to season.
        """
        rel, curves = {}, {}
        for pos in SKILL:
            sig, noise, dev_curve = [], [], {}
            for pick in self.ANCHORS:
                devs = [self._season_dev(pos, pick, s) for s in SEASONS]
                devs = [d for d in devs if d is not None]
                if len(devs) < 2:
                    continue
                bar = statistics.mean(devs)
                dev_curve[pick] = bar
                sig.append(bar ** 2)
                noise.append(statistics.pvariance(devs) / len(devs))
            if not sig:
                rel[pos], curves[pos] = 0.0, {}
                continue
            s_, n_ = statistics.mean(sig), statistics.mean(noise)
            rel[pos] = s_ / (s_ + n_) if (s_ + n_) > 0 else 0.0
            curves[pos] = dev_curve
        return rel, curves

    def _build_shrinkage(self, block=24):
        """
        Shrink each position's edge by how well it REPLICATES across seasons.

        Pooling all three years and comparing standard errors at a single pick
        over-shrinks: it declares every position identical in the middle rounds
        and throws away QB's collapse, which is real and shows up every year.
        The better evidence of whether an edge is signal is whether it recurs.
        So each (position, ~2-round block) gets three independent season
        estimates, and the pooled edge is kept in proportion to how much of its
        spread is between-position rather than between-season noise.

        RB-over-WR in rounds 1-4 is +31 and +43 in 2024-25 but -23 in 2023, so
        it shrinks hard. QB's late-round deficit is negative all three years, so
        it survives nearly intact.
        """
        n_picks = N_TEAMS * ROUNDS
        per = defaultdict(lambda: defaultdict(list))     # (blk, pos) -> season -> [vorp]
        for s in SEASONS:
            for p in PICKS[s]:
                if p["pos"] in SKILL:
                    blk = (p["pick_no"] - 1) // block
                    per[(blk, p["pos"])][s].append(p["vorp"])

        edges = {}
        for blk in range(0, n_picks // block + 1):
            season_means = {}
            for pos in SKILL:
                d = per[(blk, pos)]
                sm = {s: statistics.mean(v) for s, v in d.items() if len(v) >= 2}
                if len(sm) >= 2:
                    season_means[pos] = sm
            if len(season_means) < 2:
                continue
            # grand mean per season, then each position's deviation from it
            devs = defaultdict(list)
            for s in SEASONS:
                vals = [sm[s] for sm in season_means.values() if s in sm]
                if len(vals) < 2:
                    continue
                g = statistics.mean(vals)
                for pos, sm in season_means.items():
                    if s in sm:
                        devs[pos].append(sm[s] - g)
            pooled = {p: statistics.mean(v) for p, v in devs.items() if v}
            if not pooled:
                continue
            # between-position signal vs between-season noise
            between = statistics.pvariance(list(pooled.values())) if len(pooled) > 1 else 0.0
            noises = [statistics.pvariance(v) / len(v) for v in devs.values() if len(v) > 1]
            noise = statistics.mean(noises) if noises else 0.0
            tau2 = max(0.0, between - noise)
            b = tau2 / (tau2 + noise) if (tau2 + noise) > 0 else 0.0
            edges[blk] = {"b": b, "dev": pooled}
        return edges

    def shrunk_mean(self, pos, pick_no):
        """Pick-conditional mean with its positional edge shrunk by replicability."""
        key = (pos, pick_no)
        if key in self._shrink_cache:
            return self._shrink_cache[key]
        self._shrink_cache[key] = v = self._shrunk_mean(pos, pick_no)
        return v

    def _shrunk_mean(self, pos, pick_no):
        if self._rel is None:
            self._rel, self._dev = self._build_reliability()
        stats = {p: self.pool_stats(p, pick_no) for p in SKILL}
        have = {p: s for p, s in stats.items() if s}
        if pos not in have or len(have) < 2:
            return None
        grand = statistics.mean([s[0] for s in have.values()])
        curve = self._dev.get(pos) or {}
        if not curve:
            return grand
        anchor = min(curve, key=lambda a: abs(a - pick_no))
        if abs(anchor - pick_no) > 24:
            return grand
        return grand + self._rel[pos] * curve[anchor]

    def draw(self, pos, j, rng):
        samples = self.pool[pos].get(j)
        if not samples:
            j2 = min(j, self.maxj[pos])
            samples = self.pool[pos].get(j2)
        if not samples:
            return self.tail[pos]
        v = rng.choice(samples)
        # Deeper than anything in the sample: decay toward the tail.
        if j > self.maxj[pos]:
            v -= 8.0 * (j - self.maxj[pos])
        return v

    def lineup_value(self, roster):
        """
        Only starters score. Value a roster by the lineup it can field, with a
        discount for the bench depth that covers byes and injuries.

        A drafted player's damage is floored: nobody starts a sub-replacement
        player for 14 weeks, they cut him and stream the position. Season-long
        VORP of -190 is what the pick cost in hindsight, not what it cost the
        lineup, and using it raw makes the model wildly overvalue bust-avoidance.
        """
        by_pos = defaultdict(list)
        for pos, v in roster:
            by_pos[pos].append(max(v, self.floor.get(pos, -45.0)))
        for pos in by_pos:
            by_pos[pos].sort(reverse=True)

        total = 0.0
        leftovers = []
        for pos, n in LINEUP.items():
            got = by_pos.get(pos, [])
            for i in range(n):
                total += got[i] if i < len(got) else self.empty
            leftovers.extend(got[n:] if len(got) > n else [])

        flex_pool = sorted(leftovers, reverse=True)
        for i in range(N_FLEX):
            total += flex_pool[i] if i < len(flex_pool) else self.empty

        # Bench: insurance + trade capital, worth a fraction of face value.
        bench = flex_pool[N_FLEX:]
        total += self.bench_w * sum(v for v in bench if v > 0)
        return total

    def plan(self, slot, sequence):
        """Resolve a strategy into the (position, positional-rank) it actually buys."""
        picks = snake_picks(slot)
        taken = Counter()
        out = []
        for rd, pos in enumerate(sequence):
            if pos in ("K", "DEF"):
                continue
            taken[pos] += 1
            j = self.expected_j(pos, picks[rd], taken) + (taken[pos] - 1)
            out.append((pos, j))
        return out

    def evaluate(self, slot, sequence, trials=4000, seed=1):
        """sequence: list of positions, one per round (K/DEF included)."""
        rng = random.Random(seed)
        # The scarcity lookup is identical across trials — resolve it once and
        # let the trials do nothing but draw and score.
        picks = snake_picks(slot)
        plan = self.plan(slot, sequence)
        skill_picks = [pk for pk, pos in zip(picks, sequence) if pos in SKILL]
        pools = []
        mine = Counter()
        for (pos, j), pick_no in zip(plan, skill_picks):
            samples = self.pick_pool(pos, pick_no)
            decay = self.self_depletion[pos] * mine[pos]
            mine[pos] += 1
            if samples is None:
                samples = self.pool[pos].get(j) or self.pool[pos].get(min(j, self.maxj[pos]))
                decay += 8.0 * max(0, j - self.maxj[pos])
                samples = samples or [self.tail[pos]]
            else:
                # Re-centre the empirical draws on the shrunk mean: keep the real
                # shape and spread of outcomes, move only the centre to what the
                # sample size can actually support.
                shrunk = self.shrunk_mean(pos, pick_no)
                if shrunk is not None:
                    decay += statistics.mean(samples) - shrunk
            pools.append((pos, samples, decay))

        choice = rng.choice
        vals = []
        for _ in range(trials):
            roster = [(pos, choice(s) - d) for pos, s, d in pools]
            vals.append(self.lineup_value(roster))
        vals.sort()
        return {
            "mean": round(statistics.mean(vals), 1),
            "median": round(statistics.median(vals), 1),
            "p25": round(vals[len(vals) // 4], 1),
            "p75": round(vals[3 * len(vals) // 4], 1),
            "p10": round(vals[len(vals) // 10], 1),
            "p90": round(vals[9 * len(vals) // 10], 1),
        }


def calibrate(scarcity, flow, profiles):
    """
    Fit the objective's three free parameters to reality.

    Rather than assert what a bust costs or what a bench is worth, grid-search
    the values that make lineup_value() best predict the points the 36 real
    teams actually scored. The objective then earns its authority from the
    league's own results instead of from my priors.
    """
    rosters, actual = [], []
    for p in profiles:
        ps = team_picks(p["season"], p["roster_id"])
        rosters.append([(q["pos"], q["vorp"]) for q in ps if q["pos"] in SKILL])
        actual.append(p["pts_for"])

    measured = DraftModel.FLOOR
    grid = []
    floor_options = {
        "measured": measured,                                    # from replacement.py
        "measured_x1.5": {p: v * 1.5 for p, v in measured.items()},
        "measured_x0.5": {p: v * 0.5 for p, v in measured.items()},
        "flat_-45": {p: -45.0 for p in SKILL},
        "flat_-80": {p: -80.0 for p in SKILL},
        "raw_(no floor)": {p: -1e9 for p in SKILL},
        "zero": {p: 0.0 for p in SKILL},
    }
    for fname, floor in floor_options.items():
        for bench_w in (0.0, 0.1, 0.15, 0.2, 0.3, 0.45):
            m = DraftModel(scarcity, flow, floor, bench_w, -80.0)
            obj = [m.lineup_value(r) for r in rosters]
            r, _ = pearson(obj, actual, trials=1)   # p-value not needed in the loop
            grid.append({"floor": fname, "bench_weight": bench_w, "r": round(r, 4)})
    grid.sort(key=lambda g: -g["r"])

    # Deliberately NOT argmax-selected. The surface is flat to ~0.03 in r, so at
    # n=36 the best cell is indistinguishable from dozens of others and chasing
    # it fits noise. The floors instead come from direct measurement of what the
    # waiver wire actually returned, which is evidence rather than a fitted knob;
    # calibration is used only to confirm those values sit on the ridge.
    floor, bench_w, empty = measured, 0.15, -80.0
    m = DraftModel(scarcity, flow, floor, bench_w, empty)
    obj = [m.lineup_value(r_) for r_ in rosters]
    r_final, p_final = pearson(obj, actual)
    return {
        "floor": floor, "bench_weight": bench_w, "empty_slot": empty,
        "r": r_final, "p": p_final,
        "grid": grid[:8], "grid_worst": grid[-1],
        "grid_spread": round(grid[0]["r"] - grid[-1]["r"], 4),
        "selection": "measured floors + robust bench weight, not the grid argmax",
    }


def optimize_slot(model, slot, beam=140, trials=1200, skill_rounds=14):
    """
    Beam search over position sequences for one draft slot.

    Rounds 15-16 are reserved for K and DEF (the league has always spent late
    picks there and the value difference is negligible), leaving 14 rounds of
    real choices. The beam keeps the best partial builds at each round and
    re-scores them by full-season Monte Carlo at the end.
    """
    need_min = {"QB": 1, "RB": 4, "WR": 4, "TE": 1}
    # QB capped at one. There is a single QB slot, a second quarterback can never
    # enter the lineup, and 20% of this league's QB starts already come off the
    # waiver wire — so a backup contributes nothing the model can score. Without
    # the cap the search emits a second QB in the dead rounds purely because every
    # option there is equally worthless, which reads as advice rather than a tie.
    cap = {"QB": 1, "RB": 7, "WR": 8, "TE": 3}

    states = [([], Counter())]
    for rd in range(skill_rounds):
        cand = []
        rounds_left = skill_rounds - rd - 1
        for seq, cnt in states:
            for pos in SKILL:
                if cnt[pos] >= cap[pos]:
                    continue
                c2 = Counter(cnt)
                c2[pos] += 1
                # prune: can we still satisfy minimum roster needs?
                deficit = sum(max(0, need_min[p] - c2[p]) for p in SKILL)
                if deficit > rounds_left:
                    continue
                cand.append((seq + [pos], c2))
        scored = []
        for seq, cnt in cand:
            full = seq + _filler(cnt, skill_rounds - len(seq))
            s = model.evaluate(slot, full, trials=300, seed=100 + rd)["mean"]
            scored.append((s, seq, cnt))
        scored.sort(key=lambda x: -x[0])
        states = [(seq, cnt) for _, seq, cnt in scored[:beam]]

    finals = []
    for seq, cnt in states:
        r = model.evaluate(slot, seq, trials=trials, seed=999)
        finals.append({"sequence": seq, **r})
    finals.sort(key=lambda f: -f["mean"])
    return finals


def _filler(cnt, n):
    """Fill remaining rounds greedily with the positions still needed."""
    need = {"QB": 1, "RB": 4, "WR": 4, "TE": 1}
    out = []
    c = Counter(cnt)
    for _ in range(max(0, n)):
        gaps = [(need[p] - c[p], p) for p in SKILL if c[p] < need[p]]
        if gaps:
            gaps.sort(reverse=True)
            p = gaps[0][1]
        else:
            p = "WR"
        c[p] += 1
        out.append(p)
    return out


# ------------------------------------------------------------------- report

def main():
    print("building positional scarcity curves…")
    scarcity = positional_scarcity()
    flow = draft_flow()

    print("scoring rounds x positions…")
    rp_table = round_position_table()
    best_by_round = best_position_by_round()

    print("profiling teams…")
    profiles = team_profiles()

    print("calibrating the objective against the 36 real teams…")
    cal = calibrate(scarcity, flow, profiles)
    print(f"   floor={cal['floor']}  bench_weight={cal['bench_weight']}  "
          f"empty_slot={cal['empty_slot']}")
    print(f"   lineup_value vs actual points-for: r={cal['r']:+.3f} (p={cal['p']:.4f})")
    model = DraftModel(scarcity, flow, cal["floor"], cal["bench_weight"], cal["empty_slot"])
    r_obj, p_obj = cal["r"], cal["p"]

    print("running correlations…")
    corrs = correlations(profiles)

    print("grading picks…")
    grades = pick_grades()
    misses = biggest_misses()

    print("comparing cohorts…")
    cohorts = cohort_compare(profiles)
    strat, simple_strat = strategy_winrates(profiles)
    slots = slot_history()

    print("optimizing all 12 draft slots (Monte Carlo beam search)…")
    optimal = {}
    for slot in range(1, N_TEAMS + 1):
        res = optimize_slot(model, slot, beam=48, trials=2500)
        top = res[:6]
        optimal[slot] = {
            "picks": snake_picks(slot),
            "best": top[0],
            "alternatives": top[1:],
        }
        seq = "-".join(top[0]["sequence"][:8])
        print(f"   slot {slot:>2}: {seq}…  value={top[0]['mean']:.0f} "
              f"(p10 {top[0]['p10']:.0f} / p90 {top[0]['p90']:.0f})")

    # Value of each position by round, expressed as "where does this position
    # give you the most edge over what else is on the board"
    print("computing positional edge by round…")
    edge = {}
    for rd in range(1, ROUNDS + 1):
        mid_pick = (rd - 1) * N_TEAMS + N_TEAMS // 2
        row = {}
        for pos in SKILL:
            j = model.expected_j(pos, mid_pick, Counter())
            entry = next((r for r in scarcity[pos] if r["j"] == min(j, model.maxj[pos])), None)
            row[pos] = entry["vorp_mean"] if entry else model.tail[pos]
        edge[rd] = {k: round(v, 1) for k, v in row.items()}

    # The curve the optimizer actually reasons over: raw pick-conditional value
    # next to the version shrunk by how well each position's edge replicates.
    print("exporting value curves…")
    rel, _dev = model._build_reliability()
    shrunk_curve = {}
    for rd in range(1, ROUNDS + 1):
        mid = (rd - 1) * N_TEAMS + N_TEAMS // 2
        shrunk_curve[rd] = {
            pos: {
                "raw": round(model.pool_stats(pos, mid)[0], 1)
                if model.pool_stats(pos, mid) else None,
                "shrunk": round(model.shrunk_mean(pos, mid), 1)
                if model.shrunk_mean(pos, mid) is not None else None,
            }
            for pos in SKILL
        }

    # Named strategies scored at every slot, so the reader can see how small the
    # gap between the "optimal" build and a sane balanced one actually is.
    print("scoring named strategies at every slot…")
    NAMED = {
        "RB-heavy": ["RB", "RB", "RB", "RB", "WR", "TE", "WR", "QB", "WR", "RB", "WR", "TE", "WR", "WR"],
        "Balanced": ["RB", "WR", "RB", "WR", "TE", "WR", "RB", "QB", "WR", "RB", "WR", "TE", "WR", "RB"],
        "WR-first": ["WR", "WR", "RB", "RB", "TE", "WR", "RB", "QB", "WR", "RB", "WR", "TE", "WR", "WR"],
        "Hero RB": ["RB", "WR", "WR", "WR", "TE", "WR", "RB", "QB", "RB", "WR", "RB", "TE", "WR", "WR"],
        "Zero RB": ["WR", "WR", "WR", "TE", "RB", "WR", "RB", "QB", "RB", "WR", "RB", "TE", "WR", "WR"],
        "Elite QB early": ["QB", "RB", "WR", "RB", "WR", "TE", "WR", "RB", "WR", "RB", "WR", "TE", "WR", "WR"],
        "Early TE": ["RB", "WR", "TE", "RB", "WR", "WR", "RB", "QB", "WR", "RB", "WR", "WR", "TE", "WR"],
        "Mid QB (R6)": ["RB", "WR", "RB", "WR", "TE", "QB", "WR", "RB", "WR", "RB", "WR", "TE", "WR", "WR"],
    }
    named = {}
    for name, seq in NAMED.items():
        named[name] = {
            "sequence": seq,
            "by_slot": {s: model.evaluate(s, seq, trials=6000, seed=17)["mean"]
                        for s in range(1, N_TEAMS + 1)},
        }

    out = {
        "meta": {
            "seasons": SEASONS,
            "n_teams": N_TEAMS,
            "rounds": ROUNDS,
            "n_team_seasons": len(profiles),
            "n_picks": len(ALL_PICKS),
            "starter_demand": C["starter_demand"],
            "replacement_baselines": C["replacement_baselines"],
            "replacement_points": C.get("replacement_points"),
            "waiver_blend": C.get("waiver_blend"),
            "objective_validation": {"r": r_obj, "p": p_obj},
            "calibration": cal,
            "reliability": {k: round(v, 3) for k, v in rel.items()},
        },
        "shrunk_curve": shrunk_curve,
        "named_strategies": named,
        "scarcity": scarcity,
        "draft_flow": flow,
        "round_position": rp_table,
        "best_by_round": best_by_round,
        "positional_edge_by_round": edge,
        "profiles": profiles,
        "correlations": corrs,
        "pick_grades": grades,
        "biggest_misses": misses,
        "cohorts": cohorts,
        "strategies": strat,
        "strategies_simple": simple_strat,
        "slots": slots,
        "optimal_by_slot": optimal,
        "expectation_curve": C["expectation_curve"],
        "expectation_curve_vorp": C["expectation_curve_vorp"],
    }
    path = os.path.join(DERIVED, "analysis.json")
    with open(path, "w") as f:
        json.dump(out, f)
    print(f"\nwrote {path} ({os.path.getsize(path)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
