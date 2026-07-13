import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRunCompleteFlow,
  type RunCompleteFlow,
  type RunCompleteSnapshot,
} from './runCompleteFlow.ts';

const localResult: Omit<RunCompleteSnapshot, 'runId' | 'claimState'> = {
  score: 731,
  previousBest: 700,
  best: 731,
  isNewRecord: true,
  sessionCoins: 42,
  xpEarned: 75,
  xpBreakdown: { base: 50, ratingBonus: 25 },
  rating: { id: 'great', label: 'GREAT' },
  hasClaimableQuest: true,
  canClaimOnchain: true,
};

function finishRun(flow: RunCompleteFlow, result = localResult) {
  const runId = flow.beginRun();
  assert.equal(flow.markEnding(runId), true);
  assert.equal(flow.finalizeRun(runId), true);
  const snapshot = flow.presentRun(runId, result);
  assert.ok(snapshot);
  return { runId, snapshot };
}

test('finalizes and presents each run at most once', () => {
  const flow = createRunCompleteFlow();
  const runId = flow.beginRun();

  assert.equal(flow.markEnding(runId), true);
  assert.equal(flow.markEnding(runId), false);
  assert.equal(flow.finalizeRun(runId), true);
  assert.equal(flow.finalizeRun(runId), false);

  const snapshot = flow.presentRun(runId, localResult);
  assert.deepEqual(snapshot, { runId, ...localResult, claimState: 'idle' });
  assert.equal(flow.presentRun(runId, localResult), null);
  assert.equal(flow.isPresentedRun(runId), true);
  assert.equal(flow.getActiveRunId(), runId);
});

test('resumes Continue without finalizing that death', () => {
  const flow = createRunCompleteFlow();
  const runId = flow.beginRun();

  assert.equal(flow.markEnding(runId), true);
  assert.equal(flow.resumeRun(runId), true);
  assert.equal(flow.finalizeRun(runId), false);
  assert.equal(flow.markEnding(runId), true);
  assert.equal(flow.finalizeRun(runId), true);
});

test('makes decline and timeout double-finalization harmless', () => {
  const flow = createRunCompleteFlow();
  const runId = flow.beginRun();

  assert.equal(flow.markEnding(runId), true);
  assert.equal(flow.finalizeRun(runId), true);
  assert.equal(flow.finalizeRun(runId), false);
});

test('rejects a stale authoritative patch after a newer run begins', () => {
  const flow = createRunCompleteFlow();
  const { runId: oldRunId } = finishRun(flow);
  const newRunId = flow.beginRun();

  assert.ok(newRunId > oldRunId);
  assert.equal(flow.patchRun(oldRunId, { best: 999 }), null);
  assert.equal(flow.getActiveRunId(), newRunId);
  assert.equal(flow.getSnapshot(), null);
});

test('rejects a stale authoritative patch after leaving a run', () => {
  const flow = createRunCompleteFlow();
  const { runId } = finishRun(flow);

  assert.equal(flow.leaveRun(runId), true);
  assert.equal(flow.leaveRun(runId), false);
  assert.equal(flow.patchRun(runId, { best: 999 }), null);
  assert.equal(flow.isPresentedRun(runId), false);
  assert.equal(flow.getActiveRunId(), null);
  assert.equal(flow.getSnapshot(), null);
});

test('starts a matching eligible claim only once', () => {
  const flow = createRunCompleteFlow();
  const { runId } = finishRun(flow);

  assert.equal(flow.beginClaim(runId, localResult.score), true);
  assert.equal(flow.beginClaim(runId, localResult.score), false);
  assert.equal(flow.beginClaim(runId, localResult.score + 1), false);
  assert.equal(flow.getSnapshot()?.claimState, 'claiming');
});

test('patches only defined result fields without changing result identity or claim state', () => {
  const flow = createRunCompleteFlow();
  const { runId } = finishRun(flow);
  assert.equal(flow.beginClaim(runId, localResult.score), true);

  const patch = {
    runId: runId + 10,
    score: localResult.score + 10,
    previousBest: undefined,
    best: 800,
    xpEarned: 90,
    xpBreakdown: { base: 60, ratingBonus: 30 },
    claimState: 'idle',
    unrelated: 'ignored',
  } as unknown as Parameters<typeof flow.patchRun>[1];
  const snapshot = flow.patchRun(runId, patch);

  assert.ok(snapshot);
  assert.equal(snapshot.runId, runId);
  assert.equal(snapshot.score, localResult.score);
  assert.equal(snapshot.previousBest, localResult.previousBest);
  assert.equal(snapshot.best, 800);
  assert.equal(snapshot.xpEarned, 90);
  assert.deepEqual(snapshot.xpBreakdown, { base: 60, ratingBonus: 30 });
  assert.equal(snapshot.claimState, 'claiming');
  assert.equal('unrelated' in snapshot, false);
});

test('ignores stale claim events even when a newer run reuses the score', () => {
  const flow = createRunCompleteFlow();
  const { runId: oldRunId } = finishRun(flow);
  assert.equal(flow.beginClaim(oldRunId, localResult.score), true);

  const { runId: newRunId } = finishRun(flow);
  assert.equal(flow.applyClaimState(oldRunId, localResult.score, 'claimed'), null);
  assert.equal(flow.applyClaimState(newRunId, localResult.score + 1, 'claimed'), null);
  assert.equal(flow.getSnapshot()?.claimState, 'idle');

  assert.equal(flow.beginClaim(newRunId, localResult.score), true);
  assert.equal(flow.applyClaimState(newRunId, localResult.score, 'confirming')?.claimState, 'confirming');
  assert.equal(flow.applyClaimState(newRunId, localResult.score, 'claimed')?.claimState, 'claimed');
});

test('returns snapshots that cannot mutate coordinator state', () => {
  const flow = createRunCompleteFlow();
  const { snapshot } = finishRun(flow);

  snapshot.best = 1;
  assert.ok(snapshot.rating);
  snapshot.rating.label = 'MUTATED';
  assert.ok(snapshot.xpBreakdown);
  snapshot.xpBreakdown.base = 1;

  const stored = flow.getSnapshot();
  assert.ok(stored);
  assert.equal(stored.best, localResult.best);
  assert.deepEqual(stored.rating, localResult.rating);
  assert.deepEqual(stored.xpBreakdown, localResult.xpBreakdown);
});
