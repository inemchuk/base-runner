import type { RewardBundle } from './config.ts';
import type { RunRating } from './rating.ts';

export type QuestId = 'rows' | 'coins' | 'games' | 'record' | 'elite_runs';
export type RotationScope = 'daily' | 'weekly';
export type RotationMetric = 'games' | 'rows' | 'coins' | 'great_runs' | 'best';
export type RotationQuestId =
  | 'daily_games'
  | 'daily_rows'
  | 'daily_coins'
  | 'daily_quality'
  | 'daily_score'
  | 'weekly_games'
  | 'weekly_rows'
  | 'weekly_coins'
  | 'weekly_quality'
  | 'weekly_score';

export interface QuestLevel {
  target: number;
  reward: RewardBundle;
}

export interface QuestDef {
  id: QuestId;
  levels: readonly QuestLevel[];
}

export interface RotationQuestDef {
  id: RotationQuestId;
  scope: RotationScope;
  metric: RotationMetric;
  target: number;
  reward: RewardBundle;
}

export interface QuestProgressEntry {
  progress: number;
  claimed: boolean[];
}

export interface RotationQuestEntry {
  id: RotationQuestId;
  progress: number;
  claimed: boolean;
}

export interface QuestRotationState {
  period: string;
  entries: RotationQuestEntry[];
}

export type QuestState = Record<QuestId, QuestProgressEntry> & {
  daily: QuestRotationState;
  weekly: QuestRotationState;
};

export interface RunQuestProgress {
  score: number;
  sessionCoins?: number;
  rating?: RunRating;
}

export const QUEST_DEFS = [
  {
    id: 'rows',
    levels: [
      { target: 100, reward: { coins: 35 } },
      { target: 300, reward: { boosters: 1 } },
      { target: 700, reward: { fragments: 3 } },
      { target: 1400, reward: { coins: 55, boosters: 1 } },
      { target: 2400, reward: { coins: 70, fragments: 5 } },
      { target: 4000, reward: { container: 'rare_crate' } },
      { target: 7000, reward: { fragments: 8, boosters: 1 } },
      { target: 12000, reward: { container: 'epic_crate' } },
    ],
  },
  {
    id: 'coins',
    levels: [
      { target: 40, reward: { coins: 30 } },
      { target: 120, reward: { coins: 45 } },
      { target: 300, reward: { fragments: 3 } },
      { target: 600, reward: { coins: 65, boosters: 1 } },
      { target: 1000, reward: { coins: 80, fragments: 5 } },
      { target: 1800, reward: { container: 'rare_crate' } },
      { target: 3000, reward: { coins: 120, fragments: 8 } },
      { target: 5000, reward: { container: 'epic_crate' } },
    ],
  },
  {
    id: 'games',
    levels: [
      { target: 5, reward: { boosters: 1 } },
      { target: 15, reward: { coins: 35 } },
      { target: 35, reward: { fragments: 3 } },
      { target: 70, reward: { boosters: 2 } },
      { target: 120, reward: { coins: 70, fragments: 5 } },
      { target: 200, reward: { container: 'rare_crate' } },
      { target: 350, reward: { fragments: 8, boosters: 2 } },
      { target: 600, reward: { container: 'epic_crate' } },
    ],
  },
  {
    id: 'record',
    levels: [
      { target: 20, reward: { coins: 45 } },
      { target: 40, reward: { fragments: 3 } },
      { target: 80, reward: { coins: 65, boosters: 1 } },
      { target: 150, reward: { fragments: 6 } },
      { target: 250, reward: { container: 'rare_crate' } },
      { target: 400, reward: { coins: 130, fragments: 8 } },
      { target: 600, reward: { container: 'epic_crate' } },
      { target: 900, reward: { container: 'legendary_crate' } },
    ],
  },
  {
    id: 'elite_runs',
    levels: [
      { target: 1, reward: { coins: 40 } },
      { target: 3, reward: { boosters: 1 } },
      { target: 7, reward: { fragments: 3 } },
      { target: 15, reward: { coins: 80, boosters: 1 } },
      { target: 30, reward: { fragments: 6 } },
      { target: 50, reward: { container: 'rare_crate' } },
      { target: 80, reward: { fragments: 10, boosters: 2 } },
      { target: 120, reward: { container: 'epic_crate' } },
    ],
  },
] as const satisfies readonly QuestDef[];

