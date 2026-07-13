import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  let start = name === 'onGameOver' ? source.lastIndexOf(marker) : source.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${name}`);
}

function extractSection(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing section terminator ${endMarker}`);
  return source.slice(start, end);
}

function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function match(text, pattern) {
  assert.ok(pattern.test(text), `missing ${pattern}`);
}

function doesNotMatch(text, pattern) {
  assert.ok(!pattern.test(text), `unexpected ${pattern}`);
}

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`not ok - ${name}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`not ok - ${name}`);
  }
}

function createCompletionHarness(submitScore) {
  const counters = {
    finalize: 0,
    addScore: 0,
    quests: 0,
    submit: 0,
    presentFlow: 0,
    presentUi: 0,
    patchFlow: 0,
    patchUi: 0,
  };
  let finalized = false;
  let visible = false;
  let snapshot = null;
  const flow = {
    finalizeRun(runId) {
      counters.finalize += 1;
      if (runId !== 1 || finalized) return false;
      finalized = true;
      return true;
    },
    presentRun(runId, result) {
      counters.presentFlow += 1;
      visible = true;
      snapshot = { ...result, runId, claimState: 'idle' };
      return snapshot;
    },
    patchRun(runId, patch) {
      counters.patchFlow += 1;
      if (!visible || runId !== 1) return null;
      snapshot = { ...snapshot, ...patch };
      return snapshot;
    },
    isPresentedRun(runId) {
      return visible && runId === 1;
    },
  };
  const context = {
    console: { warn() {} },
    GameState: { GAMEOVER: 'gameover' },
    currentState: 'playing',
    Player: { getScore: () => 42 },
    Save: {
      getBest: () => 30,
      addScore: () => { counters.addScore += 1; return 42; },
      getCoins: () => 9,
    },
    Quests: {
      onGameOver: () => { counters.quests += 1; },
      hasClaimable: () => false,
      applyServerData() {},
    },
    Xp: {},
    UI: {
      presentRunComplete: () => { counters.presentUi += 1; },
      patchRunComplete: () => { counters.patchUi += 1; },
    },
    window: {
      __BASE_WALLET: '0x1234',
      __BASE_SYNC_COINS() {},
      dispatchEvent() {},
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    _sessionCoins: 3,
    _runSummary: {},
    _levelUpQueue: [],
    _levelUpRunId: null,
    _getRunCompleteFlow: () => flow,
    _submitScoreToServer: async (...args) => {
      counters.submit += 1;
      return submitScore(...args);
    },
    _calculateLocalRunXp: () => ({ xpEarned: 50, xpBreakdown: { base: 50, multi: 1 } }),
    _getLocalRunRating: () => ({ id: 'casual', label: 'Casual' }),
    _queueFromServerLevelUps: () => [],
    _claimLevelRewards() {},
    _scheduleNextLevelUp() {},
  };
  vm.runInNewContext(
    `let _latestReconciledRunId = 0; ${extractFunction('onGameOver')}; globalThis.run = onGameOver;`,
    context,
  );
  return {
    counters,
    run: context.run,
    leave: () => { visible = false; },
  };
}

check('UI maps runcomplete to the shared loadout screen', () => {
  match(source, /runcomplete:\s*document\.getElementById\('screen-loadout'\)/);
  doesNotMatch(source, /screen-gameover|showGameOver/);
  match(source, /function presentRunComplete\(snapshot\)/);
  match(source, /function patchRunComplete\(runId, snapshot\)/);
});

check('terminal completion is gated before every durable side effect', () => {
  const body = extractFunction('onGameOver');
  const finalize = body.indexOf('.finalizeRun(runId)');
  assert.ok(finalize >= 0, 'onGameOver must finalize the captured run');
  for (const marker of ['Save.addScore(', 'Quests.onGameOver(', '_submitScoreToServer(']) {
    assert.ok(finalize < body.indexOf(marker), `${marker} must happen after finalizeRun`);
  }
  assert.equal(occurrences(body, /UI\.presentRunComplete\(/g), 1);
  assert.equal(occurrences(body, /UI\.patchRunComplete\(/g), 1);
  doesNotMatch(body, /setTimeout\([\s\S]*600/);
  assert.ok(body.indexOf('UI.presentRunComplete(') < body.indexOf('await scoreSubmitPromise'));
  assert.ok(body.indexOf('UI.patchRunComplete(') > body.indexOf('await scoreSubmitPromise'));
});

check('gameplay owns a run id through death and Continue', () => {
  const init = extractFunction('initGame');
  const loop = extractFunction('gameLoop');
  const initUi = extractFunction('_initUI');
  match(source, /let _activeRunId\s*=\s*null/);
  match(init, /_activeRunId\s*=\s*flow\.beginRun\(\)/);
  assert.ok(init.indexOf('flow.beginRun()') < init.indexOf('currentState = GameState.PLAYING'));
  match(init, /_requestSessionToken\(_activeRunId\)/);
  match(loop, /\.markEnding\(runId\)/);
  match(initUi, /\.resumeRun\(runId\)/);
});

check('session and score bridges are run scoped', () => {
  const request = extractFunction('_requestSessionToken');
  const submit = extractFunction('_submitScoreToServer');
  match(request, /function _requestSessionToken\(runId\)/);
  match(request, /__BASE_SESSION_START\(runId\)/);
  match(submit, /function _submitScoreToServer\(runId, score, sessionCoins\)/);
  match(submit, /submitFn\(runId, score, sessionCoins\)/);
  match(submit, /detail:\s*\{\s*runId,\s*score,\s*sessionCoins\s*\}/);
});

check('shared Loadout mode guards Start and validates inventory', () => {
  const loadout = extractSection('const Loadout = (() => {', 'function refreshGearViews()');
  const start = loadout.slice(loadout.indexOf('function startRun()'));
  match(loadout, /let starting\s*=\s*false/);
  match(loadout, /function showRunComplete\(\)/);
  match(loadout, /START NEXT RUN/);
  match(start, /if \(starting\) return/);
  match(start, /unavailable/);
  assert.ok(start.indexOf('unavailable') < start.indexOf('Shop.spendBoosterLocal'));
  assert.equal(occurrences(start, /initGame\(\)/g), 1);
});

check('claim interactions use coordinator run and score identity', () => {
  const initUi = extractFunction('_initUI');
  match(initUi, /\.beginClaim\(runId, score\)/);
  match(initUi, /(?:__BASE_CLAIM_SCORE|claimScore)\(runId, score\)/);
  match(initUi, /detail\.runId/);
  match(initUi, /detail\.score/);
  match(initUi, /\.applyClaimState\(runId, score, state\)/);
  doesNotMatch(initUi, /dataset\.claiming|dataset\.claimed/);
});

check('leaving and level-up work are scoped to the presented run', () => {
  const menu = extractFunction('goToMenu');
  const showLevel = extractFunction('_showNextLevelUp');
  match(source, /let _levelUpRunId\s*=\s*null/);
  match(source, /let _levelUpTimer\s*=\s*null/);
  match(source, /function _clearLevelUpState\(\)/);
  match(source, /function _leaveActiveRun\(\)/);
  match(menu, /_leaveActiveRun\(\)/);
  match(showLevel, /isPresentedRun\(runId\)/);
  match(source, /_bind\('go-quest-notify',[\s\S]*_leaveActiveRun\(\)/);
});

await checkAsync('repeated terminal callbacks execute completion side effects once', async () => {
  const harness = createCompletionHarness(async () => ({ ok: false, error: 'submit_failed' }));
  await Promise.all([harness.run(1), harness.run(1), harness.run(1)]);
  assert.equal(harness.counters.finalize, 3);
  assert.equal(harness.counters.addScore, 1);
  assert.equal(harness.counters.quests, 1);
  assert.equal(harness.counters.submit, 1);
  assert.equal(harness.counters.presentFlow, 1);
  assert.equal(harness.counters.presentUi, 1);
});

await checkAsync('a stale server response cannot patch or reopen the visible screen', async () => {
  let resolveSubmit;
  const submission = new Promise(resolve => { resolveSubmit = resolve; });
  const harness = createCompletionHarness(() => submission);
  const completion = harness.run(1);
  assert.equal(harness.counters.presentUi, 1);
  harness.leave();
  resolveSubmit({
    ok: true,
    xp: { earned: 60, breakdown: { base: 60, multi: 1 } },
    rating: { id: 'good', label: 'Good' },
  });
  await completion;
  assert.equal(harness.counters.presentUi, 1);
  assert.equal(harness.counters.patchFlow, 1);
  assert.equal(harness.counters.patchUi, 0);
});

if (failures.length > 0) {
  console.error('\nRun Complete runtime contract failures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nrun complete runtime checks passed');
}
