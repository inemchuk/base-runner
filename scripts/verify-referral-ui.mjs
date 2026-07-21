import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync('public/game/game.js', 'utf8');
const markup = readFileSync('src/components/Game.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
const statusRoute = readFileSync('src/app/api/referral/status/route.ts', 'utf8');
const i18n = readFileSync('public/game/i18n.js', 'utf8');

assert.match(statusRoute, /payoutMinCents:/, 'Referral status must expose the weekly payout threshold');
assert.match(game, /qualified_unpaid/, 'Referral UI must handle qualified-but-unpayable friends');
assert.match(game, /REWARDS PAUSED/, 'Qualified-but-unpayable friends must never be shown as earned');
assert.match(game, /ref\.game_transactions/, 'Referral qualification copy must be localizable');
assert.match(i18n, /'ref\.game_transactions': 'game transactions on Base'/, 'English referral transaction unit is required');
assert.match(i18n, /'ref\.game_transactions': 'игровых транзакций в Base'/, 'Russian referral transaction unit is required');
assert.match(game, /referral-friend-track/, 'Each friend needs a visual transaction-progress track');
assert.match(markup, /referral-payout-fill/, 'Invite screen needs a payout-progress indicator');
assert.match(markup, /referral-invite\.png/, 'Invite entry point needs a dedicated game icon');
assert.match(markup, /referral-balance-label" data-i18n="ref\.balance">Balance/, 'Referral header must identify the amount as a balance, not another payout condition');
assert.match(i18n, /'ref\.terms': 'Paid in USDC on Base every week\. Fraudulent referrals are voided\.'/, 'Referral terms must not repeat the weekly payout minimum');
assert.doesNotMatch(i18n, /'ref\.terms': '[^']*\$1\.00/, 'The weekly payout minimum must appear only in the payout progress block');
assert.match(css, /\.referral-card \{[\s\S]*?border-radius: 8px;/, 'Referral card must use the compact shared surface radius');
assert.match(css, /\.referral-friend-track \{/, 'Referral styles must define the friend progress track');

console.log('Referral UI contract verified.');
