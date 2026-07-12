export type CraftableType = 'skin' | 'trail' | 'death';
export type EconomyTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface TierConfig {
  fragments: number;
  craftFee: number;
  topUpCost: number;
  topUpCapPct: number;
  poolCapPct: number;
  directPriceRange: { min: number; max: number } | null;
}

export interface CraftConfig {
  type: CraftableType;
  tier: EconomyTier;
  name: string;
  sprite?: string;
  craftFee?: number;
}

export interface ShopPurchaseConfig {
  type: CraftableType;
  price: number | null;
}

export interface BoosterPackConfig {
  price: number;
  size: number;
}

export interface RewardBundle {
  coins?: number;
  fragments?: number;
  boosters?: number;
  xp?: number;
  container?: keyof typeof REWARD_CONTAINERS;
}

export interface SpinRewardEntry {
  type: 'coins' | 'booster' | 'fragments' | 'xp' | 'fragment_burst' | 'crate' | 'direct_cosmetic' | 'miss';
  weight: number;
  averageCoins?: number;
  averageFragments?: number;
  averageXp?: number;
  excludesLegendary?: boolean;
}

export const DAILY_FRAGMENT_CHEST = {
  cost: 90,
  fragments: 3,
  limitPerDay: 1,
} as const;

export const ECONOMY_TIERS = {
  common: {
    fragments: 10,
    craftFee: 40,
    topUpCost: 20,
    topUpCapPct: 0.2,
    poolCapPct: 1,
    directPriceRange: { min: 150, max: 250 },
  },
  rare: {
    fragments: 20,
    craftFee: 100,
    topUpCost: 35,
    topUpCapPct: 0.2,
    poolCapPct: 1,
    directPriceRange: { min: 750, max: 900 },
  },
  epic: {
    fragments: 35,
    craftFee: 220,
    topUpCost: 60,
    topUpCapPct: 0.2,
    poolCapPct: 1,
    directPriceRange: { min: 1200, max: 1600 },
  },
  legendary: {
    fragments: 60,
    craftFee: 500,
    topUpCost: 160,
    topUpCapPct: 0,
    poolCapPct: 0.5,
    directPriceRange: null,
  },
} as const satisfies Record<EconomyTier, TierConfig>;

export const CRAFT_CONFIG = {
  trail_sparkle: { type: 'trail', tier: 'common', name: 'Sparkle', sprite: '/nft/images/trail_sparkle.png' },
  trail_hearts: { type: 'trail', tier: 'rare', name: 'Hearts', sprite: '/nft/images/trail_hearts.png' },
  trail_fire: { type: 'trail', tier: 'rare', name: 'Fire', sprite: '/nft/images/trail_fire.png' },
  trail_coins: { type: 'trail', tier: 'epic', name: 'Coins', sprite: '/nft/images/trail_coins.png' },
  trail_rainbow: { type: 'trail', tier: 'legendary', name: 'Rainbow', sprite: '/nft/images/trail_rainbow.png' },

  death_comic: { type: 'death', tier: 'common', name: 'Comic', sprite: '/game/ui-icons/celebration.png' },
  death_pixel: { type: 'death', tier: 'rare', name: 'Pixel', sprite: '/game/ui-icons/gamepad.png' },
  death_dramatic: { type: 'death', tier: 'epic', name: 'Dramatic', sprite: '/game/ui-icons/fire.png' },

  skin_street_runner: { type: 'skin', tier: 'common', name: 'City Runner', sprite: '/game/chars/street_runner.png' },
  skin_1: { type: 'skin', tier: 'rare', name: 'Court Runner', sprite: '/game/chars/skin1.png' },
  skin_2: { type: 'skin', tier: 'epic', name: 'Justin Sun', sprite: '/game/chars/skin2.png', craftFee: 300 },
  skin_default: { type: 'skin', tier: 'rare', name: 'Base Builder', sprite: '/game/player.png' },
  skin_3: { type: 'skin', tier: 'rare', name: 'Night Operator', sprite: '/game/chars/skin3.png' },
  skin_4: { type: 'skin', tier: 'epic', name: 'Satoshi Nakamoto', sprite: '/game/chars/skin4.png', craftFee: 300 },
  skin_5: { type: 'skin', tier: 'epic', name: 'Anatoly Yakovenko', sprite: '/game/chars/skin5.png', craftFee: 300 },
  skin_6: { type: 'skin', tier: 'rare', name: 'Doctor', sprite: '/game/chars/skin6.png' },
  skin_7: { type: 'skin', tier: 'epic', name: 'Bitcoin Maxi', sprite: '/game/chars/skin7.png', craftFee: 300 },
  skin_founder: { type: 'skin', tier: 'legendary', name: 'Vitalik Buterin', sprite: '/game/chars/founder.png' },
  skin_8: { type: 'skin', tier: 'legendary', name: 'Brian Armstrong', sprite: '/game/chars/skin8.png' },
  skin_9: { type: 'skin', tier: 'rare', name: 'Firefighter', sprite: '/game/chars/skin9.png' },
  skin_10: { type: 'skin', tier: 'rare', name: 'Police Officer', sprite: '/game/chars/skin10.png' },
  skin_11: { type: 'skin', tier: 'epic', name: 'Ape Holder', sprite: '/game/chars/skin11.png', craftFee: 300 },
  skin_base_king: { type: 'skin', tier: 'legendary', name: 'Base King', sprite: '/game/chars/base_king.png' },
} as const satisfies Record<string, CraftConfig>;

