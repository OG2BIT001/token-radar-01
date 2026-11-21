// Launch Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// THE MODEL IN ONE PARAGRAPH
// A pre-token protocol is worth, at launch, roughly what the market already pays for the TVL of
// comparable protocols that DO trade. So the implied value is peer-anchored: for each category, take
// every token-bearing protocol in the snapshot, compute its market-cap / TVL ratio, and use the
// category's median ratio (shrunk toward the global median when the peer set is small, each ratio
// winsorised so one mania cannot set the price of a whole category). Implied value is then
//
//   implied = TVL x peer_multiple(category) x growth_factor x maturity_factor
//
// where growth_factor rewards a protocol whose TVL is expanding into its launch and
// maturity_factor rewards a long operating history with no token. Every input is a figure the
// snapshot itself carries (tvl_usd, change_7d, listed_at, mcap_usd of the peers). No protocol name
// is special-cased anywhere: the same functions score every row, and the page recomputes each row
// from the same figures, so the board, the page and this file are one arithmetic.
//
// THE BOARD
// Every watchlist slug is on the board (the floor), plus every other protocol that records no token
// and is not a wrapped, staked or bridged product of one that trades (the field guide's rule,
// applied to the whole snapshot, not just above the floor): the early rows are the radar's point.
// Token-bearing protocols are never ranked; they are the peer evidence, and the dashboard shows
// them apart, at the market's own values.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can re-derive any row. */
export interface ModelConstants {
  /** Each peer's mcap/TVL ratio is winsorised into [ratio_floor, ratio_cap] before any median. */
  ratio_floor: number;
  ratio_cap: number;
  /** A category with n peers trusts its own median with weight n / (n + shrink_peers). */
  shrink_peers: number;
  /** growth_factor = 1 + clamp(change_7d, growth_floor, growth_cap) / 100 x growth_weight. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** maturity_factor = maturity_base + maturity_span x min(age_days, maturity_days) / maturity_days. */
  maturity_base: number;
  maturity_span: number;
  maturity_days: number;
  /** Age used when DefiLlama reports no listed_at. */
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.02,
  ratio_cap: 4,
  shrink_peers: 4,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_base: 0.75,
  maturity_span: 0.5,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'peer-anchor-2';

/** How many live-token protocols the dashboard's comparison view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step before it is flattened to the board's string form. */
export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  conviction: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    growth_pct: number;
    growth_factor: number;
    maturity_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A category's peer evidence: how many token-bearing peers, and the multiples they support. */
export interface PeerStat {
  category: string;
  peers: number;
  multiple: number;
  low: number;
  high: number;
}

/** The dashboard's view of one board row: everything the detail view needs, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  conviction: number;
  peer_multiple: number;
  peer_count: number;
  growth_factor: number;
  maturity_factor: number;
  farm_steps: FarmStep[];
}

/** A live-token protocol: it already trades, so it is shown at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocol_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  peers: PeerStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when a date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// ---------------------------------------------------------------- who may be ranked

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word in the name that marks a wrapped or staked product of another asset. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are products of another protocol's asset, or an exchange's own venue. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Names that begin with an exchange's name are that exchange's product, not a launch of their own. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may be ranked: it records no token, and it is not a wrapped, staked or bridged
 * product of a token that already trades (the field guide's watchlist rule, applied snapshot-wide).
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

// ---------------------------------------------------------------- the peer evidence

interface RatioSet {
  median: number;
  q1: number;
  q3: number;
  n: number;
}

/** Median and quartiles of an already-sorted array. */
function quartiles(sorted: number[]): RatioSet {
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]!;
  return { median: at(0.5), q1: at(0.25), q3: at(0.75), n: sorted.length };
}

/**
 * The peer evidence: for every category, the winsorised mcap/TVL ratios of its token-bearing
 * protocols, and the same for the whole snapshot. A protocol is a peer when the market already
 * prices it: it records a market cap and a TVL to divide by.
 */
export function peerEvidence(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, RatioSet>; global: RatioSet } {
  const clampRatio = (r: number): number => Math.min(model.ratio_cap, Math.max(model.ratio_floor, r));
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = clampRatio(p.mcap_usd / p.tvl_usd);
    const key = p.category ?? '';
    const list = groups.get(key) ?? [];
    list.push(ratio);
    groups.set(key, list);
    all.push(ratio);
  }
  const byCategory = new Map<string, RatioSet>();
  for (const [key, list] of groups) byCategory.set(key, quartiles(list.sort((a, b) => a - b)));
  return { byCategory, global: quartiles(all.sort((a, b) => a - b)) };
}

