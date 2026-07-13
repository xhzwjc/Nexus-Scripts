'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch, getStoredScriptHubSession } from '@/lib/auth';
import { createRbacCacheScope, shouldApplyRbacResponse } from './accessControlPaging';

interface CacheEntry {
    value: unknown;
    storedAt: number;
}

interface ApiErrorPayload {
    error?: string;
}

class RbacQueryError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'RbacQueryError';
    }
}

interface RbacQueryResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    reload: () => void;
    setData: React.Dispatch<React.SetStateAction<T | null>>;
}

const CACHE_STALE_MS = 60_000;
const rbacMemoryCache = new Map<string, CacheEntry>();
let activePermissionScope = '';

function getPermissionScope() {
    const session = getStoredScriptHubSession();
    return createRbacCacheScope(session?.user.id, session?.user.permissionVersion);
}

function synchronizePermissionScope() {
    const nextScope = getPermissionScope();
    if (activePermissionScope && activePermissionScope !== nextScope) {
        rbacMemoryCache.clear();
    }
    activePermissionScope = nextScope;
    return nextScope;
}

function scopedCacheKey(path: string) {
    return `${synchronizePermissionScope()}:${path}`;
}

function readCachedValue<T>(path: string): T | null {
    const key = scopedCacheKey(path);
    const entry = rbacMemoryCache.get(key);
    if (!entry) {
        return null;
    }
    if (Date.now() - entry.storedAt > CACHE_STALE_MS) {
        rbacMemoryCache.delete(key);
        return null;
    }
    return entry.value as T;
}

function writeCachedValue<T>(path: string, value: T) {
    rbacMemoryCache.set(scopedCacheKey(path), {
        value,
        storedAt: Date.now(),
    });
}

function getApiError(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
        return '';
    }
    const error = (payload as ApiErrorPayload).error;
    return typeof error === 'string' ? error : '';
}

export function invalidateRbacCache(pathPrefix?: string) {
    const scopePrefix = `${synchronizePermissionScope()}:`;
    for (const key of rbacMemoryCache.keys()) {
        if (!key.startsWith(scopePrefix)) {
            continue;
        }
        if (!pathPrefix || key.slice(scopePrefix.length).startsWith(pathPrefix)) {
            rbacMemoryCache.delete(key);
        }
    }
}

export function useDebouncedValue<T>(value: T, delayMs: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
        return () => window.clearTimeout(timeoutId);
    }, [delayMs, value]);

    return debouncedValue;
}

export function useRbacQuery<T>(
    path: string,
    fallbackError: string,
    refreshToken = 0,
): RbacQueryResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [dataPath, setDataPath] = useState(path);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadVersion, setReloadVersion] = useState(0);
    const requestIdRef = useRef(0);

    const reload = useCallback(() => {
        invalidateRbacCache(path);
        setReloadVersion((current) => current + 1);
    }, [path]);

    useEffect(() => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const controller = new AbortController();
        const cached = readCachedValue<T>(path);

        setDataPath(path);
        setData(cached);
        setLoading(cached === null);
        setError(null);

        void authenticatedFetch(path, {
            cache: 'no-store',
            signal: controller.signal,
        }).then(async (response) => {
            const payload: unknown = await response.json().catch(() => null);
            const apiError = getApiError(payload);
            if (!response.ok || apiError) {
                throw new RbacQueryError(apiError || fallbackError, response.status);
            }
            if (!shouldApplyRbacResponse(requestIdRef.current, requestId, controller.signal.aborted)) {
                return;
            }
            const nextData = payload as T;
            writeCachedValue(path, nextData);
            setData(nextData);
        }).catch((requestError: unknown) => {
            if (!shouldApplyRbacResponse(requestIdRef.current, requestId, controller.signal.aborted)) {
                return;
            }
            if (requestError instanceof RbacQueryError && (requestError.status === 401 || requestError.status === 403)) {
                invalidateRbacCache();
                setData(null);
                setError(requestError.message);
                return;
            }
            if (cached === null) {
                setError(requestError instanceof Error ? requestError.message : fallbackError);
            }
        }).finally(() => {
            if (shouldApplyRbacResponse(requestIdRef.current, requestId, controller.signal.aborted)) {
                setLoading(false);
            }
        });

        return () => controller.abort();
    }, [fallbackError, path, refreshToken, reloadVersion]);

    const pathMatchesData = dataPath === path;
    return {
        data: pathMatchesData ? data : null,
        loading: !pathMatchesData || loading,
        error: pathMatchesData ? error : null,
        reload,
        setData,
    };
}
