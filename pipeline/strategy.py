"""
The 2026 draft strategy, given the keeper actually declared.

Keeping a player changes the draft in three ways at once, and the generic
per-slot optimum in analysis.json accounts for none of them:

  1. You lose a pick. Caleb Williams costs round 10, so pick 118 is gone and
     the sequence runs over 15 picks, not 16.
  2. A starting slot is already filled. The league starts one quarterback, so a
     second one can never enter the lineup — QB drops out of the search
     entirely rather than merely being deprioritised.
  3. The rounds shift. Everything that would have happened at round 10 now has
     to happen at 9 or 11, which moves the whole back half of the plan.

The keeper is priced at the pick the market says he costs (his ADP), not at the
pick you actually pay, and he is drawn from the same empirical distribution as
anyone taken there. Using his raw 2026 projection instead would hand him a
certainty no drafted player gets — this model is calibrated against realised
outcomes, and projections do not regress while results do.

Writes data/derived/strategy.json
"""

import json
import os
import statistics
from collections import Counter

from analyze import (
    DERIVED, N_TEAMS, ROUNDS, SKILL,
    DraftModel, calibrate, draft_flow, positional_scarcity, snake_picks, team_profiles,
)

MY_SLOT = 10
# Rounds 15-16 have always gone to K and DEF in this league and the value
# difference there is negligible, so they are not part of the search.
RESERVED_TAIL = 2


def keeper_filler(cnt, n, need):
    out, c = [], Counter(cnt)
    for _ in range(max(0, n)):
        gaps = [(need[p] - c[p], p) for p in SKILL if c[p] < need[p]]
        p = sorted(gaps, reverse=True)[0][1] if gaps else "WR"
        c[p] += 1
        out.append(p)
    return out


def optimize(model, slot, picks, owned, need_min, cap, skill_rounds, beam=48, trials=2500):
    states = [([], Counter())]
    for rd in range(skill_rounds):
        cand = []
        left = skill_rounds - rd - 1
        for seq, cnt in states:
            for pos in SKILL:
                if cnt[pos] >= cap[pos]:
                    continue
                c2 = Counter(cnt)
                c2[pos] += 1
                if sum(max(0, need_min[p] - c2[p]) for p in SKILL) > left:
                    continue
                cand.append((seq + [pos], c2))
        scored = []
        for seq, cnt in cand:
            full = seq + keeper_filler(cnt, skill_rounds - len(seq), need_min)
            s = model.evaluate(slot, full, trials=300, seed=100 + rd,
                               picks=picks, owned=owned)["mean"]
            scored.append((s, seq, cnt))
        scored.sort(key=lambda x: -x[0])
        states = [(seq, cnt) for _, seq, cnt in scored[:beam]]

    finals = []
    for seq, cnt in states:
        r = model.evaluate(slot, seq, trials=trials, seed=999, picks=picks, owned=owned)
        finals.append({"sequence": seq, **r})
    finals.sort(key=lambda f: -f["mean"])
    return finals


