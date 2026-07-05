import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const defs = [
  { id: 'casual', label: 'Casual', minScore: 0, xpMultiplier: 1.0, dailyQualityXp: 0 },
  { id: 'good', label: 'Good', minScore: 40, xpMultiplier: 1.05, dailyQualityXp: 25 },
  { id: 'great', label: 'Great', minScore: 80, xpMultiplier: 1.12, dailyQualityXp: 50 },
  { id: 'elite', label: 'Elite', minScore: 150, xpMultiplier: 1.2, dailyQualityXp: 100 },
  { id: 'master', label: 'Master', minScore: 300, xpMultiplier: 1.28, dailyQualityXp: 150 },
];

const out = resolve('public/game/generated/rating-config.js');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `window.__BASE_RATING_CONFIG = ${JSON.stringify({ ratings: defs }, null, 2)};\n`,
);
