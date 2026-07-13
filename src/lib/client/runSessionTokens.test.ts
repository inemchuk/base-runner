import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunSessionTokens } from './runSessionTokens.ts';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('keeps run requests isolated when they resolve out of order', async () => {
  const tokens = createRunSessionTokens();
  const requestA = deferred<string | null>();
  const requestB = deferred<string | null>();
  const resolutionOrder: string[] = [];

  const startA = tokens.start(1, requestA.promise).then(() => {
    resolutionOrder.push('A');
  });
  const startB = tokens.start(2, requestB.promise).then(() => {
    resolutionOrder.push('B');
  });

  requestB.resolve('token-b');
  await startB;
  assert.deepEqual(resolutionOrder, ['B']);

  requestA.resolve('token-a');
  await startA;
  assert.deepEqual(resolutionOrder, ['B', 'A']);

  assert.equal(await tokens.take(1), 'token-a');
  assert.equal(await tokens.take(1), null);
  assert.equal(await tokens.take(2), 'token-b');
});

test('rejects invalid and non-positive run IDs', async () => {
  const tokens = createRunSessionTokens();

  for (const runId of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    await assert.rejects(
      tokens.start(runId, Promise.resolve('token')),
      RangeError,
    );
    await assert.rejects(tokens.take(runId), RangeError);
  }
});
