export type RunClaimState = 'idle' | 'claiming' | 'confirming' | 'claimed';

export type RunCompletePhase =
  | 'idle'
  | 'playing'
  | 'ending'
  | 'finalized'
  | 'presented'
  | 'left';

export type RunCompleteSnapshot = {
  runId: number;
  score: number;
  previousBest: number;
  best: number;
  isNewRecord: boolean;
  sessionCoins: number;
  xpEarned: number;
  xpBreakdown: Record<string, unknown> | null;
  rating: { id: string; label?: string } | null;
  hasClaimableQuest: boolean;
  canClaimOnchain: boolean;
  claimState: RunClaimState;
};

type RunCompleteResult = Omit<RunCompleteSnapshot, 'runId' | 'claimState'>;
type RunCompletePatch = Partial<Omit<RunCompleteResult, 'score'>>;

const claimStateTransitions: Record<RunClaimState, readonly RunClaimState[]> = {
  idle: ['idle'],
  claiming: ['confirming', 'claimed', 'idle'],
  confirming: ['confirming', 'claimed', 'idle'],
  claimed: ['claimed'],
};

function cloneSnapshot(snapshot: RunCompleteSnapshot): RunCompleteSnapshot {
  return {
    ...snapshot,
    xpBreakdown: snapshot.xpBreakdown ? { ...snapshot.xpBreakdown } : null,
    rating: snapshot.rating ? { ...snapshot.rating } : null,
  };
}

export function createRunCompleteFlow() {
  let nextRunId = 0;
  let activeRunId: number | null = null;
  let phase: RunCompletePhase = 'idle';
  let snapshot: RunCompleteSnapshot | null = null;

  function beginRun(): number {
    nextRunId += 1;
    activeRunId = nextRunId;
    phase = 'playing';
    snapshot = null;
    return nextRunId;
  }

  function markEnding(runId: number): boolean {
    if (activeRunId !== runId || phase !== 'playing') return false;
    phase = 'ending';
    return true;
  }

  function resumeRun(runId: number): boolean {
    if (activeRunId !== runId || phase !== 'ending') return false;
    phase = 'playing';
    return true;
  }

  function finalizeRun(runId: number): boolean {
    if (activeRunId !== runId || phase !== 'ending') return false;
    phase = 'finalized';
    return true;
  }

  function presentRun(
    runId: number,
    result: RunCompleteResult,
  ): RunCompleteSnapshot | null {
    if (activeRunId !== runId || phase !== 'finalized' || snapshot) return null;

    snapshot = {
      runId,
      score: result.score,
      previousBest: result.previousBest,
      best: result.best,
      isNewRecord: result.isNewRecord,
      sessionCoins: result.sessionCoins,
      xpEarned: result.xpEarned,
      xpBreakdown: result.xpBreakdown ? { ...result.xpBreakdown } : null,
      rating: result.rating ? { ...result.rating } : null,
      hasClaimableQuest: result.hasClaimableQuest,
      canClaimOnchain: result.canClaimOnchain,
      claimState: 'idle',
    };
    phase = 'presented';
    return cloneSnapshot(snapshot);
  }

  function patchRun(
    runId: number,
    patch: RunCompletePatch,
  ): RunCompleteSnapshot | null {
    if (activeRunId !== runId || phase !== 'presented' || snapshot?.runId !== runId) {
      return null;
    }

    if (patch.previousBest !== undefined) snapshot.previousBest = patch.previousBest;
    if (patch.best !== undefined) snapshot.best = patch.best;
    if (patch.isNewRecord !== undefined) snapshot.isNewRecord = patch.isNewRecord;
    if (patch.sessionCoins !== undefined) snapshot.sessionCoins = patch.sessionCoins;
    if (patch.xpEarned !== undefined) snapshot.xpEarned = patch.xpEarned;
    if (patch.xpBreakdown !== undefined) {
      snapshot.xpBreakdown = patch.xpBreakdown ? { ...patch.xpBreakdown } : null;
    }
    if (patch.rating !== undefined) {
      snapshot.rating = patch.rating ? { ...patch.rating } : null;
    }
    if (patch.hasClaimableQuest !== undefined) {
      snapshot.hasClaimableQuest = patch.hasClaimableQuest;
    }
    if (patch.canClaimOnchain !== undefined) {
      snapshot.canClaimOnchain = patch.canClaimOnchain;
    }

    return cloneSnapshot(snapshot);
  }

  function beginClaim(runId: number, score: number): boolean {
    if (
      activeRunId !== runId
      || phase !== 'presented'
      || snapshot?.runId !== runId
      || snapshot.score !== score
      || !snapshot.canClaimOnchain
      || snapshot.claimState !== 'idle'
    ) {
      return false;
    }

    snapshot.claimState = 'claiming';
    return true;
  }

  function applyClaimState(
    runId: number,
    score: number,
    claimState: RunClaimState,
  ): RunCompleteSnapshot | null {
    if (
      activeRunId !== runId
      || phase !== 'presented'
      || snapshot?.runId !== runId
      || snapshot.score !== score
    ) {
      return null;
    }

    if (claimStateTransitions[snapshot.claimState].includes(claimState)) {
      snapshot.claimState = claimState;
    }
    return cloneSnapshot(snapshot);
  }

  function leaveRun(runId: number): boolean {
    if (activeRunId !== runId) return false;
    activeRunId = null;
    phase = 'left';
    snapshot = null;
    return true;
  }

  function isPresentedRun(runId: number): boolean {
    return activeRunId === runId && phase === 'presented' && snapshot?.runId === runId;
  }

  function getActiveRunId(): number | null {
    return activeRunId;
  }

  function getSnapshot(): RunCompleteSnapshot | null {
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  return {
    beginRun,
    markEnding,
    resumeRun,
    finalizeRun,
    presentRun,
    patchRun,
    beginClaim,
    applyClaimState,
    leaveRun,
    isPresentedRun,
    getActiveRunId,
    getSnapshot,
  };
}

export type RunCompleteFlow = ReturnType<typeof createRunCompleteFlow>;