/**
 * The multiple one category trades at: its own median, shrunk toward the global median by how many
 * peers stand behind it, with the band from the same shrinkage on the quartiles.
 */
export function peerMultiple(category: string | null, evidence: { byCategory: Map<string, RatioSet>; global: RatioSet }, model: ModelConstants = MODEL): { multiple: number; low: number; high: number; peers: number } {
  const own = evidence.byCategory.get(category ?? '');
  const g = evidence.global;
  if (own === undefined) return { multiple: g.median, low: g.q1, high: g.q3, peers: 0 };
  const w = own.n / (own.n + model.shrink_peers);
  const blend = (a: number, b: number): number => w * a + (1 - w) * b;
  const multiple = blend(own.median, g.median);
  const low = Math.min(multiple, blend(own.q1, g.q1));
  const high = Math.max(multiple, blend(own.q3, g.q3));
  return { multiple, low, high, peers: own.n };
}

// ---------------------------------------------------------------- scoring

/** The growth factor: TVL expanding into a launch is worth more, collapsing TVL less. */
export function growthFactor(change7d: number | null, model: ModelConstants = MODEL): { pct: number; factor: number } {
  const raw = finite(change7d ?? 0, 0);
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
  return { pct, factor: 1 + (pct / 100) * model.growth_weight };
}

/** The maturity factor: a longer run with no token is a more credible launch. */
export function maturityFactor(age: number | null, model: ModelConstants = MODEL): number {
  const days = Math.min(Math.max(age ?? model.unknown_age_days, 0), model.maturity_days);
  return model.maturity_base + (days / model.maturity_days) * model.maturity_span;
}

/** One protocol's full scoring: the implied value, its band, and every factor that produced it. */
export function impliedValue(p: SnapshotProtocol, asOf: string, evidence: { byCategory: Map<string, RatioSet>; global: RatioSet }, model: ModelConstants = MODEL): {
  implied: number; low: number; high: number; multiple: number; peers: number;
  growthPct: number; growth: number; maturity: number; age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const peer = peerMultiple(p.category, evidence, model);
  const g = growthFactor(p.change_7d, model);
  const m = maturityFactor(age, model);
  const at = (mult: number): number => Math.max(1, Math.round(p.tvl_usd * mult * g.factor * m));
  return {
    implied: at(peer.multiple), low: at(peer.low), high: at(peer.high),
    multiple: peer.multiple, peers: peer.peers,
    growthPct: g.pct, growth: g.factor, maturity: m, age,
  };
}

/**
 * A 0..100 conviction score for display only (rank is implied value alone): how much of the
 * board's own scale this protocol commands, from its TVL's log-position among board rows, its
 * growth, its age, and whether the house's watchlist already carries it.
 */
function conviction(p: SnapshotProtocol, age: number | null, onWatchlist: boolean, logMin: number, logSpan: number): number {
  const tvlScore = logSpan > 0 ? (Math.log(Math.max(p.tvl_usd, 1)) - logMin) / logSpan : 0;
  const growthScore = (Math.min(60, Math.max(-20, p.change_7d ?? 0)) + 20) / 80;
  const ageScore = Math.min(age ?? MODEL.unknown_age_days, MODEL.maturity_days) / MODEL.maturity_days;
  const mix = 0.5 * tvlScore + 0.2 * growthScore + 0.2 * ageScore + (onWatchlist ? 0.1 : 0);
  return Math.max(1, Math.min(100, Math.round(5 + 95 * mix)));
}

// ---------------------------------------------------------------- farm plans

/** A typical all-in gas cost, in dollars, of one on-chain action on a chain the snapshot names. */
const GAS_USD: Record<string, number> = {
  Ethereum: 6, Solana: 0.05, Base: 0.25, Arbitrum: 0.35, Optimism: 0.3, BSC: 0.2, Polygon: 0.05,
  Avalanche: 0.4, Linea: 0.3, Scroll: 0.3, Mantle: 0.2, Blast: 0.2, 'zkSync Era': 0.3,
  Starknet: 0.2, Sui: 0.05, Aptos: 0.05, Bitcoin: 3, Tron: 1, TON: 0.1, Berachain: 0.2,
  Monad: 0.1, Hyperliquid: 0.05, Sonic: 0.05, Unichain: 0.25, Ink: 0.25, Worldchain: 0.25,
};

function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 0.5;
}