export const SHOP_PURCHASES = {
  trail_sparkle: { type: 'trail', price: 150 },
  trail_hearts: { type: 'trail', price: 750 },
  trail_fire: { type: 'trail', price: 800 },
  trail_coins: { type: 'trail', price: 1200 },
  trail_rainbow: { type: 'trail', price: null },

  death_comic: { type: 'death', price: 200 },
  death_pixel: { type: 'death', price: 800 },
  death_dramatic: { type: 'death', price: 1200 },

  skin_street_runner: { type: 'skin', price: 150 },
  skin_1: { type: 'skin', price: 750 },
  skin_2: { type: 'skin', price: 1200 },
  skin_default: { type: 'skin', price: 800 },
  skin_3: { type: 'skin', price: 750 },
  skin_4: { type: 'skin', price: 1400 },
  skin_5: { type: 'skin', price: 1300 },
  skin_6: { type: 'skin', price: 800 },
  skin_7: { type: 'skin', price: 1350 },
  skin_founder: { type: 'skin', price: null },
  skin_8: { type: 'skin', price: null },
  skin_9: { type: 'skin', price: 850 },
  skin_10: { type: 'skin', price: 900 },
  skin_11: { type: 'skin', price: 1500 },
  skin_base_king: { type: 'skin', price: null },
} as const satisfies Record<string, ShopPurchaseConfig>;

export const BOOSTER_PACKS = {
  boost_magnet: { price: 60, size: 3 },
  boost_double: { price: 90, size: 3 },
  boost_shield: { price: 100, size: 3 },
} as const satisfies Record<string, BoosterPackConfig>;

export const REWARD_CONTAINERS = {
  gear_crate: { coins: 50, fragments: 5, boosters: 3 },
  focus_chest: { fragments: 6 },
  rare_crate: { coins: 40, fragments: 8, boosters: 1 },
  epic_crate: { coins: 80, fragments: 12, boosters: 2 },
  legendary_crate: { coins: 150, fragments: 18, boosters: 3 },
  legendary_focus_bundle: { fragments: 20 },
} as const;

export const CHECKIN_REWARDS: readonly RewardBundle[] = [
  { coins: 20 },
  { coins: 15, boosters: 1 },
  { fragments: 2 },
  { coins: 35, boosters: 1 },
  { coins: 20, fragments: 3 },
  { coins: 50, xp: 75 },
  { container: 'gear_crate' },
] as const;

export const SPIN_REWARD_TABLE: readonly SpinRewardEntry[] = [
  { type: 'coins', weight: 25, averageCoins: 45 },
  { type: 'booster', weight: 25 },
  { type: 'fragments', weight: 24, averageFragments: 2 },
  { type: 'xp', weight: 10, averageXp: 100 },
  { type: 'fragment_burst', weight: 8, averageFragments: 5 },
  { type: 'crate', weight: 5, averageFragments: 6 },
  { type: 'direct_cosmetic', weight: 2, excludesLegendary: true },
  { type: 'miss', weight: 1 },
] as const;

export function getSpinFragmentEv(): { base: number; withCrates: number } {
  const fragmentEv = SPIN_REWARD_TABLE.reduce((sum, entry) => {
    if (entry.type !== 'fragments' && entry.type !== 'fragment_burst') return sum;
    return sum + (entry.weight / 100) * (entry.averageFragments || 0);
  }, 0);
  const crateEv = SPIN_REWARD_TABLE.reduce((sum, entry) => {
    if (entry.type !== 'crate') return sum;
    return sum + (entry.weight / 100) * (entry.averageFragments || 0);
  }, 0);
  return {
    base: Number(fragmentEv.toFixed(2)),
    withCrates: Number((fragmentEv + crateEv).toFixed(2)),
  };
}