export const ROTATION_QUEST_DEFS = [
  { id: 'daily_games', scope: 'daily', metric: 'games', target: 2, reward: { coins: 10 } },
  { id: 'daily_rows', scope: 'daily', metric: 'rows', target: 120, reward: { xp: 15 } },
  { id: 'daily_coins', scope: 'daily', metric: 'coins', target: 25, reward: { coins: 10 } },
  { id: 'daily_quality', scope: 'daily', metric: 'great_runs', target: 1, reward: { xp: 20 } },
  { id: 'daily_score', scope: 'daily', metric: 'best', target: 80, reward: { boosters: 1 } },
  { id: 'weekly_games', scope: 'weekly', metric: 'games', target: 12, reward: { xp: 50 } },
  { id: 'weekly_rows', scope: 'weekly', metric: 'rows', target: 900, reward: { coins: 35 } },
  { id: 'weekly_coins', scope: 'weekly', metric: 'coins', target: 220, reward: { boosters: 1 } },
  { id: 'weekly_quality', scope: 'weekly', metric: 'great_runs', target: 4, reward: { xp: 60 } },
  { id: 'weekly_score', scope: 'weekly', metric: 'best', target: 220, reward: { coins: 40 } },
] as const satisfies readonly RotationQuestDef[];

export function getQuestPeriods(now: Date = new Date()): Record<RotationScope, string> {
  const validNow = Number.isFinite(now.getTime()) ? now : new Date();
  return {
    daily: validNow.toISOString().slice(0, 10),
    weekly: getIsoWeekPeriod(validNow),
  };
}

export function getActiveRotations(scope: RotationScope, period: string): readonly RotationQuestDef[] {
  const pool = ROTATION_QUEST_DEFS.filter((quest) => quest.scope === scope);
  const count = scope === 'daily' ? 3 : 2;
  if (pool.length <= count) return pool;

  const start = stableHash(`${scope}:${period}`) % pool.length;
  const selected: RotationQuestDef[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    selected.push(pool[(start + offset * 2) % pool.length]);
  }
  return selected;
}

export function defaultQuestState(now: Date = new Date()): QuestState {
  const periods = getQuestPeriods(now);
  return {
    rows: defaultEntry(),
    coins: defaultEntry(),
    games: defaultEntry(),
    record: defaultEntry(),
    elite_runs: defaultEntry(),
    daily: defaultRotation('daily', periods.daily),
    weekly: defaultRotation('weekly', periods.weekly),
  };
}

export function normalizeQuestState(input: unknown, now: Date = new Date()): QuestState {
  const base = defaultQuestState(now);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

  const raw = input as Record<string, unknown>;
  for (const def of QUEST_DEFS) {
    const entry = raw[def.id];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as { progress?: unknown; claimed?: unknown };
    base[def.id] = {
      progress: sanitizeProgress(candidate.progress),
      claimed: normalizeClaimed(candidate.claimed, def.levels.length),
    };
  }

  base.daily = normalizeRotation(raw.daily, 'daily', base.daily.period);
  base.weekly = normalizeRotation(raw.weekly, 'weekly', base.weekly.period);
  return base;
}

export function updateQuestProgressFromRun(
  state: QuestState,
  run: RunQuestProgress,
  now: Date = new Date(),
): QuestState {
  const normalized = normalizeQuestState(state, now);
  const score = Math.max(0, Math.floor(Number(run.score) || 0));
  const sessionCoins = sanitizeRunCoins(score, run.sessionCoins);
  const greatRunDelta = isGreatOrBetter(run.rating) ? 1 : 0;

  return {
    rows: { ...normalized.rows, progress: normalized.rows.progress + score },
    coins: { ...normalized.coins, progress: normalized.coins.progress + sessionCoins },
    games: { ...normalized.games, progress: normalized.games.progress + 1 },
    record: { ...normalized.record, progress: Math.max(normalized.record.progress, score) },
    elite_runs: { ...normalized.elite_runs, progress: normalized.elite_runs.progress + greatRunDelta },
    daily: updateRotationProgress(normalized.daily, score, sessionCoins, greatRunDelta),
    weekly: updateRotationProgress(normalized.weekly, score, sessionCoins, greatRunDelta),
  };
}

