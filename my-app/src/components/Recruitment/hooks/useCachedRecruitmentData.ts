"use client";

import { useRef, useCallback, useEffect } from 'react';

// 简单的深度比较函数 (替代 lodash/isEqual)
function shallowEqual<T>(a: T, b: T): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object' || a === null || b === null) return false;
    
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
        if (!(key in (b as object)) || (a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
            return false;
        }
    }
    return true;
}

function deepEqualArray<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!shallowEqual(a[i], b[i])) return false;
    }
    return true;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    version: number;
}

interface UseCachedDataOptions {
    ttl?: number; // 缓存有效期 (毫秒), 默认 30000ms
    maxSize?: number; // 最大缓存条目数, 默认 50
}

export function useCachedListData<T>(options: UseCachedDataOptions = {}) {
    const { ttl = 30000, maxSize = 50 } = options;
    
    // 使用 Map 存储缓存，支持 LRU 淘汰
    const cacheRef = useRef<Map<string, CacheEntry<T[]>>>(new Map());
    const versionRef = useRef(0);
    
    // 定期清理过期缓存
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const expiredKeys: string[] = [];
            
            cacheRef.current.forEach((entry, key) => {
                if (now - entry.timestamp > ttl) {
                    expiredKeys.push(key);
                }
            });
            
            expiredKeys.forEach(key => cacheRef.current.delete(key));
        }, Math.min(ttl, 60000)); // 最多每分钟清理一次
        
        return () => clearInterval(interval);
    }, [ttl]);
    
    const getCachedOrFetch = useCallback(async (
        key: string,
        fetcher: () => Promise<T[]>,
        options?: { force?: boolean; silent?: boolean }
    ): Promise<T[]> => {
        const cached = cacheRef.current.get(key);
        const now = Date.now();
        
        // 如果缓存有效且没有强制刷新，返回缓存数据
        if (!options?.force && cached && (now - cached.timestamp < ttl)) {
            return cached.data;
        }
        
        const fresh = await fetcher();
        
        // 只有当数据变化时才更新缓存
        if (!cached || !deepEqualArray(cached.data, fresh)) {
            // LRU: 如果缓存满了，删除最旧的条目
            if (cacheRef.current.size >= maxSize) {
                let oldestKey: string | null = null;
                let oldestTime = Infinity;
                
                cacheRef.current.forEach((entry, k) => {
                    if (entry.timestamp < oldestTime) {
                        oldestTime = entry.timestamp;
                        oldestKey = k;
                    }
                });
                
                if (oldestKey) {
                    cacheRef.current.delete(oldestKey);
                }
            }
            
            versionRef.current++;
            cacheRef.current.set(key, {
                data: fresh,
                timestamp: now,
                version: versionRef.current,
            });
        }
        
        return fresh;
    }, [ttl, maxSize]);
    
    const getCache = useCallback((key: string): T[] | undefined => {
        const cached = cacheRef.current.get(key);
        if (cached && (Date.now() - cached.timestamp < ttl)) {
            return cached.data;
        }
        return undefined;
    }, [ttl]);
    
    const invalidateCache = useCallback((key?: string) => {
        if (key) {
            cacheRef.current.delete(key);
        } else {
            cacheRef.current.clear();
            versionRef.current = 0;
        }
    }, []);
    
    const updateCacheEntry = useCallback((key: string, updater: (data: T[]) => T[]) => {
        const cached = cacheRef.current.get(key);
        if (cached) {
            const newData = updater(cached.data);
            cacheRef.current.set(key, {
                data: newData,
                timestamp: Date.now(),
                version: ++versionRef.current,
            });
        }
    }, []);
    
    const getCacheVersion = useCallback(() => versionRef.current, []);
    
    return {
        getCachedOrFetch,
        getCache,
        invalidateCache,
        updateCacheEntry,
        getCacheVersion,
    };
}

// 用于对象类型数据的缓存 hook
export function useCachedObjectData<T>(options: UseCachedDataOptions = {}) {
    const { ttl = 30000 } = options;
    const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
    
    const getCachedOrFetch = useCallback(async (
        key: string,
        fetcher: () => Promise<T>,
        options?: { force?: boolean }
    ): Promise<T> => {
        const cached = cacheRef.current.get(key);
        const now = Date.now();
        
        if (!options?.force && cached && (now - cached.timestamp < ttl)) {
            return cached.data;
        }
        
        const fresh = await fetcher();
        
        if (!cached || !shallowEqual(cached.data, fresh)) {
            cacheRef.current.set(key, {
                data: fresh,
                timestamp: now,
                version: Date.now(),
            });
        }
        
        return fresh;
    }, [ttl]);
    
    const invalidateCache = useCallback((key?: string) => {
        if (key) {
            cacheRef.current.delete(key);
        } else {
            cacheRef.current.clear();
        }
    }, []);
    
    return {
        getCachedOrFetch,
        invalidateCache,
    };
}
