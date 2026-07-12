import {
  BOOSTER_PACKS,
  CRAFT_CONFIG,
  DAILY_FRAGMENT_CHEST,
  ECONOMY_TIERS,
  SHOP_PURCHASES,
  type CraftableType,
  type EconomyTier,
} from './config.ts';

export interface EconomyShopData {
  owned: string[];
  equipped: string;
  boosterCharges: Record<string, number>;
  trailPacks: string[];
  equippedTrail: string;
  equippedDeath: string;
  deathPacks: string[];
  focusItemId: string | null;
  fragments: Record<string, number>;
  topUpFragments: Record<string, number>;
  pooledFragments: number;
  poolAppliedFragments: Record<string, number>;
}

export interface CraftMeta {
  itemId: string;
  type: CraftableType;
  tier: EconomyTier;
  name: string;
  sprite?: string;
  fragments: number;
  craftFee: number;
  topUpCost: number;
  topUpCapPct: number;
  poolCapPct: number;
  directPriceRange: { min: number; max: number } | null;
}

export interface EconomyMutationResult {
  ok: boolean;
  error?: string;
  state: EconomyShopData;
  coinsDelta: number;
  fragmentsDelta?: number;
  boostersDelta?: number;
}

const DEFAULT_SHOP: EconomyShopData = {
  owned: ['skin_cryptokid'],
  equipped: 'skin_cryptokid',
  boosterCharges: {},
  trailPacks: [],
  equippedTrail: 'default',
  equippedDeath: 'default',
  deathPacks: [],
  focusItemId: null,
  fragments: {},
  topUpFragments: {},
  pooledFragments: 0,
  poolAppliedFragments: {},
};

export function normalizeShopData(input: Partial<EconomyShopData> = {}): EconomyShopData {
  const owned = normalizeStringArray(input.owned, DEFAULT_SHOP.owned);
  const trailPacks = normalizeStringArray(input.trailPacks, DEFAULT_SHOP.trailPacks);
  const deathPacks = normalizeStringArray(input.deathPacks, DEFAULT_SHOP.deathPacks);
  const fragments = normalizeNumberRecord(input.fragments);
  const topUpFragments = normalizeNumberRecord(input.topUpFragments);
  const focusItemId = typeof input.focusItemId === 'string' && getCraftMeta(input.focusItemId)
    ? input.focusItemId
    : null;
  const pooledFragments = Math.max(0, Math.floor(Number(input.pooledFragments) || 0));
  const poolAppliedFragments = normalizeNumberRecord(input.poolAppliedFragments);

  return {
    owned,
    equipped: typeof input.equipped === 'string' ? input.equipped : DEFAULT_SHOP.equipped,
    boosterCharges: normalizeNumberRecord(input.boosterCharges),
    trailPacks,
    equippedTrail: typeof input.equippedTrail === 'string' ? input.equippedTrail : DEFAULT_SHOP.equippedTrail,
    equippedDeath: typeof input.equippedDeath === 'string' ? input.equippedDeath : DEFAULT_SHOP.equippedDeath,
    deathPacks,
    focusItemId,
    fragments,
    topUpFragments,
    pooledFragments,
    poolAppliedFragments,
  };
}

export function getCraftMeta(itemId: string | null | undefined): CraftMeta | null {
  if (!itemId) return null;
  const config = CRAFT_CONFIG[itemId as keyof typeof CRAFT_CONFIG];
  if (!config) return null;
  const tier = ECONOMY_TIERS[config.tier];
  return {
    itemId,
    type: config.type,
    tier: config.tier,
    name: config.name,
    sprite: config.sprite,
    fragments: tier.fragments,
    craftFee: ('craftFee' in config ? config.craftFee : undefined) ?? tier.craftFee,
    topUpCost: tier.topUpCost,
    topUpCapPct: tier.topUpCapPct,
    poolCapPct: tier.poolCapPct,
    directPriceRange: tier.directPriceRange,
  };
}

