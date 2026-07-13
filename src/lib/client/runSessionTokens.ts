function assertRunId(runId: number): void {
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new RangeError('runId must be a positive integer');
  }
}

export function createRunSessionTokens() {
  const requests = new Map<number, Promise<string | null>>();

  return {
    async start(runId: number, request: Promise<string | null>): Promise<void> {
      assertRunId(runId);
      requests.set(runId, request);
      await request;
    },

    async take(runId: number): Promise<string | null> {
      assertRunId(runId);
      const request = requests.get(runId);
      requests.delete(runId);
      return request ?? null;
    },

    clear(): void {
      requests.clear();
    },
  };
}