export function claimQuestReward(
  state: QuestState,
  questId: string,
  level?: number,
  period?: string,
  now: Date = new Date(),
):
  | { ok: true; state: QuestState; reward: RewardBundle; questId: string; level: number; scope: 'career' | RotationScope; period?: string }
  | { ok: false; error: string; state: QuestState } {
  const normalized = normalizeQuestState(state, now);
  const separator = questId.indexOf(':');
  if (separator > 0) {
    const scope = questId.slice(0, separator) as RotationScope;
    const rotationId = questId.slice(separator + 1) as RotationQuestId;
    if (scope !== 'daily' && scope !== 'weekly') {
      return { ok: false, error: 'invalid_quest', state: normalized };
    }
    const rotation = normalized[scope];
    if (!period || period !== rotation.period) {
      return { ok: false, error: 'invalid_period', state: normalized };
    }
    const def = ROTATION_QUEST_DEFS.find((quest) => quest.scope === scope && quest.id === rotationId);
    const entryIndex = rotation.entries.findIndex((entry) => entry.id === rotationId);
    if (!def || entryIndex < 0) return { ok: false, error: 'invalid_quest', state: normalized };

    const entry = rotation.entries[entryIndex];
    if (entry.claimed) return { ok: false, error: 'already_claimed', state: normalized };
    if (entry.progress < def.target) return { ok: false, error: 'not_enough_progress', state: normalized };

    const nextEntries = rotation.entries.map((item, index) => (
      index === entryIndex ? { ...item, claimed: true } : item
    ));
    return {
      ok: true,
      questId,
      level: 0,
      scope,
      period,
      reward: def.reward,
      state: { ...normalized, [scope]: { ...rotation, entries: nextEntries } },
    };
  }

  const def = QUEST_DEFS.find((quest) => quest.id === questId);
  if (!def) return { ok: false, error: 'invalid_quest', state: normalized };

  const entry = normalized[def.id];
  const currentLevel = getQuestLevel(entry);
  if (currentLevel >= def.levels.length) return { ok: false, error: 'quest_complete', state: normalized };
  if (typeof level === 'number' && level !== currentLevel) return { ok: false, error: 'invalid_level', state: normalized };

  const levelInfo = def.levels[currentLevel];
  if (entry.claimed[currentLevel]) return { ok: false, error: 'already_claimed', state: normalized };
  if (entry.progress < levelInfo.target) return { ok: false, error: 'not_enough_progress', state: normalized };

  const nextClaimed = [...entry.claimed];
  nextClaimed[currentLevel] = true;

  return {
    ok: true,
    questId: def.id,
    level: currentLevel,
    scope: 'career',
    reward: levelInfo.reward,
    state: {
      ...normalized,
      [def.id]: { ...entry, claimed: nextClaimed },
    },
  };
}

function defaultEntry(): QuestProgressEntry {
  return { progress: 0, claimed: [false, false, false, false, false, false, false, false] };
}

function defaultRotation(scope: RotationScope, period: string): QuestRotationState {
  return {
    period,
    entries: getActiveRotations(scope, period).map((quest) => ({
      id: quest.id,
      progress: 0,
      claimed: false,
    })),
  };
}

function normalizeRotation(input: unknown, scope: RotationScope, period: string): QuestRotationState {
  const fallback = defaultRotation(scope, period);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const raw = input as { period?: unknown; entries?: unknown };
  const rawEntries = raw.entries;
  if (raw.period !== period || !Array.isArray(rawEntries)) return fallback;

  return {
    period,
    entries: fallback.entries.map((entry) => {
      const saved = rawEntries.find((candidate) => (
        candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        && (candidate as { id?: unknown }).id === entry.id
      )) as { progress?: unknown; claimed?: unknown } | undefined;
      return saved
        ? { ...entry, progress: sanitizeProgress(saved.progress), claimed: saved.claimed === true }
        : entry;
    }),
  };
}

function updateRotationProgress(
  rotation: QuestRotationState,
  score: number,
  sessionCoins: number,
  greatRunDelta: number,
): QuestRotationState {
  return {
    ...rotation,
    entries: rotation.entries.map((entry) => {
      const def = ROTATION_QUEST_DEFS.find((quest) => quest.id === entry.id);
      if (!def) return entry;
      const delta = def.metric === 'games'
        ? 1
        : def.metric === 'rows'
          ? score
          : def.metric === 'coins'
            ? sessionCoins
            : def.metric === 'great_runs'
              ? greatRunDelta
              : 0;
      return {
        ...entry,
        progress: def.metric === 'best' ? Math.max(entry.progress, score) : entry.progress + delta,
      };
    }),
  };
}

function normalizeClaimed(value: unknown, length: number): boolean[] {
  const claimed = Array.from({ length }, () => false);
  if (!Array.isArray(value)) return claimed;
  for (let i = 0; i < claimed.length; i += 1) claimed[i] = Boolean(value[i]);
  return claimed;
}

function getQuestLevel(entry: QuestProgressEntry): number {
  const idx = entry.claimed.indexOf(false);
  return idx === -1 ? entry.claimed.length : idx;
}

function sanitizeProgress(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function isGreatOrBetter(rating: RunRating | undefined): boolean {
  return rating === 'great' || rating === 'elite' || rating === 'master';
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getIsoWeekPeriod(date: Date): string {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function sanitizeRunCoins(score: number, sessionCoins: unknown): number {
  const raw = Math.max(0, Math.floor(Number(sessionCoins) || 0));
  const plausibleCap = score > 0 ? score * 4 + 20 : 0;
  return Math.min(raw, plausibleCap);
}
