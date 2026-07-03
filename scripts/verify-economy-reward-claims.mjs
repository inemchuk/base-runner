import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, 'utf8');
}

const storage = read('src/lib/economy/storage.ts');
const rewards = read('src/lib/economy/rewards.ts');
const quests = read('src/lib/economy/quests.ts');
const levels = read('src/lib/economy/levels.ts');
const claimRoute = read('src/app/api/economy/claim/route.ts');
const hydrateRoute = read('src/app/api/economy/hydrate/route.ts');
const questsRoute = read('src/app/api/quests/route.ts');
const scoreSubmit = read('src/app/api/score/submit/route.ts');
const hook = read('src/hooks/useEconomySync.ts');
const leaderboardHook = read('src/hooks/useLeaderboard.ts');
const game = read('public/game/game.js');

assert.match(storage, /export async function readCheckinRewardState/, 'storage should read server check-in reward state');
assert.match(storage, /export async function writeCheckinRewardState/, 'storage should write server check-in reward state');
assert.match(storage, /export async function readQuestState/, 'storage should read server quest state');
assert.match(storage, /export async function writeQuestState/, 'storage should write server quest state');
assert.match(storage, /export async function readLevelState/, 'storage should read server level state');
assert.match(storage, /export async function writeLevelState/, 'storage should write server level state');
assert.match(storage, /export async function writeBestScore/, 'storage should migrate legacy best score to server leaderboard storage');

assert.match(quests, /export const QUEST_DEFS/, 'shared quest config should exist server-side');
assert.match(quests, /export function updateQuestProgressFromRun/, 'server should derive quest progress from accepted runs');
assert.match(quests, /export function claimQuestReward/, 'server should claim quest rewards from canonical quest config');
assert.match(levels, /export const LEVEL_REWARDS/, 'shared level rewards should exist server-side');
assert.match(levels, /export function updateLevelProgressFromRun/, 'server should derive XP and levels from accepted runs');
assert.match(levels, /export function claimLevelReward/, 'server should claim level rewards from canonical level config');

assert.match(rewards, /export function applyRewardBundle/, 'reward helper should apply canonical bundles server-side');
assert.match(rewards, /REWARD_CONTAINERS/, 'reward helper should resolve canonical containers');
assert.match(rewards, /awardFragments/, 'reward helper should route Focus fragments through economy core');
assert.doesNotMatch(rewards, /universal/i, 'V1 reward helper must not introduce universal fragments');

