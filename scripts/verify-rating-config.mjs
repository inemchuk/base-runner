import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { GENERATED_CONFIG_PATH, RATING_DEFS, renderRatingConfig } from './sync-rating-config.mjs';

// Read-only drift check. Never regenerates: a stale or hand-edited
// public/game/generated/rating-config.js must FAIL, not be silently rewritten.

const root = fileURLToPath(new URL('..', import.meta.url));
const ratingTsPath = resolve(root, 'src/lib/economy/rating.ts');

function fail(message) {
  console.error(`rating config drift: ${message}`);
  process.exit(1);
}

// ── 1. Checked-in generated artifact must match a fresh render exactly ──
const expected = renderRatingConfig();
let actual;
try {
  actual = readFileSync(GENERATED_CONFIG_PATH, 'utf8');
} catch {
  fail(`missing ${GENERATED_CONFIG_PATH}; run \`npm run rating:sync\` and commit the result`);
}
if (actual !== expected) {
  fail('public/game/generated/rating-config.js is stale or hand-edited; run `npm run rating:sync` and commit the result');
}

// ── 2. RUN_RATING_DEFS in rating.ts must deep-equal the script defs ──
const ts = readFileSync(ratingTsPath, 'utf8');
const match = ts.match(/RUN_RATING_DEFS\s*=\s*(\[[\s\S]*?\])\s*as const/);
if (!match) {
  fail('could not locate RUN_RATING_DEFS array literal in src/lib/economy/rating.ts');
}

let tsDefs;
try {
  tsDefs = new Function(`return ${match[1]};`)();
} catch (error) {
  fail(`could not evaluate RUN_RATING_DEFS literal: ${error.message}`);
}

if (!Array.isArray(tsDefs) || tsDefs.length !== RATING_DEFS.length) {
  fail(`rating.ts defines ${tsDefs?.length ?? 0} ratings, scripts define ${RATING_DEFS.length}`);
}

const FIELDS = ['id', 'label', 'minScore', 'xpMultiplier', 'dailyQualityXp'];
for (let i = 0; i < RATING_DEFS.length; i++) {
  for (const field of FIELDS) {
    if (tsDefs[i][field] !== RATING_DEFS[i][field]) {
      fail(
        `ratings[${i}].${field} mismatch: rating.ts has ${JSON.stringify(tsDefs[i][field])}, ` +
        `scripts have ${JSON.stringify(RATING_DEFS[i][field])}`,
      );
    }
  }
  const extra = Object.keys(tsDefs[i]).filter((key) => !FIELDS.includes(key));
  if (extra.length) {
    fail(`ratings[${i}] has fields ${extra.join(', ')} in rating.ts that scripts do not mirror`);
  }
}

console.log('rating config verified');
