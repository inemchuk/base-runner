import type { RewardBundle } from './config.ts';

export type QuestId = 'rows' | 'coins' | 'games' | 'record';

export interface QuestLevel {
  target: number;
  reward: RewardBundle;
}

export interface QuestDef {
  id: QuestId;
  levels: readonly QuestLevel[];
}

export type QuestState = Record<QuestId, {
  progress: number;
  claimed: boolean[];
}>;

export interface RunQuestProgress {
  score: number;
  sessionCoins?: number;
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
] as const satisfies readonly QuestDef[];

export function defaultQuestState(): QuestState {
  return {
    rows: defaultEntry(),
    coins: defaultEntry(),
    games: defaultEntry(),
    record: defaultEntry(),
  };
}

export function normalizeQuestState(input: unknown): QuestState {
  const base = defaultQuestState();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

  const raw = input as Partial<Record<QuestId, { progress?: unknown; claimed?: unknown }>>;
  for (const def of QUEST_DEFS) {
    const entry = raw[def.id];
    if (!entry || typeof entry !== 'object') continue;
    base[def.id] = {
      progress: Math.max(0, Math.floor(Number(entry.progress) || 0)),
      claimed: normalizeClaimed(entry.claimed),
    };
  }
  return base;
}

export function updateQuestProgressFromRun(state: QuestState, run: RunQuestProgress): QuestState {
  const normalized = normalizeQuestState(state);
  const score = Math.max(0, Math.floor(Number(run.score) || 0));
  const sessionCoins = sanitizeRunCoins(score, run.sessionCoins);

  return {
    rows: {
      ...normalized.rows,
      progress: normalized.rows.progress + score,
    },
    coins: {
      ...normalized.coins,
      progress: normalized.coins.progress + sessionCoins,
    },
    games: {
      ...normalized.games,
      progress: normalized.games.progress + 1,
    },
    record: {
      ...normalized.record,
      progress: Math.max(normalized.record.progress, score),
    },
  };
}

export function claimQuestReward(
  state: QuestState,
  questId: string,
  level?: number,
): { ok: true; state: QuestState; reward: RewardBundle; questId: QuestId; level: number } | { ok: false; error: string; state: QuestState } {
  const normalized = normalizeQuestState(state);
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
    reward: levelInfo.reward,
    state: {
      ...normalized,
      [def.id]: {
        ...entry,
        claimed: nextClaimed,
      },
    },
  };
}

function defaultEntry() {
  return { progress: 0, claimed: [false, false, false, false, false, false, false, false] };
}

function normalizeClaimed(value: unknown): boolean[] {
  const claimed = defaultEntry().claimed;
  if (!Array.isArray(value)) return claimed;
  for (let i = 0; i < claimed.length; i++) claimed[i] = Boolean(value[i]);
  return claimed;
}

function getQuestLevel(entry: { claimed: boolean[] }): number {
  const idx = entry.claimed.indexOf(false);
  return idx === -1 ? entry.claimed.length : idx;
}

function sanitizeRunCoins(score: number, sessionCoins: unknown): number {
  const raw = Math.max(0, Math.floor(Number(sessionCoins) || 0));
  const plausibleCap = score > 0 ? score * 4 + 20 : 0;
  return Math.min(raw, plausibleCap);
}
