[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/OG2BIT001/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/OG2BIT001/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar — the best token launch radar

A program and a dashboard that answer one question: **which protocol that has not launched a
token yet is worth farming next, and what exactly do you do about it?**

Launch Radar reads the sealed DefiLlama snapshot the bounty ships (`/input/snapshot.json`, 758
protocols at $5M+ TVL, as of 2026-11-14), works out which protocols still record no token and are
not a wrapped or staked product of one that trades, ranks them by a peer-anchored implied launch
value, and writes a static web dashboard: the ranked board, a detail view for every protocol on
it, and a concrete farm plan for each.

## The ranking model

Implied value is **peer-anchored**: a launch is worth roughly what the market already pays for
the TVL of comparable protocols whose tokens trade.

1. **Peer evidence.** For each category, take every token-bearing protocol in the snapshot and
   compute its market-cap / TVL ratio. Winsorise each ratio into [0.02, 4.0] so one mania cannot
   price a whole category, then blend the category median toward the global median with weight
   n/(n+4), where n is the category's peer count — small categories borrow the market's overall
   multiple instead of trusting two data points.
2. **Implied value.** `implied = TVL × peer_multiple(category) × growth_factor × maturity_factor`
   - `growth_factor = 1 + clamp(change_7d, −50%, +100%) × 0.6` — TVL expanding into a launch is
     worth more than TVL shrinking toward it.
   - `maturity_factor = 0.75 + 0.5 × min(age_days, 1460) / 1460` — years of operating with no
     token is evidence a launch, when it comes, is real. Protocols with no recorded listing date
     count as 365 days old.
3. **The band.** Each value ships with a supported range: the same arithmetic at the category's
   blended lower and upper peer quartiles.

Every input is a figure the snapshot itself carries. No protocol name is special-cased anywhere;
the dashboard recomputes each row in the page from the same figures and lands on board.json's
value to the dollar.

## Who is on the board

- **All 40 watchlist protocols** (the house floor: $50M+ TVL, no token recorded, not a wrapped,
  staked or bridged product) — coverage is complete.
- **Every other rankable pre-token protocol in the snapshot**, ranked the same way: the field
  guide's exclusion rule (no token recorded; not Bridge / Canonical Bridge / Liquid Staking /
  Liquid Restaking / Restaked BTC / CEX; no version-marker, `wrapped`, `staked` or `staking` in
  the name; no exchange-name prefix) applied snapshot-wide, below the floor as well as above it.
  These are the early finds the radar exists for.
- Token-bearing protocols are **never ranked**. They are the peer evidence, and the dashboard
  shows the largest of them apart, at the market's own values.

## Farm plans

Each row carries a seven-step plan generated from the protocol's own record — never written per
protocol by hand:

- the **category** sets the two core actions (supply-and-borrow for lending, liquidity plus
  native swaps for a DEX, stake-and-restake for restaking, and so on);
- the **primary chain** sets the gas cost of every step (Ethereum ≈ $6 an action, Base ≈ $0.25,
  Solana ≈ $0.05, with a table for the chains the snapshot names);
- the **TVL** sets the position size ($50–$500);
- the **age** sets the hold (30–90 days, so the position appears in several weekly snapshots).

Every step states what it costs and how long it takes.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

(Inside the grader's container the snapshot is mounted at `/input/snapshot.json` and the output
directory is `/output`; no flags are needed there.) The program is deterministic: two runs write
the same bytes. It writes:

- `board.json` — the ranked board (rank, implied value with its band, the model's factors, and
  the farm plan for every row);
- `data.js` — the dashboard's dataset, written from the same board;
- `dashboard/` — the static page (copied from this repository);
- `screenshots/` — the board, a detail view and a filtered view (copied from this repository);
- `dossier.json` — the judge's dossier, written by `buildDossier` from
  `vendor/makefun-board.ts`, the library the kit ships byte for byte.

## Open the dashboard

After a run, open `out/dashboard/index.html` in a browser. It renders with no network: search,
filter by category, chain or watchlist membership, sort by any column, and click any row for its
detail view — the model's full derivation, the supported band, the trading peers behind its
multiple, and its farm plan. The page's state lives in the URL hash, so a filtered view or a
protocol's detail can be linked directly.

## Layout

- `main.ts` — the entry program (Node 22, standard library only).
- `lib/model.ts` — the snapshot parser, the exclusion rule, the peer-anchored model, the farm
  plan generator, and the board's self-check against the gate's shape.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied byte for byte from the kit.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the page, its dark trading-desk theme, and
  its rendering code.
- `screenshots/` — the three screenshots the dossier carries.
- `SESSION.md` — who built this entry, from what, and how the screenshots were made.

A note on wording: a protocol on this board *records no token* in the sealed snapshot — that is
DefiLlama's record, not proof none exists. An implied value is this entry's model output, a claim
about what a launch would be worth if the record held; it is not a prediction that a token will
be issued, and none of it is financial advice.
