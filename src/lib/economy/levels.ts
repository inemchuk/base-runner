import type { CraftableType } from './config.ts';
import type { RewardBundle } from './config.ts';

export interface LevelRewardBase {
  label: string;
  iconSrc?: string;
  sprite?: string;
}

export type LevelReward =
  | (LevelRewardBase & { type: 'bundle'; value: RewardBundle })
  | (LevelRewardBase & { type: CraftableType; value: string });

export interface LevelState {
  level: number;
  xpInLevel: number;
  totalXp: number;
  claimed: number[];
}

export interface RunLevelProgress {
  score: number;
  sessionCoins?: number;
  checkinStreak?: number;
  isNewRecord?: boolean;
}

export interface RunXpBreakdown {
  base: number;
  multi: number;
  streakBonus: number;
  recordBonus: number;
}

export const LEVEL_REWARDS: Record<number, LevelReward> = {
  2: { type: 'bundle', value: { coins: 75, boosters: 1 }, iconSrc: '/game/ui-icons/starter-pack.png', label: '+75 coins + booster' },
  3: { type: 'skin', value: 'skin_street_runner', sprite: '/game/chars/street_runner.png', label: 'Street Runner unlocked!' },
  5: { type: 'bundle', value: { container: 'focus_chest' }, iconSrc: '/game/ui-icons/gem.png', label: 'Focus Chest' },
  7: { type: 'trail', value: 'trail_sparkle', sprite: '/nft/images/trail_sparkle.png', label: 'Sparkle Trail unlocked!' },
  10: { type: 'bundle', value: { container: 'rare_crate' }, iconSrc: '/game/ui-icons/starter-pack.png', label: 'Rare Crate' },
  12: { type: 'trail', value: 'trail_hearts', sprite: '/nft/images/trail_hearts.png', label: 'Hearts Trail unlocked!' },
  15: { type: 'bundle', value: { coins: 120, fragments: 8 }, iconSrc: '/game/ui-icons/gem.png', label: '+120 coins + 8 fragments' },
  18: { type: 'trail', value: 'trail_fire', sprite: '/nft/images/trail_fire.png', label: 'Fire Trail unlocked!' },
  20: { type: 'skin', value: 'skin_founder', sprite: '/game/chars/founder.png', label: 'Founder unlocked!' },
  25: { type: 'bundle', value: { container: 'epic_crate' }, iconSrc: '/game/ui-icons/starter-pack.png', label: 'Epic Crate' },
  30: { type: 'bundle', value: { container: 'legendary_crate' }, iconSrc: '/game/ui-icons/crown.png', label: 'Legendary Crate' },
  35: { type: 'bundle', value: { container: 'legendary_focus_bundle' }, iconSrc: '/game/ui-icons/crown.png', label: 'Legendary Focus Bundle' },
};

export function xpNeeded(level: number): number {
  return 100 * Math.max(1, Math.floor(Number(level) || 1));
}

export function defaultLevelState(): LevelState {
  return {
    level: 1,
    xpInLevel: 0,
    totalXp: 0,
    claimed: [],
  };
}

export function normalizeLevelState(input: unknown): LevelState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaultLevelState();
  const raw = input as Partial<Record<keyof LevelState, unknown>>;
  const level = Math.max(1, Math.floor(Number(raw.level) || 1));
  const xpInLevel = Math.max(0, Math.floor(Number(raw.xpInLevel) || 0));
  const totalXp = Math.max(0, Math.floor(Number(raw.totalXp) || 0));
  return {
    level,
    xpInLevel: Math.min(xpInLevel, xpNeeded(level) - 1),
    totalXp,
    claimed: normalizeClaimedLevels(raw.claimed),
  };
}

export function calculateRunXp(run: RunLevelProgress): { earned: number; breakdown: RunXpBreakdown } {
  const score = Math.max(0, Math.floor(Number(run.score) || 0));
  const sessionCoins = sanitizeRunCoins(score, run.sessionCoins);
  const baseXp = score + sessionCoins * 2;
  const multi = score >= 150 ? 1.2 : score >= 75 ? 1.0 : score >= 30 ? 0.7 : 0.5;
  const base = Math.round(baseXp * multi);
  const streakBonus = Math.min(Math.max(0, Math.floor(Number(run.checkinStreak) || 0)) * 2, 20);
  const recordBonus = run.isNewRecord ? Math.round(base * 0.5) : 0;
  return {
    earned: Math.max(0, base + streakBonus + recordBonus),
    breakdown: { base, multi, streakBonus, recordBonus },
  };
}

export function updateLevelProgressFromRun(
  state: LevelState,
  run: RunLevelProgress,
): { state: LevelState; xpEarned: number; breakdown: RunXpBreakdown; levelUps: Array<{ level: number; reward: LevelReward | null }> } {
  const normalized = normalizeLevelState(state);
  const { earned, breakdown } = calculateRunXp(run);
  const levelUps: Array<{ level: number; reward: LevelReward | null }> = [];

  let level = normalized.level;
  let xpInLevel = normalized.xpInLevel + earned;
  const totalXp = normalized.totalXp + earned;

  while (xpInLevel >= xpNeeded(level)) {
    xpInLevel -= xpNeeded(level);
    level += 1;
    levelUps.push({ level, reward: LEVEL_REWARDS[level] ?? null });
  }

  return {
    state: {
      ...normalized,
      level,
      xpInLevel,
      totalXp,
    },
    xpEarned: earned,
    breakdown,
    levelUps,
  };
}

export function claimLevelReward(
  state: LevelState,
  level: unknown,
): { ok: true; state: LevelState; level: number; reward: LevelReward } | { ok: false; error: string; state: LevelState } {
  const normalized = normalizeLevelState(state);
  const targetLevel = Math.floor(Number(level) || 0);
  if (targetLevel < 2) return { ok: false, error: 'invalid_level', state: normalized };

  const reward = LEVEL_REWARDS[targetLevel];
  if (!reward) return { ok: false, error: 'no_reward', state: normalized };
  if (targetLevel > normalized.level) return { ok: false, error: 'not_unlocked', state: normalized };
  if (normalized.claimed.includes(targetLevel)) return { ok: false, error: 'already_claimed', state: normalized };

  return {
    ok: true,
    level: targetLevel,
    reward,
    state: {
      ...normalized,
      claimed: [...normalized.claimed, targetLevel].sort((a, b) => a - b),
    },
  };
}

function normalizeClaimedLevels(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => Math.floor(Number(item) || 0))
      .filter((item) => item >= 2 && Boolean(LEVEL_REWARDS[item])),
  )).sort((a, b) => a - b);
}

function sanitizeRunCoins(score: number, sessionCoins: unknown): number {
  const raw = Math.max(0, Math.floor(Number(sessionCoins) || 0));
  const plausibleCap = score > 0 ? score * 4 + 20 : 0;
  return Math.min(raw, plausibleCap);
}