assert.match(claimRoute, /CHECKIN_REWARDS/, 'claim route should use canonical check-in rewards');
assert.match(claimRoute, /CHECKIN_ADDRESS/, 'claim route should verify against the check-in contract address');
assert.match(claimRoute, /functionName:\s*'getState'/, 'claim route should read on-chain check-in state before awarding');
assert.match(claimRoute, /not_checked_in_onchain/, 'claim route should reject reward claims without confirmed on-chain check-in');
assert.match(claimRoute, /source !== 'checkin' && source !== 'quest' && source !== 'level'/, 'claim route should reject unknown reward sources');
assert.match(claimRoute, /readCheckinRewardState/, 'claim route should use server duplicate-protection state');
assert.match(claimRoute, /claimQuestReward/, 'claim route should use server quest claim helper');
assert.match(claimRoute, /readQuestState/, 'claim route should read authoritative quest state');
assert.match(claimRoute, /claimLevelReward/, 'claim route should use server level claim helper');
assert.match(claimRoute, /readLevelState/, 'claim route should read authoritative level state');
assert.match(claimRoute, /writeLevelState/, 'claim route should persist claimed level rewards');
assert.match(claimRoute, /grantOwnedItem/, 'level claim should unlock server-selected level cosmetics only');
assert.doesNotMatch(claimRoute, /body\.fragments|body\.reward|body\.bundle|awardFragments\(.*body/s, 'claim route must not trust client-chosen rewards');

assert.match(hydrateRoute, /\/economy\/hydrate|function POST|export async function POST/, 'legacy economy hydrate route should exist');
assert.match(hydrateRoute, /Math\.max\(coins,\s*sanitizeNumber\(legacy\.coins\)\)/, 'hydrate should keep the higher server/local coin balance');
assert.match(hydrateRoute, /mergeLegacyShop/, 'hydrate should merge legacy shop data instead of replacing it');
assert.match(hydrateRoute, /mergeLegacyQuests/, 'hydrate should merge legacy quest progress and claims');
assert.match(hydrateRoute, /mergeLegacyLevels/, 'hydrate should merge legacy XP level state');
assert.match(hydrateRoute, /level <= legacy\.level[\s\S]*claimed\.add\(level\)/, 'hydrate should mark already reached legacy level rewards claimed');
assert.match(hydrateRoute, /writeBestScore/, 'hydrate should preserve legacy best score');

assert.match(scoreSubmit, /updateQuestProgressFromRun/, 'score submit should update server quest progress after anti-cheat validation');
assert.match(scoreSubmit, /updateLevelProgressFromRun/, 'score submit should update server XP progress after anti-cheat validation');
assert.match(scoreSubmit, /readLevelState/, 'score submit should read server level state');
assert.match(scoreSubmit, /levelUps/, 'score submit should return server-derived level ups');
assert.match(scoreSubmit, /sessionCoins/, 'score submit should receive run coin progress for coin quest accounting');
assert.match(leaderboardHook, /sessionCoins/, 'client score submit should include session coins');
assert.match(leaderboardHook, /return data/, 'client score submit should return server XP and level data to game.js');

assert.match(questsRoute, /readQuestState/, 'quest GET should read authoritative server quest state');
assert.doesNotMatch(questsRoute, /redis\.set\(`quests:\$\{addr\}`,\s*data\)|memStore\.set\(addr,\s*data\)/, 'quest POST must not trust client-authored quest data as authoritative');

assert.match(hook, /__BASE_ECONOMY_CLAIM/, 'client bridge should expose a narrow economy claim action');
assert.match(hook, /\/api\/economy\/claim/, 'client bridge should call the economy claim route');
assert.match(hook, /\/api\/economy\/hydrate/, 'client should hydrate legacy local economy before server claims');
assert.match(hook, /readLegacyEconomySnapshot/, 'client should build a legacy localStorage snapshot for migration');
assert.match(hook, /source:\s*'checkin'\s*\|\s*'quest'\s*\|\s*'level'/, 'client bridge should allow quest and level claim sources');

const checkinHandlerStart = game.indexOf("window.addEventListener('base-checkin-confirmed'");
assert.notEqual(checkinHandlerStart, -1, 'game should listen for check-in confirmations');
const checkinHandlerEnd = game.indexOf("_bind('btn-ci-back'", checkinHandlerStart);
const checkinHandler = game.slice(checkinHandlerStart, checkinHandlerEnd === -1 ? undefined : checkinHandlerEnd);

assert.match(game, /function applyCheckinRewardServerClaim\(\)[\s\S]*__BASE_ECONOMY_CLAIM/, 'server check-in helper should call economy claim bridge');
assert.match(game, /serverRejected/, 'game should not local-fallback when the server rejects a reward claim');
assert.match(game, /applyQuestRewardServerClaim/, 'quest claims should prefer server economy claim');
assert.match(game, /base-auto-submit-score[\s\S]*sessionCoins/, 'game should submit session coins with score for quest progress');
assert.match(game, /claimReward\(level,\s*reward\)[\s\S]*source:\s*'level'/, 'level rewards should prefer server economy claim');
assert.match(game, /applyServerState\(serverState\)/, 'game should hydrate XP state from the server');
assert.doesNotMatch(game, /updateLevelProgressFromRun/, 'game should not contain the server XP mutator');
assert.match(game, /window\.Save = Save[\s\S]*window\.Shop = Shop[\s\S]*window\.Quests = Quests[\s\S]*window\.Xp = Xp[\s\S]*window\.RewardEconomy = RewardEconomy/, 'game modules should be exposed for React sync/hydration bridges');
assert.match(checkinHandler, /applyCheckinRewardServerClaim/, 'confirmed check-in handler should prefer server reward claim');
assert.match(checkinHandler, /applyCheckinRewardLocalFallback/, 'confirmed check-in handler should keep local fallback for dev/no-wallet');
assert.doesNotMatch(
  checkinHandler,
  /const reward\s*=\s*RewardEconomy\.getCheckInReward[\s\S]*RewardEconomy\.applyBundleLocal\(reward,\s*'checkin'\)/,
  'confirmed check-in handler should not directly apply the reward before server claim',
);
