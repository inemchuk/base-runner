import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const routePath = 'src/app/api/feedback/route.ts';
assert.ok(existsSync(routePath), 'Feedback API route must exist');

const markup = readFileSync('src/components/Game.tsx', 'utf8');
const runtime = readFileSync('public/game/game.js', 'utf8');
const styles = readFileSync('src/app/globals.css', 'utf8');
const i18n = readFileSync('public/game/i18n.js', 'utf8');
const route = readFileSync(routePath, 'utf8');

assert.match(markup, /id="feedback-form"/, 'Settings must render a feedback form');
assert.match(markup, /data-feedback-kind="bug"/, 'Settings must let players report bugs');
assert.match(markup, /data-feedback-kind="idea"/, 'Settings must let players share ideas');
assert.match(runtime, /_initFeedbackForm/, 'Game runtime must bind the feedback form');
assert.match(runtime, /fetch\('\/api\/feedback'/, 'Feedback form must submit to the server');
assert.match(runtime, /window\.__BASE_WALLET/, 'Feedback must attach the optional connected wallet');
assert.match(styles, /\.feedback-card/, 'Feedback card needs scoped settings styling');
assert.match(i18n, /'feedback\.send'/, 'Feedback strings must be localized');
assert.match(route, /export async function POST/, 'Feedback API must accept submissions');
assert.match(route, /export async function GET/, 'Feedback API must expose an owner inbox');
assert.match(route, /feedback:inbox/, 'Feedback API must persist messages in Redis');
assert.match(route, /TELEGRAM_FEEDBACK_BOT_TOKEN/, 'Feedback API must support Telegram delivery');
assert.match(route, /TELEGRAM_FEEDBACK_CHAT_ID/, 'Feedback API must require a Telegram destination');
assert.match(route, /x-admin-secret/, 'Feedback inbox must be protected');
assert.match(route, /RATE_LIMIT_SECONDS = 60/, 'Feedback API must rate-limit submissions');

console.log('Feedback inbox structure verified.');
