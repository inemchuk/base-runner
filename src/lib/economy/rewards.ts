import { FRAGMENT_FALLBACK_COINS, REWARD_CONTAINERS, type RewardBundle } from './config.ts';
import { awardFragments, getCraftMeta, ownsItem, type EconomyShopData } from './core.ts';

type BoosterId = 'boost_magnet' | 'boost_double' | 'boost_shield';

export interface ApplyRewardBundleOptions {
  fallbackCoinsPerFragment?: number;
  random?: () => number;
}

export interface AppliedRewardSummary {
  coinsDelta: number;
  fragmentsAwarded: number;
  fragmentsOverflowed: number;
  fallbackCoins: number;
  boostersDelta: number;
  xpDelta: number;
}

export interface AppliedRewardBundle {
  state: EconomyShopData;
  coins: number;
  result: AppliedRewardSummary;
}

const BOOSTERS: readonly BoosterId[] = ['boost_magnet', 'boost_double', 'boost_shield'];

export function applyRewardBundle(
  state: EconomyShopData,
  coins: number,
  bundle: RewardBundle,
  options: ApplyRewardBundleOptions = {},
): AppliedRewardBundle {
  const fallbackCoinsPerFragment = Math.max(0, Math.floor(Number(options.fallbackCoinsPerFragment) || FRAGMENT_FALLBACK_COINS));
  const random = options.random || Math.random;
  const result: AppliedRewardSummary = {
    coinsDelta: 0,
    fragmentsAwarded: 0,
    fragmentsOverflowed: 0,
    fallbackCoins: 0,
    boostersDelta: 0,
    xpDelta: 0,
  };

  const nextState = applyBundleRecursive(state, bundle, {
    fallbackCoinsPerFragment,
    random,
    result,
    depth: 0,
  });

  return {
    state: nextState,
    coins: Math.max(0, Math.floor(Number(coins) || 0) + result.coinsDelta),
    result,
  };
}

interface ApplyContext {
  fallbackCoinsPerFragment: number;
  random: () => number;
  result: AppliedRewardSummary;
  depth: number;
}

function applyBundleRecursive(state: EconomyShopData, bundle: RewardBundle | undefined, ctx: ApplyContext): EconomyShopData {
  if (!bundle || ctx.depth > 4) return state;

  let nextState = state;

  if (bundle.container) {
    const nested = REWARD_CONTAINERS[bundle.container];
    if (nested) {
      nextState = applyBundleRecursive(nextState, nested, { ...ctx, depth: ctx.depth + 1 });
    }
  }

  const coins = Math.max(0, Math.floor(Number(bundle.coins) || 0));
  if (coins) ctx.result.coinsDelta += coins;

  const fragments = Math.max(0, Math.floor(Number(bundle.fragments) || 0));
  if (fragments) nextState = applyFocusFragments(nextState, fragments, ctx);

  const boosters = Math.max(0, Math.floor(Number(bundle.boosters) || 0));
  if (boosters) {
    nextState = addRandomBoosters(nextState, boosters, ctx.random);
    ctx.result.boostersDelta += boosters;
  }

  const xp = Math.max(0, Math.floor(Number(bundle.xp) || 0));
  if (xp) ctx.result.xpDelta += xp;

  return nextState;
}

function applyFocusFragments(state: EconomyShopData, amount: number, ctx: ApplyContext): EconomyShopData {
  const target = focusCanReceiveFragments(state, amount);
  if (!target) {
    addFallbackCoins(amount, ctx);
    return state;
  }

  const awarded = awardFragments(state, target.focusId, target.amount);
  if (!awarded.ok) {
    addFallbackCoins(amount, ctx);
    return state;
  }

  const fragmentsAwarded = awarded.fragmentsDelta || 0;
  ctx.result.fragmentsAwarded += fragmentsAwarded;

  const leftover = Math.max(0, amount - fragmentsAwarded);
  if (leftover) addFallbackCoins(leftover, ctx);

  return awarded.state;
}

function focusCanReceiveFragments(state: EconomyShopData, amount: number) {
  const focusId = state.focusItemId;
  const meta = getCraftMeta(focusId);
  if (!focusId || !meta || ownsItem(state, focusId, meta.type)) return null;

  const current = state.fragments[focusId] || 0;
  const missing = Math.max(0, meta.fragments - current);
  if (missing <= 0) return null;

  return { focusId, amount: Math.min(missing, amount) };
}

function addFallbackCoins(fragmentCount: number, ctx: ApplyContext) {
  const fallbackCoins = Math.max(0, fragmentCount) * ctx.fallbackCoinsPerFragment;
  ctx.result.fragmentsOverflowed += Math.max(0, fragmentCount);
  ctx.result.coinsDelta += fallbackCoins;
  ctx.result.fallbackCoins += fallbackCoins;
}

function addRandomBoosters(state: EconomyShopData, amount: number, random: () => number): EconomyShopData {
  const nextCharges = { ...state.boosterCharges };
  for (let i = 0; i < amount; i++) {
    const idx = Math.max(0, Math.min(BOOSTERS.length - 1, Math.floor(random() * BOOSTERS.length)));
    const id = BOOSTERS[idx];
    nextCharges[id] = (nextCharges[id] || 0) + 1;
  }
  return { ...state, boosterCharges: nextCharges };
}