export function setFocus(state: EconomyShopData, itemId: string): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const meta = getCraftMeta(itemId);
  if (!meta) return fail(normalized, 'invalid_item');
  if (ownsItem(normalized, itemId, meta.type)) return fail(normalized, 'already_owned');

  const withFocus: EconomyShopData = { ...normalized, focusItemId: itemId };

  // Auto-drain the pool into the item, capped per tier so legendary items
  // can't be trivially completed from banked fragments. The cap is cumulative
  // via poolAppliedFragments so toggling focus can't bypass it.
  const current = withFocus.fragments[itemId] || 0;
  const capTotal = Math.floor(meta.fragments * meta.poolCapPct);
  const alreadyPooled = withFocus.poolAppliedFragments[itemId] || 0;
  const allowedFromPool = Math.max(0, capTotal - alreadyPooled);
  const drain = Math.min(withFocus.pooledFragments, meta.fragments - current, allowedFromPool);

  if (drain <= 0) return ok(withFocus, 0);

  return ok({
    ...withFocus,
    fragments: { ...withFocus.fragments, [itemId]: current + drain },
    pooledFragments: withFocus.pooledFragments - drain,
    poolAppliedFragments: { ...withFocus.poolAppliedFragments, [itemId]: alreadyPooled + drain },
  }, 0);
}

export function awardFragments(state: EconomyShopData, itemId: string, amount: number): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const meta = getCraftMeta(itemId);
  if (!meta) return fail(normalized, 'invalid_item');
  if (ownsItem(normalized, itemId, meta.type)) return fail(normalized, 'already_owned');

  const add = Math.max(0, Math.floor(Number(amount) || 0));
  const current = normalized.fragments[itemId] || 0;
  const next = Math.min(meta.fragments, current + add);
  return ok({
    ...normalized,
    fragments: { ...normalized.fragments, [itemId]: next },
  }, 0, next - current);
}

export interface AwardFragmentsResult {
  state: EconomyShopData;
  toFocus: number;
  toPool: number;
}

// Award loose fragments: fill the active (unowned, not-full) focus item first,
// overflow into the untyped pool. Never converts to coins.
export function awardFragmentsToShop(state: EconomyShopData, amount: number): AwardFragmentsResult {
  const normalized = normalizeShopData(state);
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (add <= 0) return { state: normalized, toFocus: 0, toPool: 0 };

  let toFocus = 0;
  const focusId = normalized.focusItemId;
  const meta = getCraftMeta(focusId);
  if (focusId && meta && !ownsItem(normalized, focusId, meta.type)) {
    const current = normalized.fragments[focusId] || 0;
    toFocus = Math.min(Math.max(0, meta.fragments - current), add);
  }

  const toPool = add - toFocus;
  const next: EconomyShopData = {
    ...normalized,
    fragments: toFocus > 0 && focusId
      ? { ...normalized.fragments, [focusId]: (normalized.fragments[focusId] || 0) + toFocus }
      : normalized.fragments,
    pooledFragments: normalized.pooledFragments + toPool,
  };
  return { state: next, toFocus, toPool };
}

export function topUpFragments(state: EconomyShopData, itemId: string, coins: number): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const meta = getCraftMeta(itemId);
  if (!meta) return fail(normalized, 'invalid_item');
  if (meta.tier === 'legendary') return fail(normalized, 'legendary_topup_disabled');
  if (ownsItem(normalized, itemId, meta.type)) return fail(normalized, 'already_owned');

  const current = normalized.fragments[itemId] || 0;
  const missing = Math.max(0, meta.fragments - current);
  if (missing <= 0) return fail(normalized, 'already_ready');

  const used = normalized.topUpFragments[itemId] || 0;
  const cap = Math.floor(meta.fragments * meta.topUpCapPct);
  const add = Math.min(missing, Math.max(0, cap - used));
  if (add <= 0) return fail(normalized, 'topup_cap_reached');

  const cost = add * meta.topUpCost;
  if (coins < cost) return fail(normalized, 'not_enough_coins');

  return ok({
    ...normalized,
    fragments: { ...normalized.fragments, [itemId]: current + add },
    topUpFragments: { ...normalized.topUpFragments, [itemId]: used + add },
  }, -cost, add);
}