def main():
    keeper_data = json.load(open(os.path.join(DERIVED, "keeper.json")))
    chosen = keeper_data.get("chosen")
    if not chosen:
        raise SystemExit("no keeper declared in keeper.json — nothing to plan around")

    all_picks = snake_picks(MY_SLOT)
    keeper_round = chosen["keep_round"]
    keeper_pick = chosen["keep_pick"]
    # The pick the keeper costs simply leaves your list.
    picks = [p for p in all_picks if p != keeper_pick]
    rounds = [r for r in range(1, ROUNDS + 1) if r != keeper_round]
    skill_rounds = len(picks) - RESERVED_TAIL

    print(f"keeper: {chosen['name']} ({chosen['pos']}) at R{keeper_round}, pick {keeper_pick}")
    print(f"picks left: {len(picks)}  rounds: {rounds}")

    print("\nbuilding the model…")
    scarcity = positional_scarcity()
    flow = draft_flow()
    profiles = team_profiles()
    cal = calibrate(scarcity, flow, profiles)
    model = DraftModel(scarcity, flow, cal["floor"], cal["bench_weight"], cal["empty_slot"])
    print(f"   objective vs the 36 real teams: r={cal['r']:+.3f} (p={cal['p']:.4f})")

    # How to price a player you already own is the whole ballgame, and the three
    # defensible answers do not agree:
    #
    #   market      what a player taken at his ADP has historically returned.
    #               Properly regressed, but blind to who he actually is.
    #   projection  his 2026 forecast. Knows exactly who he is, but a point
    #               forecast carries no uncertainty, so it hands him a certainty
    #               every drafted player on the roster is denied.
    #   blend       the projection regressed toward the market by how well that
    #               position's projections have actually predicted results —
    #               measured over 12,322 player-weeks. QB is r=0.39, the least
    #               reliable of any position; RB is r=0.69.
    #
    # The blend is the honest one, and it is what the plan below is built on.
    proj_model = json.load(open(os.path.join(DERIVED, "projection_model.json")))["by_position"]

    def market_value(pos, adp):
        shrunk = model.shrunk_mean(pos, adp)
        if shrunk is not None:
            return shrunk
        pool = model.pick_pool(pos, adp)
        return statistics.mean(pool) if pool else model.tail[pos]

    def priced(opt, how):
        pos, adp = opt["pos"], int(round(opt["adp"]))
        if how == "market":
            return (pos, adp)
        mkt = market_value(pos, adp)
        if how == "projection":
            return (pos, adp, opt["vorp"])
        r = proj_model.get(pos, {}).get("r", 0.5)
        return (pos, adp, mkt + r * (opt["vorp"] - mkt))

    owned = [priced(chosen, "blend")]
    # A second quarterback can never enter the lineup, so with one kept the
    # position leaves the search rather than merely sinking down it.
    need_min = {"QB": 0, "RB": 4, "WR": 4, "TE": 1}
    cap = {"QB": 0, "RB": 7, "WR": 8, "TE": 3}

    print("\noptimising the 15 remaining picks…")
    res = optimize(model, MY_SLOT, picks, owned, need_min, cap, skill_rounds)
    best = res[0]

    # What the same search says with no keeper at all — the plan this app was
    # showing before the decision. Both end in a full roster, so the means are
    # directly comparable.
    print("optimising the same slot with no keeper, for comparison…")
    plain = optimize(model, MY_SLOT, all_picks, [], {"QB": 1, "RB": 4, "WR": 4, "TE": 1},
                     {"QB": 1, "RB": 7, "WR": 8, "TE": 3}, ROUNDS - RESERVED_TAIL)
    plain_best = plain[0]

    # Re-run the whole decision in the lineup model's units rather than raw
    # VORP. The keeper page ranks on VORP surplus, which does not know that only
    # one quarterback can start or that you are giving up a pick — so a QB can
    # top that list and still lose here. Worth checking before the draft rather
    # than discovering it during.
    print("\nre-testing every keeper option as a full draft, under all three pricings…")
    print(f"{'keeper':<20} {'pos':>4} {'kept':>5} {'VORP surp':>10} "
          f"{'market':>8} {'proj':>8} {'BLEND':>8}")
    contenders = []
    for opt in keeper_data["eligible"][:4]:
        if opt["adp"] is None:
            continue
        opt_picks = [p for p in all_picks if p != opt["keep_pick"]]
        opt_need = {"QB": 1, "RB": 4, "WR": 4, "TE": 1}
        opt_cap = {"QB": 1, "RB": 7, "WR": 8, "TE": 3}
        # Only a kept quarterback removes QB from the search; a kept RB still
        # leaves you needing one, it just gives you a head start at the position.
        opt_need[opt["pos"]] = max(0, opt_need[opt["pos"]] - 1)
        if opt["pos"] == "QB":
            opt_cap["QB"] = 0
        vals = {}
        seq = None
        for how in ("market", "projection", "blend"):
            own = [priced(opt, how)]
            r = optimize(model, MY_SLOT, opt_picks, own, opt_need, opt_cap,
                         len(opt_picks) - RESERVED_TAIL, beam=32, trials=2000)[0]
            vals[how] = r["mean"]
            if how == "blend":
                seq = r["sequence"]
        blend_entry = priced(opt, "blend")
        contenders.append({
            "pid": opt["pid"], "name": opt["name"], "pos": opt["pos"],
            "keep_round": opt["keep_round"], "vorp_surplus": opt["surplus"],
            "priced_at": round(blend_entry[2], 1),
            "market_value": round(market_value(opt["pos"], int(round(opt["adp"]))), 1),
            "proj_vorp": opt["vorp"],
            "reliability": proj_model.get(opt["pos"], {}).get("r"),
            "lineup_market": vals["market"], "lineup_projection": vals["projection"],
            "lineup_value": vals["blend"], "sequence": seq,
        })
        print(f"{opt['name'][:19]:<20} {opt['pos']:>4} R{opt['keep_round']:<4} "
              f"{opt['surplus']:>+10.1f} {vals['market']:>8.1f} "
              f"{vals['projection']:>8.1f} {vals['blend']:>8.1f}")
    contenders.sort(key=lambda c: -c["lineup_value"])
    agrees = None
    if contenders:
        agrees = contenders[0]["pid"] == chosen["pid"]
        winner = contenders[0]["name"]
        if agrees:
            print(f"   -> under the blend the best keeper is {winner} — the one declared")
        else:
            gap = contenders[0]["lineup_value"] - next(
                c["lineup_value"] for c in contenders if c["pid"] == chosen["pid"])
            print(f"   -> under the blend the best keeper is {winner}, not the declared "
                  f"{chosen['name']} — by {gap:+.0f} lineup points")

    # Map the winning sequence onto the rounds and picks it is actually spent at.
    schedule = []
    for i, (rd, pick) in enumerate(zip(rounds, picks)):
        pos = best["sequence"][i] if i < len(best["sequence"]) else ("K" if i == len(picks) - 2 else "DEF")
        schedule.append({"round": rd, "pick": pick, "pos": pos})
    schedule.insert(
        keeper_round - 1,
        {"round": keeper_round, "pick": keeper_pick, "pos": chosen["pos"],
         "keeper": True, "name": chosen["name"]},
    )

    counts = Counter(s["pos"] for s in schedule if s["pos"] in SKILL)
    plain_counts = Counter(p for p in plain_best["sequence"] if p in SKILL)
    plain_counts[chosen["pos"]] = plain_counts.get(chosen["pos"], 0)

    print(f"\n{'rd':>3} {'pick':>5}  pos")
    for s in schedule:
        tag = f"   <- KEEPER  {s.get('name')}" if s.get("keeper") else ""
        print(f"{s['round']:>3} {s['pick']:>5}  {s['pos']}{tag}")

    print(f"\nwith keeper : {'-'.join(best['sequence'])}")
    print(f"              value {best['mean']:.0f}  (p10 {best['p10']:.0f} / p90 {best['p90']:.0f})")
    print(f"no keeper   : {'-'.join(plain_best['sequence'])}")
    print(f"              value {plain_best['mean']:.0f}  "
          f"(p10 {plain_best['p10']:.0f} / p90 {plain_best['p90']:.0f})")
    print(f"\nkeeping {chosen['name']} is worth {best['mean'] - plain_best['mean']:+.0f} "
          f"to the lineup the draft ends up fielding")
    print(f"shape with keeper: {dict(counts)}   without: {dict(plain_counts)}")

    out = {
        "my_slot": MY_SLOT,
        "keeper": {
            "pid": chosen["pid"], "name": chosen["name"], "pos": chosen["pos"],
            "round": keeper_round, "pick": keeper_pick, "adp": chosen["adp"],
            "proj": chosen["proj"], "vorp": chosen["vorp"],
        },
        "picks": picks,
        "rounds": rounds,
        "schedule": schedule,
        "best": best,
        "alternatives": res[1:5],
        "no_keeper_best": plain_best,
        "delta": round(best["mean"] - plain_best["mean"], 1),
        "contenders": contenders,
        "lineup_model_agrees": (contenders[0]["pid"] == chosen["pid"]) if contenders else None,
        "counts": dict(counts),
        "counts_no_keeper": dict(plain_counts),
        "objective_r": cal["r"],
    }
    path = os.path.join(DERIVED, "strategy.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
