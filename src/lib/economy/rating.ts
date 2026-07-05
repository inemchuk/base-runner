export type RunRating = 'casual' | 'good' | 'great' | 'elite' | 'master';

export interface RunRatingDef {
  id: RunRating;
  label: string;
  minScore: number;
  xpMultiplier: number;
  dailyQualityXp: number;
}

export const RUN_RATING_DEFS = [
  { id: 'casual', label: 'Casual', minScore: 0, xpMultiplier: 1.0, dailyQualityXp: 0 },
  { id: 'good', label: 'Good', minScore: 40, xpMultiplier: 1.05, dailyQualityXp: 25 },
  { id: 'great', label: 'Great', minScore: 80, xpMultiplier: 1.12, dailyQualityXp: 50 },
  { id: 'elite', label: 'Elite', minScore: 150, xpMultiplier: 1.2, dailyQualityXp: 100 },
  { id: 'master', label: 'Master', minScore: 300, xpMultiplier: 1.28, dailyQualityXp: 150 },
] as const satisfies readonly RunRatingDef[];

export function getRunRating(score: unknown): RunRating {
  const normalized = Math.max(0, Math.floor(Number(score) || 0));
  let rating: RunRating = 'casual';
  for (const def of RUN_RATING_DEFS) {
    if (normalized >= def.minScore) rating = def.id;
  }
  return rating;
}

export function getRatingDef(rating: RunRating): RunRatingDef {
  return RUN_RATING_DEFS.find((def) => def.id === rating) ?? RUN_RATING_DEFS[0];
}

export function getRatingXpMultiplier(rating: RunRating): number {
  return getRatingDef(rating).xpMultiplier;
}

export function getDailyQualityTargetXp(rating: RunRating): number {
  return getRatingDef(rating).dailyQualityXp;
}
