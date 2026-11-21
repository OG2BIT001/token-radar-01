# Session notes — token-radar-01

**Who built this:** OG2BIT, a Muse Spark agent in the Muse app, working for Mateo, in one
session on 2026-11-21. The entry was authored in this session: `main.ts`, `lib/model.ts` and the
three dashboard files were written for this entry (not copied from the kit's starter — the
starter's flat TVL × 0.25 model and light page were the baseline to beat, and its dashboard is
one of the house's calibration anchors). The one file copied is `vendor/makefun-board.ts`, which
the bounty requires byte for byte: it was copied from the kit's starter and its sha256 verified
against `kit.json` —

- `vendor/makefun-board.ts` sha256 `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`
  — matches the kit manifest exactly. No parent copy is needed; it is already in place and verified.

**Data source:** only the kit's sealed snapshot (`input/snapshot.json`, DefiLlama
`https://api.llama.fi/protocols`, as of 2026-11-14, 758 protocols, 40 watchlist slugs). Nothing
was fetched from the network at build time or is fetched at run time.

**Method, in brief:** peer-anchored implied value — each category's trading protocols give a
winsorised median market-cap/TVL multiple, blended toward the global median by peer count; a
pre-token protocol is priced as TVL × its category multiple × a growth factor (7-day TVL change)
× a maturity factor (days listed with no token), with a quartile band. The board holds all 40
watchlist protocols plus every other protocol in the snapshot that passes the field guide's
exclusion rule — 198 rows. Farm plans are generated per protocol from its category, first chain,
TVL and age. The full model is stated in `README.md` and on the dashboard itself.

**Screenshots — made with PIL, stated plainly:** this machine has no working browser
(Playwright's Chromium download fails through the proxy), so the three screenshots were composed
with Python PIL (`/tmp/radar-shots.py` at build time) at 1440×1024, drawing the dashboard's own
layout, palette and typography values from `dashboard/app.css` and filling them with the board's
real figures from the actual run — the board's true top 11 rows, rank 1's real detail view
(derivation, band and farm plan), and the real Lending filter (16 rows). They are faithful
renderings of what the page shows, not captures from a browser; if a browser is available, open
`out/dashboard/index.html` after a run and it renders the same content live. Two layout defects
spotted in the first PIL pass (the conviction column overflowing the panel, a "1 peers" grammar
slip that was also in `app.js`) were fixed in both the shots and the page, and the shots were
regenerated.

**Run and verification (2026-11-21):**

- `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json` —
  clean run: 758 protocols, 40 watchlist, 198 rows scored (158 early, 30 live peers set aside).
- A second run to a different directory produced **byte-identical** `board.json`, `data.js`,
  `dossier.json`, `dashboard/` and `screenshots/`.
- Gate shape, checked independently of the model's own self-check: 198 rows (100–4000), ranks
  exactly 1..198, implied values positive whole dollars, non-increasing by rank and not all equal,
  every slug a real snapshot protocol appearing once, **all 40 watchlist slugs covered**, every
  farm plan 7 steps of 20–600 characters.
- `dossier.json` is 599,868 bytes (cap 1.5 MiB); its text is 32,735 bytes (cap 65,536) and shows
  all three dashboard files whole — no cut line. Dashboard source totals 32,471 bytes across
  `index.html`, `app.css`, `app.js`; no `http://` or `https://` appears anywhere in `dashboard/`.
- Screenshots: 3 PNGs at 1440×1024, 120–158 KB each (caps: ≤512 KiB, long side ≤1440, short
  side ≥800).
- Page/board agreement: the dashboard's own recomputation (TVL × peer multiple × growth ×
  maturity, from `data.js`) reproduces `board.json`'s implied value **exactly for all 198 rows**.
- Hand checks with independent arithmetic against the raw snapshot: Steakhouse Financial
  (rank 1, Risk Curators, 1 peer at 2.9747 blended to 0.7731) → $1,966,542,738 ✓; Curvance
  (rank 55, Lending, 15 peers) → $18,044,257 ✓; Polymarket International (rank 4) → $388,960,189,
  its category's 400× outlier ratio winsorised to 4.0 before blending ✓. The largest pre-token
  protocols kept off the board are exactly the ones the rule excludes: Bybit, Bitfinex and
  Robinhood (CEX), WBTC (Bridge) and Binance staked ETH (Liquid Staking). Zero board rows record
  a token.

**Left in the directory:** `out/` is the verified local run's output, kept for inspection; it
regenerates byte for byte from the command above. Nothing here was submitted; no GitHub
repository was created.
