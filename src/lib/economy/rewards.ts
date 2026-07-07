import { REWARD_CONTAINERS, type RewardBundle } from './config.ts';
import { awardFragmentsToShop, type EconomyShopData } from './core.ts';

type BoosterId = 'boost_magnet' | 'boost_double' | 'boost_shield';

export interface ApplyRewardBundleOptions {
  random?: () => number;
}

export interface AppliedRewardSummary {
  coinsDelta: number;
  fragmentsAwarded: number;
  fragmentsPooled: number;
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
  const random = options.random || Math.random;
  const result: AppliedRewardSummary = {
    coinsDelta: 0,
    fragmentsAwarded: 0,
    fragmentsPooled: 0,
    boostersDelta: 0,
    xpDelta: 0,
  };

  const nextState = applyBundleRecursive(state, bundle, { random, result, depth: 0 });

  return {
    state: nextState,
    coins: Math.max(0, Math.floor(Number(coins) || 0) + result.coinsDelta),
    result,
  };
}

interface ApplyContext {
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
  const r = awardFragmentsToShop(state, amount);
  ctx.result.fragmentsAwarded += r.toFocus;
  ctx.result.fragmentsPooled += r.toPool;
  return r.state;
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