function money(n: number): string {
  if (n < 1) return `$${n.toFixed(2)}`;
  if (Number.isInteger(n)) return `$${n}`;
  return `$${n.toFixed(2)}`;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, scaled to the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols earn a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's two core actions: what a farmer actually does inside this kind of protocol. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { primary: string; secondary: string } {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return {
    primary: `Supply ${money(capital)} of USDC to ${n} on ${chain} as collateral and leave the position open`,
    secondary: `Borrow about 30% against the supply, hold it a week, then repay in full so the borrow counts as real use`,
  };
  if (c.includes('dex') || c.includes('liquidity')) return {
    primary: `Provide ${money(capital)} of liquidity to ${n}'s deepest stable or ETH pool on ${chain}`,
    secondary: `Route two swaps a week through ${n} itself rather than an aggregator, so the volume is native`,
  };
  if (c.includes('perp') || c.includes('derivative') || c.includes('option')) return {
    primary: `Deposit ${money(capital)} of USDC as margin on ${n} and open one small delta-neutral hedge`,
    secondary: `Close and reopen the hedge weekly so the account shows recurring, non-sybil trading activity`,
  };
  if (c.includes('restak') || c.includes('staking')) return {
    primary: `Stake ${money(capital)} of ETH or an LST through ${n} on ${chain} and keep the receipt token in the same wallet`,
    secondary: `Restake or delegate the receipt once more inside ${n}'s own vaults if it offers them, and keep both receipts`,
  };
  if (c.includes('curator') || c.includes('allocator')) return {
    primary: `Allocate ${money(capital)} into one of ${n}'s curated vaults on ${chain} and hold the vault shares`,
    secondary: `Move a small part of the position to a second ${n} vault after two weeks, so the account uses more than one strategy`,
  };
  if (c.includes('basis')) return {
    primary: `Deposit ${money(capital)} of USDC into ${n}'s basis-trading vault on ${chain} and hold the shares`,
    secondary: `Add a small top-up deposit every fortnight so the position grows the way a real user's would`,
  };
  if (c.includes('rwa')) return {
    primary: `Subscribe ${money(capital)} to ${n}'s yield-bearing real-world-asset token on ${chain} and hold it`,
    secondary: `Hold the asset across a full distribution cycle so at least one yield payment lands in the wallet`,
  };
  if (c.includes('chain')) return {
    primary: `Bridge ${money(capital)} to ${n}'s chain and keep a working balance of its gas asset in the wallet`,
    secondary: `Transact on the chain weekly: a swap, a transfer and one contract call in its native apps`,
  };
  if (c.includes('launchpad')) return {
    primary: `Register the wallet with ${n} and stake or commit ${money(capital)} toward its next allocation round`,
    secondary: `Take part in one live launch on ${n}, even a small ticket, so the account has participation history`,
  };
  if (c.includes('prediction')) return {
    primary: `Fund ${money(capital)} on ${n} and take one position in a liquid, long-dated market`,
    secondary: `Place one small position a week in different markets rather than a single large bet`,
  };
  if (c.includes('insurance')) return {
    primary: `Buy ${money(capital)} of cover from ${n} on ${chain} for a position you actually hold elsewhere`,
    secondary: `Renew the cover once before it lapses so the wallet shows continuing, genuine demand`,
  };
  if (c.includes('stable') || c.includes('algo')) return {
    primary: `Mint or deposit ${money(capital)} of ${n}'s stable asset on ${chain} and hold it in the wallet`,
    secondary: `Provide a small amount of the stable asset to ${n}'s own stability or liquidity pool`,
  };
  if (c.includes('index')) return {
    primary: `Mint ${money(capital)} of ${n}'s index token on ${chain} and hold it unbroken`,
    secondary: `Hold through one rebalance so the wallet is present when the index reweights`,
  };
  if (c.includes('privacy')) return {
    primary: `Deposit ${money(capital)} into ${n} on ${chain} and make one shielded transfer to a second wallet you own`,
    secondary: `Repeat a small shielded transfer weekly, varying amounts so the activity reads as real use`,
  };
  if (c.includes('payment') || c.includes('card')) return {
    primary: `Fund ${n} with ${money(capital)} and route two real payments or card purchases through it each week`,
    secondary: `Keep a standing balance rather than emptying the account after each payment`,
  };
  return {
    primary: `Deposit ${money(capital)} of USDC into ${n} on ${chain} and keep the position open`,
    secondary: `Make a second, smaller deposit after two weeks so the account shows recurring use, not a one-off`,
  };
}

