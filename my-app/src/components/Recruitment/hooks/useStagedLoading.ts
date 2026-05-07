"use client";

import { useState, useCallback, useRef, useEffect } from 'react';

interface LoadingStage {
    name: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    loader: () => Promise<void>;
}

interface StagedLoadingState {
    isBootstrapping: boolean;
    criticalLoaded: boolean;
    highPriorityLoaded: boolean;
    mediumPriorityLoaded: boolean;
    lowPriorityLoaded: boolean;
    currentStage: string | null;
    errors: Map<string, Error>;
}

interface UseStagedLoadingOptions {
    onCriticalLoaded?: () => void;
    onAllLoaded?: () => void;
    onError?: (stage: string, error: Error) => void;
}

export function useStagedLoading(
    stages: LoadingStage[],
    options: UseStagedLoadingOptions = {}
) {
    const { onCriticalLoaded, onAllLoaded, onError } = options;
    
    const [state, setState] = useState<StagedLoadingState>({
        isBootstrapping: true,
        criticalLoaded: false,
        highPriorityLoaded: false,
        mediumPriorityLoaded: false,
        lowPriorityLoaded: false,
        currentStage: null,
        errors: new Map(),
    });
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const isRunningRef = useRef(false);
    
    // 取消所有正在进行的加载
    const cancelLoading = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        isRunningRef.current = false;
    }, []);
    
    // 执行分阶段加载
    const startLoading = useCallback(async () => {
        if (isRunningRef.current) {
            return;
        }
        
        isRunningRef.current = true;
        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;
        
        const prioritizedStages = {
            critical: stages.filter(s => s.priority === 'critical'),
            high: stages.filter(s => s.priority === 'high'),
            medium: stages.filter(s => s.priority === 'medium'),
            low: stages.filter(s => s.priority === 'low'),
        };
        
        const errors = new Map<string, Error>();
        
        try {
            // 阶段 1: 关键数据 (阻塞渲染)
            setState(prev => ({ ...prev, currentStage: 'critical' }));
            await Promise.all(
                prioritizedStages.critical.map(async (stage) => {
                    if (signal.aborted) return;
                    try {
                        await stage.loader();
                    } catch (error) {
                        errors.set(stage.name, error as Error);
                        onError?.(stage.name, error as Error);
                    }
                })
            );
            
            if (signal.aborted) return;
            
            setState(prev => ({
                ...prev,
                criticalLoaded: true,
                isBootstrapping: false,
                currentStage: 'high',
            }));
            onCriticalLoaded?.();
            
            // 阶段 2: 高优先级数据 (后台加载)
            await Promise.all(
                prioritizedStages.high.map(async (stage) => {
                    if (signal.aborted) return;
                    try {
                        await stage.loader();
                    } catch (error) {
                        errors.set(stage.name, error as Error);
                        onError?.(stage.name, error as Error);
                    }
                })
            );
            
            if (signal.aborted) return;
            
            setState(prev => ({
                ...prev,
                highPriorityLoaded: true,
                currentStage: 'medium',
            }));
            
            // 阶段 3: 中优先级数据 (延迟加载)
            await Promise.all(
                prioritizedStages.medium.map(async (stage) => {
                    if (signal.aborted) return;
                    try {
                        await stage.loader();
                    } catch (error) {
                        errors.set(stage.name, error as Error);
                        onError?.(stage.name, error as Error);
                    }
                })
            );
            
            if (signal.aborted) return;
            
            setState(prev => ({
                ...prev,
                mediumPriorityLoaded: true,
                currentStage: 'low',
            }));
            
            // 阶段 4: 低优先级数据 (空闲时加载)
            if ('requestIdleCallback' in window) {
                await new Promise<void>(resolve => {
                    window.requestIdleCallback(async () => {
                        await Promise.all(
                            prioritizedStages.low.map(async (stage) => {
                                if (signal.aborted) return;
                                try {
                                    await stage.loader();
                                } catch (error) {
                                    errors.set(stage.name, error as Error);
                                    onError?.(stage.name, error as Error);
                                }
                            })
                        );
                        resolve();
                    }, { timeout: 2000 });
                });
            } else {
                // 降级方案
                await new Promise(resolve => setTimeout(resolve, 100));
                await Promise.all(
                    prioritizedStages.low.map(async (stage) => {
                        if (signal.aborted) return;
                        try {
                            await stage.loader();
                        } catch (error) {
                            errors.set(stage.name, error as Error);
                            onError?.(stage.name, error as Error);
                        }
                    })
                );
            }
            
            if (signal.aborted) return;
            
            setState(prev => ({
                ...prev,
                lowPriorityLoaded: true,
                currentStage: null,
                errors,
            }));
            
            onAllLoaded?.();
            
        } finally {
            isRunningRef.current = false;
            abortControllerRef.current = null;
        }
    }, [stages, onCriticalLoaded, onAllLoaded, onError]);
    
    // 清理
    useEffect(() => {
        return () => {
            cancelLoading();
        };
    }, [cancelLoading]);
    
    return {
        ...state,
        startLoading,
        cancelLoading,
        retry: () => {
            setState({
                isBootstrapping: true,
                criticalLoaded: false,
                highPriorityLoaded: false,
                mediumPriorityLoaded: false,
                lowPriorityLoaded: false,
                currentStage: null,
                errors: new Map(),
            });
            startLoading();
        },
    };
}

// 用于单个资源的懒加载
export function useLazyLoad<T>(
    loader: () => Promise<T>,
    options?: {
        enabled?: boolean;
        delay?: number;
    }
) {
    const { enabled = true, delay = 0 } = options || {};
    
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const hasLoadedRef = useRef(false);
    
    const load = useCallback(async () => {
        if (hasLoadedRef.current || isLoading) {
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            const result = await loader();
            setData(result);
            hasLoadedRef.current = true;
        } catch (err) {
            setError(err as Error);
        } finally {
            setIsLoading(false);
        }
    }, [loader, delay, isLoading]);
    
    useEffect(() => {
        if (enabled) {
            load();
        }
    }, [enabled, load]);
    
    return {
        data,
        isLoading,
        error,
        reload: () => {
            hasLoadedRef.current = false;
            load();
        },
    };
}

// 用于分页数据的增量加载
export function useIncrementalLoad<T>(
    fetcher: (page: number, limit: number) => Promise<{ data: T[]; hasMore: boolean }>,
    options?: {
        initialLimit?: number;
        incrementLimit?: number;
    }
) {
    const { initialLimit = 50, incrementLimit = 50 } = options || {};
    
    const [items, setItems] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const pageRef = useRef(1);
    
    const loadMore = useCallback(async () => {
        if (isLoading || !hasMore) {
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            const limit = pageRef.current === 1 ? initialLimit : incrementLimit;
            const { data, hasMore: moreAvailable } = await fetcher(pageRef.current, limit);
            
            setItems(prev => [...prev, ...data]);
            setHasMore(moreAvailable);
            pageRef.current++;
        } catch (err) {
            setError(err as Error);
        } finally {
            setIsLoading(false);
        }
    }, [fetcher, initialLimit, incrementLimit, isLoading, hasMore]);
    
    const reset = useCallback(() => {
        setItems([]);
        setHasMore(true);
        setError(null);
        pageRef.current = 1;
    }, []);
    
    return {
        items,
        isLoading,
        hasMore,
        error,
        loadMore,
        reset,
    };
}