export function craftItem(state: EconomyShopData, itemId: string, coins: number): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const meta = getCraftMeta(itemId);
  if (!meta) return fail(normalized, 'invalid_item');
  if (ownsItem(normalized, itemId, meta.type)) return fail(normalized, 'already_owned');
  if ((normalized.fragments[itemId] || 0) < meta.fragments) return fail(normalized, 'not_enough_fragments');
  if (coins < meta.craftFee) return fail(normalized, 'not_enough_coins');

  const next = grantItem(normalized, itemId, meta.type);
  return ok({
    ...next,
    focusItemId: next.focusItemId === itemId ? null : next.focusItemId,
    fragments: { ...next.fragments, [itemId]: 0 },
    topUpFragments: { ...next.topUpFragments, [itemId]: 0 },
    poolAppliedFragments: { ...next.poolAppliedFragments, [itemId]: 0 },
  }, -meta.craftFee, -meta.fragments);
}

export function buyDailyFragmentChest(state: EconomyShopData, coins: number): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const focusItemId = normalized.focusItemId;
  const meta = getCraftMeta(focusItemId);
  if (!focusItemId || !meta) return fail(normalized, 'no_focus_item');
  if (ownsItem(normalized, focusItemId, meta.type)) return fail(normalized, 'already_owned');

  const current = normalized.fragments[focusItemId] || 0;
  if (current >= meta.fragments) return fail(normalized, 'already_ready');
  if (coins < DAILY_FRAGMENT_CHEST.cost) return fail(normalized, 'not_enough_coins');

  const awarded = awardFragments(normalized, focusItemId, DAILY_FRAGMENT_CHEST.fragments);
  if (!awarded.ok) return awarded;
  return ok(awarded.state, -DAILY_FRAGMENT_CHEST.cost, awarded.fragmentsDelta || 0);
}

export function buyShopItem(state: EconomyShopData, itemId: string, coins: number): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const purchase = SHOP_PURCHASES[itemId as keyof typeof SHOP_PURCHASES];
  if (!purchase) return fail(normalized, 'invalid_item');
  if (purchase.price === null) return fail(normalized, 'direct_buy_disabled');
  if (ownsItem(normalized, itemId, purchase.type)) return fail(normalized, 'already_owned');
  if (coins < purchase.price) return fail(normalized, 'not_enough_coins');
  return ok(grantItem(normalized, itemId, purchase.type), -purchase.price);
}

export function buyBoosterPack(state: EconomyShopData, boosterId: string, coins: number): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const pack = BOOSTER_PACKS[boosterId as keyof typeof BOOSTER_PACKS];
  if (!pack) return fail(normalized, 'invalid_booster');
  if (coins < pack.price) return fail(normalized, 'not_enough_coins');

  return ok({
    ...normalized,
    boosterCharges: {
      ...normalized.boosterCharges,
      [boosterId]: (normalized.boosterCharges[boosterId] || 0) + pack.size,
    },
  }, -pack.price, 0, pack.size);
}

export function grantOwnedItem(state: EconomyShopData, itemId: string, type?: CraftableType): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const meta = getCraftMeta(itemId);
  if (!meta) return fail(normalized, 'invalid_item');
  if (type && meta.type !== type) return fail(normalized, 'invalid_item_type');
  if (ownsItem(normalized, itemId, meta.type)) return ok(normalized, 0);
  return ok(grantItem(normalized, itemId, meta.type), 0);
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string')));
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const amount = Math.max(0, Math.floor(Number(raw) || 0));
    if (amount > 0) output[key] = amount;
  }
  return output;
}

export function ownsItem(state: EconomyShopData, itemId: string, type: CraftableType): boolean {
  if (type === 'skin') return state.owned.includes(itemId);
  if (type === 'trail') return state.trailPacks.includes(itemId);
  return state.deathPacks.includes(itemId);
}

export function grantItem(state: EconomyShopData, itemId: string, type: CraftableType): EconomyShopData {
  if (type === 'skin') return { ...state, owned: Array.from(new Set([...state.owned, itemId])) };
  if (type === 'trail') return { ...state, trailPacks: Array.from(new Set([...state.trailPacks, itemId])) };
  return { ...state, deathPacks: Array.from(new Set([...state.deathPacks, itemId])) };
}

function ok(state: EconomyShopData, coinsDelta: number, fragmentsDelta = 0, boostersDelta = 0): EconomyMutationResult {
  return { ok: true, state, coinsDelta, fragmentsDelta, boostersDelta };
}

function fail(state: EconomyShopData, error: string): EconomyMutationResult {
  return { ok: false, error, state, coinsDelta: 0 };
}