/** A step flattened to the board's string form: the action, then its cost and its time. */
export function stepText(step: FarmStep): string {
  let s = `${step.action}. Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and re-check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record — its category sets the actions, its first chain sets the gas, its TVL sets
 * the capital, its age sets the hold. Nothing is written per protocol by hand.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { primary, secondary } = actionsFor(p, capital, chain);
  const weeks = Math.max(4, Math.round(hold / 7));
  return [
    {
      action: `Set up a fresh wallet for ${p.name} alone, fund it from an exchange, and keep its seed phrase offline`,
      cost: `one funding transaction, about ${money(gas)} of gas on ${chain}`,
      time: '10 minutes',
    },
    {
      action: primary,
      cost: `${money(capital)} of capital plus about ${money(gas)} of gas`,
      time: '20 minutes to set up',
    },
    {
      action: secondary,
      cost: `about ${money(gas * 2)} of gas, no new capital beyond the position`,
      time: '15 minutes',
    },
    {
      action: `Repeat one qualifying action inside ${p.name} every week for ${weeks} weeks, on varying days, so the history reads as a real user's`,
      cost: `about ${money(gas)} of gas a week, ${money(gas * weeks)} over the plan`,
      time: '10 minutes a week',
    },
    {
      action: `Open ${p.name}'s own points, rewards or governance page, link this wallet, and complete any free registration or vote it offers`,
      cost: 'free to check; never pay anyone to claim or register',
      time: '15 minutes, once',
    },
    {
      action: `Hold the position for at least ${hold} days without withdrawing, so the balance appears in several weekly snapshots`,
      cost: `the ${money(capital)} stays in the position for the whole hold`,
      time: `${hold} days`,
    },
    {
      action: `Keep a farm log (wallet, dates, amounts, transaction hashes) and, after the hold, unwind in two or three tranches rather than one exit`,
      cost: `about ${money(gas * 2)} of gas to unwind`,
      time: '20 minutes, plus 5 minutes of logging a week',
    },
  ];
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const evidence = peerEvidence(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || isRankable(p));
  const scored = chosen.map((p) => ({ p, s: impliedValue(p, snapshot.as_of, evidence, model) }));
  const tvls = scored.map((x) => Math.log(Math.max(x.p.tvl_usd, 1)));
  const logMin = Math.min(...tvls);
  const logSpan = Math.max(...tvls) - logMin;
  scored.sort((a, b) => b.s.implied - a.s.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((x, i) => ({
    rank: i + 1,
    slug: x.p.slug,
    name: x.p.name,
    category: x.p.category,
    chains: x.p.chains,
    tvl_usd: x.p.tvl_usd,
    change_7d: x.p.change_7d,
    mcap_usd: x.p.mcap_usd,
    listed_at: x.p.listed_at,
    gecko_id: x.p.gecko_id,
    symbol: x.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: watch.has(x.p.slug),
    age_days: x.s.age,
    implied_value_usd: x.s.implied,
    implied_low_usd: x.s.low,
    implied_high_usd: x.s.high,
    conviction: conviction(x.p, x.s.age, watch.has(x.p.slug), logMin, logSpan),
    model: {
      peer_multiple: round4(x.s.multiple),
      peer_count: x.s.peers,
      growth_pct: round4(x.s.growthPct),
      growth_factor: round4(x.s.growth),
      maturity_factor: round4(x.s.maturity),
      age_days: x.s.age,
    },
    farm_steps: farmSteps(x.p, x.s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap: the peer evidence, shown at the market's own values. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const evidence = peerEvidence(snapshot, model);
  const live = liveRows(snapshot);
  const peerStats: PeerStat[] = [...evidence.byCategory.entries()]
    .map(([category, set]) => {
      const m = peerMultiple(category === '' ? null : category, evidence, model);
      return { category: category === '' ? 'Uncategorised' : category, peers: set.n, multiple: round4(m.multiple), low: round4(m.low), high: round4(m.high) };
    })
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const rows: RadarRow[] = board.map((r) => {
    const p = snapshot.protocols.find((x) => x.slug === r.slug)!;
    // Full-precision factors for the page: it multiplies TVL x multiple x growth x maturity and
    // lands on board.json's implied value to the dollar. (board.json's own model block rounds its
    // factors to 4 places for compactness; the value itself never depends on the rounding.)
    const s = impliedValue(p, snapshot.as_of, evidence, model);
    return {
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      on_watchlist: r.on_watchlist,
      implied_value_usd: r.implied_value_usd,
      implied_low_usd: r.implied_low_usd,
      implied_high_usd: r.implied_high_usd,
      conviction: r.conviction,
      peer_multiple: s.multiple,
      peer_count: s.peers,
      growth_factor: s.growth,
      maturity_factor: s.maturity,
      farm_steps: farmSteps(p, r.age_days),
    };
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocol_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - snapshot.watchlist.length,
    live_size: live.length,
    global_multiple: round4(evidence.global.median),
    peers: peerStats,
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (slugs.size !== board.length) return 'a slug appears twice on the board';
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
