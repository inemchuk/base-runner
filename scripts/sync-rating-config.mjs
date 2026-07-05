import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Machine-readable source for the generated browser config. Must stay in
// lockstep with RUN_RATING_DEFS in src/lib/economy/rating.ts — enforced by
// scripts/verify-rating-config.mjs.
export const RATING_DEFS = [
  { id: 'casual', label: 'Casual', minScore: 0, xpMultiplier: 1.0, dailyQualityXp: 0 },
  { id: 'good', label: 'Good', minScore: 40, xpMultiplier: 1.05, dailyQualityXp: 25 },
  { id: 'great', label: 'Great', minScore: 80, xpMultiplier: 1.12, dailyQualityXp: 50 },
  { id: 'elite', label: 'Elite', minScore: 150, xpMultiplier: 1.2, dailyQualityXp: 100 },
  { id: 'master', label: 'Master', minScore: 300, xpMultiplier: 1.28, dailyQualityXp: 150 },
];

export const GENERATED_CONFIG_PATH = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
  'public/game/generated/rating-config.js',
);

export function renderRatingConfig(defs = RATING_DEFS) {
  return `window.__BASE_RATING_CONFIG = ${JSON.stringify({ ratings: defs }, null, 2)};\n`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  mkdirSync(dirname(GENERATED_CONFIG_PATH), { recursive: true });
  writeFileSync(GENERATED_CONFIG_PATH, renderRatingConfig());
  console.log(`rating config written: ${GENERATED_CONFIG_PATH}`);
}
