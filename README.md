# 415 Football Club — Draft Intelligence

A web app for managing my team in the 415 Football Club (Sleeper), built around a
study of the league's own draft history.

Three completed seasons — 2023, 2024, 2025 — are pulled from Sleeper, every
fantasy point is recomputed from raw stat lines under this league's scoring, and
every one of the 576 picks is joined to what the team that made it went on to do.
The result is a set of draft rules and a Monte Carlo optimizer that produces a
plan for each of the 12 draft slots.

## What the league actually is

| | |
|---|---|
| Format | 12 teams, 16 rounds, snake with **3rd-round reversal** |
| Lineup | QB, RB, RB, WR, WR, TE, FLEX, FLEX, K, DEF + 6 bench |
| Scoring | Full PPR **plus 0.5 per first down**, 6-pt passing TDs |
| Playoffs | 6 teams, weeks 15–17 |
| Keepers | 1 per team (from 2025) |

Two of those details drive most of the findings. The first-down bonus and two
flex spots mean the league starts **3.3 receivers and 2.6 running backs** per
team per week, which is what sets replacement level. The third-round reversal
flattens the difference between draft slots to near nothing.

## The findings

1. **Never spend a top-four pick on a quarterback.** QB is the only position
   that is never the best use of a pick at any pick number. Teams taking a QB in
   rounds 1–4 made the playoffs 41% of the time; rounds 5–8, 59%. The trend is
   perfectly ordered across cohorts — the bottom four teams took their QB
   earliest (round 3.9), playoff teams latest (round 5.6). All three teams that
   spent a round-2 pick on a QB missed the playoffs, two of them with Josh Allen.
2. **In rounds 1–4 the RB-vs-WR question is not answerable.** The gap measures
   +18.5 under one definition of replacement level and −2.0 under another; it
   fails a permutation test (p=0.16) and reverses in 2023. Take the best player.
3. **From round 5 on, tight end preserves the most value.** It also has the
   highest cross-season replication of any position (0.92).
4. **Stop drafting running backs after round 8.** Bust rate jumps from 18% in
   round 8 to 83% in round 9 and never recovers.
5. **Your edge is hit rate, not shape.** The strongest correlates of scoring are
   all measures of picking well (top-5-pick value, r=+0.75). Positional counts
   sit near zero, and the best-to-worst draft slot spans ~7 points of expected
   value across an entire draft.

Full reasoning, calibration and limitations are on the **Method** page.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

Regenerate the study from Sleeper (needs Python 3, no packages):

```bash
npm run data
```

That runs four stages in `pipeline/`:

| stage | what it does |
|---|---|
| `fetch.py` | pulls and caches every Sleeper artifact for 2023–2026 |
| `core.py` | rescores every player in league rules; builds players / teams / picks |
| `replacement.py` | measures what the waiver wire actually returned, by position |
| `analyze.py` | value models, correlations, Monte Carlo slot optimizer |

`data/raw/` is cached and git-ignored; `data/derived/` is committed so the app
builds without network access.

## Notes on the model

- Recomputed scoring reproduces Sleeper's own numbers on 2,368 of 2,368 rostered
  player-weeks, which is what lets us value players nobody drafted.
- The optimizer's objective correlates r=+0.76 with the points the 36 real teams
  actually scored.
- Positional edges are shrunk by how well they repeat season to season, so a
  pattern that shows up once does not become a rule.
- Bust floors are measured, not assumed: they come from what teams got when they
  started a player they had not drafted.

## Live draft

`/live` reads the 2026 Sleeper draft directly — slot, keepers already off the
board, your next pick, and how the positional run compares to the historical
pace at that point.
