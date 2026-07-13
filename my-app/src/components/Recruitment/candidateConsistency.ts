export type CandidateConsistencyPollingInput = {
    candidatePageActive: boolean;
    pageVisible: boolean;
    candidatesLoaded: boolean;
    hasVisibleLiveTask: boolean;
    hasActiveBatchTask: boolean;
    runningCandidateCount: number;
    runningCountConfirmedUntil: number;
    pollUntil: number;
    now: number;
};

export function shouldPollCandidateListForConsistency({
    candidatePageActive,
    pageVisible,
    candidatesLoaded,
    hasVisibleLiveTask,
    hasActiveBatchTask,
    runningCandidateCount,
    runningCountConfirmedUntil,
    pollUntil,
    now,
}: CandidateConsistencyPollingInput) {
    if (!candidatePageActive || !pageVisible || !candidatesLoaded) {
        return false;
    }
    return hasVisibleLiveTask
        || hasActiveBatchTask
        || (runningCandidateCount > 0 && runningCountConfirmedUntil > now)
        || pollUntil > now;
}

export function resolveCandidateConsistencyPollIntervalMs(
    input: CandidateConsistencyPollingInput,
    intervals: {fast: number; idle: number},
) {
    if (!input.candidatePageActive || !input.pageVisible || !input.candidatesLoaded) {
        return null;
    }
    return shouldPollCandidateListForConsistency(input) ? intervals.fast : intervals.idle;
}

export function coalesceCandidatePatchesById<T extends {id?: number | null}>(patches: readonly T[]) {
    const patchesByCandidateId = new Map<number, T & {id: number}>();
    patches.forEach((patch) => {
        const candidateId = Number(patch.id);
        if (!Number.isFinite(candidateId)) {
            return;
        }
        const current = patchesByCandidateId.get(candidateId);
        patchesByCandidateId.set(candidateId, {
            ...current,
            ...patch,
            id: candidateId,
        } as T & {id: number});
    });
    return patchesByCandidateId;
}
