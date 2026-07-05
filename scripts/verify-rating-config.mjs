import { readFileSync } from 'node:fs';

const ts = readFileSync('src/lib/economy/rating.ts', 'utf8');
const generated = readFileSync('public/game/generated/rating-config.js', 'utf8');

for (const expected of [
  "'casual'",
  "'good'",
  "'great'",
  "'elite'",
  "'master'",
  'minScore: 40',
  'minScore: 80',
  'minScore: 150',
  'minScore: 300',
  'xpMultiplier: 1.28',
  'dailyQualityXp: 150',
]) {
  if (!ts.includes(expected)) {
    throw new Error(`rating.ts missing ${expected}`);
  }
}

for (const expected of [
  '"id": "casual"',
  '"id": "good"',
  '"id": "great"',
  '"id": "elite"',
  '"id": "master"',
  '"minScore": 300',
  '"xpMultiplier": 1.28',
  '"dailyQualityXp": 150',
]) {
  if (!generated.includes(expected)) {
    throw new Error(`generated rating config missing ${expected}`);
  }
}

console.log('rating config verified');
