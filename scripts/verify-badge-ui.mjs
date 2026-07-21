import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync('public/game/game.js', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
const badges = game.slice(game.indexOf('// ===== Onchain achievement badges'));

for (const id of ['rows', 'coins', 'games', 'record', 'elite', 'checkins', 'streak', 'level', 'collection', 'txs']) {
  const category = badges.match(new RegExp(`\\{ id: '${id}'[^\\n]+`));
  assert.ok(category, `Missing badge category: ${id}`);
  assert.match(category[0], /unit:/, `${id} needs a human-readable progress unit`);
}

for (const id of ['checkins', 'streak', 'level', 'collection', 'txs']) {
  assert.match(game, new RegExp(`/game/ui-icons/badges/${id}\\.png`), `${id} needs a dedicated badge glyph`);
}

assert.match(game, /unlocked.*claimed/, 'Badge detail header must distinguish unlocked and claimed progress');
assert.match(game, /badge-tier-target">\$\{t\.target\} \$\{def\.unit\}/, 'Tier targets must show their unit');
assert.match(game, /badge-tier-claim claim-action/, 'Reached badge tiers must use the shared claim action treatment');
assert.match(css, /\.badge-modal-card \{[\s\S]*?border-radius: 8px;/, 'Badge modal must use the shared compact surface radius');
assert.match(css, /\.badge-tier \{[\s\S]*?display: grid;[\s\S]*?border-bottom:/, 'Badge tiers must read as a disciplined list, not nested cards');

console.log('Badge UI contract verified.');
