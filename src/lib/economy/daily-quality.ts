import { getDailyQualityTargetXp, getRunRating, type RunRating } from './rating.ts';

export interface DailyQualityState {
  utcDate: string;
  bestRating: RunRating;
  claimedXp: number;
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function defaultDailyQualityState(date = utcDay()): DailyQualityState {
  return { utcDate: date, bestRating: 'casual', claimedXp: 0 };
}

export function normalizeDailyQualityState(input: unknown, date = utcDay()): DailyQualityState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaultDailyQualityState(date);
  const raw = input as Partial<DailyQualityState>;
  if (raw.utcDate !== date) return defaultDailyQualityState(date);
  return {
    utcDate: date,
    bestRating: getRunRating(ratingToMinScore(raw.bestRating)),
    claimedXp: Math.max(0, Math.floor(Number(raw.claimedXp) || 0)),
  };
}

export function applyDailyQualityRun(
  state: DailyQualityState,
  rating: RunRating,
): { state: DailyQualityState; xpDelta: number } {
  const targetXp = getDailyQualityTargetXp(rating);
  const xpDelta = Math.max(0, targetXp - state.claimedXp);
  const nextBest = targetXp >= getDailyQualityTargetXp(state.bestRating) ? rating : state.bestRating;
  return {
    xpDelta,
    state: { ...state, bestRating: nextBest, claimedXp: state.claimedXp + xpDelta },
  };
}

function ratingToMinScore(rating: unknown): number {
  if (rating === 'master') return 300;
  if (rating === 'elite') return 150;
  if (rating === 'great') return 80;
  if (rating === 'good') return 40;
  return 0;
}
