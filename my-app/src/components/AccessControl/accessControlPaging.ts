export const RBAC_DEFAULT_PAGE_SIZE = 50;
export const RBAC_MAX_PAGE_SIZE = 100;

export function normalizeRbacPage(value: number) {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

export function normalizeRbacPageSize(value: number, fallback = RBAC_DEFAULT_PAGE_SIZE) {
    if (!Number.isFinite(value) || value < 1) {
        return fallback;
    }
    return Math.min(RBAC_MAX_PAGE_SIZE, Math.floor(value));
}

export function createRbacCacheScope(userCode: string | undefined, permissionVersion: number | undefined) {
    return `${userCode || 'anonymous'}:${permissionVersion ?? 0}`;
}

export function shouldApplyRbacResponse(activeRequestId: number, requestId: number, aborted: boolean) {
    return activeRequestId === requestId && !aborted;
}
