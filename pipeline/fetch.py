"""
Sleeper data pipeline for the 415 Football Club.

Pulls every artifact needed to score historical drafts:
leagues, users, rosters, drafts, picks, weekly matchups, playoff brackets,
transactions, player metadata, and weekly player stats/projections.

Everything lands in data/raw/ as JSON. Idempotent + cached: re-running only
fetches what is missing unless --refresh is passed.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.sleeper.app/v1"
STATS_API = "https://api.sleeper.app"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")

USER_ID = "995451177204498432"
USERNAME = "dirkwbeveridge"

# The 415 Football Club league chain, oldest -> newest.
LEAGUES = {
    "2023": "992314411404591104",
    "2024": "1124402776542392320",
    "2025": "1240782642371104768",
    "2026": "1382449755451301888",
}

COMPLETED_SEASONS = ["2023", "2024", "2025"]
ALL_SEASONS = ["2023", "2024", "2025", "2026"]

# Regular season is weeks 1-14, playoffs 15-17 in this league.
REG_WEEKS = range(1, 15)
PLAYOFF_WEEKS = range(15, 18)
ALL_WEEKS = range(1, 18)


def log(msg):
    print(msg, flush=True)


def get(url, retries=5):
    """GET with exponential backoff. Returns parsed JSON or None on 404."""
    delay = 1.5
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "415FC-draft-analysis/1.0"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read().decode("utf-8")
                if not body or body == "null":
                    return None
                return json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:
                time.sleep(delay * 4)
            else:
                time.sleep(delay)
        except Exception:
            time.sleep(delay)
        delay *= 2
    log(f"    !! giving up on {url}")
    return None


def save(relpath, obj):
    path = os.path.join(RAW, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f)
    return path


def exists(relpath):
    return os.path.exists(os.path.join(RAW, relpath))


def fetch_to(relpath, url, refresh=False):
    """Fetch url -> data/raw/relpath unless already cached."""
    if exists(relpath) and not refresh:
        with open(os.path.join(RAW, relpath)) as f:
            return json.load(f)
    data = get(url)
    save(relpath, data)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-fetch cached files")
    ap.add_argument("--skip-players", action="store_true", help="skip the 10MB player dump")
    args = ap.parse_args()
    R = args.refresh

    os.makedirs(RAW, exist_ok=True)

    log("== NFL state ==")
    fetch_to("state.json", f"{API}/state/nfl", R)

    log("== Player metadata ==")
    if not args.skip_players:
        players = fetch_to("players.json", f"{API}/players/nfl", R)
        log(f"   {len(players) if players else 0} players")

    for season in ALL_SEASONS:
        lid = LEAGUES[season]
        log(f"== {season} league {lid} ==")

        fetch_to(f"{season}/league.json", f"{API}/league/{lid}", R)
        users = fetch_to(f"{season}/users.json", f"{API}/league/{lid}/users", R)
        rosters = fetch_to(f"{season}/rosters.json", f"{API}/league/{lid}/rosters", R)
        log(f"   users={len(users or [])} rosters={len(rosters or [])}")

        # Drafts (a league can have multiple; we want all of them)
        drafts = fetch_to(f"{season}/drafts.json", f"{API}/league/{lid}/drafts", R)
        for d in drafts or []:
            did = d["draft_id"]
            fetch_to(f"{season}/draft_{did}.json", f"{API}/draft/{did}", R)
            picks = fetch_to(f"{season}/draft_{did}_picks.json", f"{API}/draft/{did}/picks", R)
            fetch_to(f"{season}/draft_{did}_traded.json", f"{API}/draft/{did}/traded_picks", R)
            log(f"   draft {did} type={d.get('type')} picks={len(picks or [])}")

        if season == "2026":
            continue

        # Weekly matchups -> starters, points, bench
        for wk in ALL_WEEKS:
            fetch_to(f"{season}/matchups_{wk}.json", f"{API}/league/{lid}/matchups/{wk}", R)
        log(f"   matchups weeks 1-17 cached")

        # Playoff brackets
        fetch_to(f"{season}/winners_bracket.json", f"{API}/league/{lid}/winners_bracket", R)
        fetch_to(f"{season}/losers_bracket.json", f"{API}/league/{lid}/losers_bracket", R)

        # Transactions (waivers/trades) — tells us how much of a roster was
        # actually built at the draft vs. on the wire.
        for wk in ALL_WEEKS:
            fetch_to(f"{season}/transactions_{wk}.json", f"{API}/league/{lid}/transactions/{wk}", R)
        log(f"   transactions weeks 1-17 cached")

        # Season-long player stats + projections in this league's scoring.
        for grouping, weeks in (("regular", None),):
            fetch_to(
                f"{season}/stats_season.json",
                f"{STATS_API}/v1/stats/nfl/regular/{season}",
                R,
            )
        # Per-week league-wide stats (used to compute weekly fantasy points).
        for wk in ALL_WEEKS:
            fetch_to(
                f"{season}/stats_week_{wk}.json",
                f"{STATS_API}/v1/stats/nfl/regular/{season}/{wk}",
                R,
            )
        log(f"   weekly stats cached")

        # Preseason projections = the market's expectation, needed for
        # value-over-ADP / value-over-expectation scoring.
        fetch_to(
            f"{season}/projections_season.json",
            f"{STATS_API}/v1/projections/nfl/regular/{season}",
            R,
        )
        for wk in ALL_WEEKS:
            fetch_to(
                f"{season}/projections_week_{wk}.json",
                f"{STATS_API}/v1/projections/nfl/regular/{season}/{wk}",
                R,
            )
        log(f"   projections cached")

    log("\nDone. Raw data in data/raw/")


if __name__ == "__main__":
    main()
