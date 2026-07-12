import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEST_DEFS,
  ROTATION_QUEST_DEFS,
  claimQuestReward,
  getActiveRotations,
  getQuestPeriods,
  normalizeQuestState,
  updateQuestProgressFromRun,
} from './quests.ts';

const monday = new Date('2026-07-13T12:00:00.000Z');

test('legacy career quest state migrates without losing progress', () => {
  const state = normalizeQuestState({
    rows: { progress: 731, claimed: [true, false] },
    games: { progress: 18, claimed: [true, true, false] },
  }, monday);

  assert.equal(state.rows.progress, 731);
  assert.equal(state.rows.claimed[0], true);
  assert.equal(state.games.progress, 18);
  assert.equal(state.games.claimed[1], true);
  assert.equal(state.daily.entries.length, 3);
  assert.equal(state.weekly.entries.length, 2);
});

test('daily and weekly rotations are deterministic and contain unique quests', () => {
  const periods = getQuestPeriods(monday);
  const dailyA = getActiveRotations('daily', periods.daily);
  const dailyB = getActiveRotations('daily', periods.daily);
  const weekly = getActiveRotations('weekly', periods.weekly);

  assert.deepEqual(dailyA, dailyB);
  assert.equal(dailyA.length, 3);
  assert.equal(new Set(dailyA.map((quest) => quest.id)).size, 3);
  assert.equal(weekly.length, 2);
  assert.equal(new Set(weekly.map((quest) => quest.id)).size, 2);
});

test('rotation progress resets when its UTC period changes', () => {
  const current = normalizeQuestState({}, monday);
  const dirty = {
    ...current,
    daily: {
      ...current.daily,
      entries: current.daily.entries.map((entry) => ({ ...entry, progress: 99, claimed: true })),
    },
  };

  const nextDay = normalizeQuestState(dirty, new Date('2026-07-14T12:00:00.000Z'));

  assert.notEqual(nextDay.daily.period, current.daily.period);
  assert.ok(nextDay.daily.entries.every((entry) => entry.progress === 0 && entry.claimed === false));
});

test('accepted run advances career and matching rotation metrics', () => {
  const initial = normalizeQuestState({}, monday);
  const next = updateQuestProgressFromRun(initial, {
    score: 140,
    sessionCoins: 24,
    rating: 'great',
  }, monday);

  assert.equal(next.rows.progress, 140);
  assert.equal(next.coins.progress, 24);
  assert.equal(next.games.progress, 1);
  assert.equal(next.record.progress, 140);
  assert.equal(next.elite_runs.progress, 1);

  for (const rotation of [next.daily, next.weekly]) {
    for (const entry of rotation.entries) {
      const def = ROTATION_QUEST_DEFS.find((quest) => quest.id === entry.id);
      assert.ok(def);
      const expected = def.metric === 'games'
        ? 1
        : def.metric === 'rows'
          ? 140
          : def.metric === 'coins'
            ? 24
            : def.metric === 'great_runs'
              ? 1
              : 140;
      assert.equal(entry.progress, expected);
    }
  }
});

test('period-scoped rotation reward can be claimed only for the current period', () => {
  const periods = getQuestPeriods(monday);
  const state = normalizeQuestState({}, monday);
  const first = state.daily.entries[0];
  const def = ROTATION_QUEST_DEFS.find((quest) => quest.id === first.id)!;
  first.progress = def.target;

  const stale = claimQuestReward(state, `daily:${first.id}`, undefined, '2026-07-12', monday);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error, 'invalid_period');

  const claimed = claimQuestReward(state, `daily:${first.id}`, undefined, periods.daily, monday);
  assert.equal(claimed.ok, true);
  if (claimed.ok) {
    assert.deepEqual(claimed.reward, def.reward);
    assert.equal(claimed.state.daily.entries[0].claimed, true);
  }
});

test('rotation rewards stay inside the economy cap and never grant collectibles', () => {
  for (const def of ROTATION_QUEST_DEFS) {
    assert.equal(def.reward.fragments, undefined, def.id);
    assert.equal(def.reward.container, undefined, def.id);
    assert.ok((def.reward.coins ?? 0) <= 40, def.id);
    assert.ok((def.reward.xp ?? 0) <= 60, def.id);
    assert.ok((def.reward.boosters ?? 0) <= 1, def.id);
  }

  assert.equal(QUEST_DEFS.length, 5);
});
