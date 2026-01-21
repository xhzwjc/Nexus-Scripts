'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ResourceGroup, Environment, ENCRYPTION_KEY } from '@/lib/team-resources-data';
import CryptoJS from 'crypto-js';
import {
    ShieldAlert,
    ShieldX,
    RefreshCw,
    ExternalLink,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// ==================== 可配置常量 ====================
// 检测超时时间（毫秒），超过此时间视为异常中断
// 可手动修改此值进行测试，例如改为 10000 (10秒) 进行超时测试
const HEALTH_CHECK_TIMEOUT_MS = 60000; // 默认 1 分钟

interface EnvCheckResult {
    url: string;
    env: Environment;
    envLabel: string;
    systemName: string;
    groupName: string;
    daysRemaining?: number;
    error?: string;
    accessible: boolean;
}

export interface HealthCheckState {
    status: 'idle' | 'loading' | 'success' | 'error';
    totalEnvs: number;
    checkedEnvs: number;
    issues: EnvCheckResult[];
    healthPercent: number;
    lastChecked?: Date;
}

interface HeaderHealthIndicatorProps {
    hasPermission: boolean;
    userKey?: string;
    isFreshLogin?: boolean; // 标记是否是新登录（而不是浏览器刷新）
    onHealthChange?: (state: HealthCheckState) => void;
}

const envLabels: Record<Environment, string> = {
    dev: '开发',
    test: '测试',
    prod: '生产'
};

// 默认状态（用于无权限用户或重置）
const DEFAULT_STATE: HealthCheckState = {
    status: 'idle',
    totalEnvs: 0,
    checkedEnvs: 0,
    issues: [],
    healthPercent: 100,
};

export function HeaderHealthIndicator({ hasPermission, userKey, isFreshLogin, onHealthChange }: HeaderHealthIndicatorProps) {
    const { t } = useI18n();
    const tr = t.headerHealth;
    const [state, setState] = useState<HealthCheckState>(DEFAULT_STATE);
    const [groups, setGroups] = useState<ResourceGroup[]>([]);
    const [expanded, setExpanded] = useState(false);
    const isCheckingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 使用 sessionStorage 记录当前会话是否已运行过检测
    const SESSION_CHECK_KEY = 'health_check_ran';
    const SESSION_RESULT_KEY = 'health_check_result';

    const hasRunInSession = useCallback(() => {
        try {
            const data = sessionStorage.getItem(SESSION_CHECK_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                return parsed.userKey === userKey;
            }
        } catch {
            // ignore
        }
        return false;
    }, [userKey]);

    const markRunInSession = useCallback(() => {
        try {
            sessionStorage.setItem(SESSION_CHECK_KEY, JSON.stringify({ userKey, timestamp: Date.now() }));
        } catch {
            // ignore
        }
    }, [userKey]);

    // 保存检测结果到sessionStorage
    const saveResult = useCallback((result: HealthCheckState) => {
        try {
            sessionStorage.setItem(SESSION_RESULT_KEY, JSON.stringify({
                userKey,
                result: {
                    status: result.status,
                    totalEnvs: result.totalEnvs,
                    checkedEnvs: result.checkedEnvs,
                    healthPercent: result.healthPercent,
                    issues: result.issues,
                },
                timestamp: Date.now()
            }));
        } catch {
            // ignore
        }
    }, [userKey]);

    // 从sessionStorage恢复检测结果
    const restoreResult = useCallback((): HealthCheckState | null => {
        try {
            const data = sessionStorage.getItem(SESSION_RESULT_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.userKey === userKey && parsed.result) {
                    return {
                        ...parsed.result,
                        lastChecked: new Date(parsed.timestamp)
                    };
                }
            }
        } catch {
            // ignore
        }
        return null;
    }, [userKey]);

    const clearSessionCheck = useCallback(() => {
        try {
            sessionStorage.removeItem(SESSION_CHECK_KEY);
            sessionStorage.removeItem(SESSION_RESULT_KEY);
        } catch {
            // ignore
        }
    }, []);

    // 组件挂载时恢复检测结果（刷新页面时）
    useEffect(() => {
        if (hasPermission && userKey && hasRunInSession()) {
            // 已经运行过检测，恢复结果
            const savedResult = restoreResult();
            if (savedResult && savedResult.status === 'success') {
                setState(savedResult);
                onHealthChange?.(savedResult);
            }
        }
    }, [hasPermission, userKey, hasRunInSession, restoreResult, onHealthChange]);

    // 用户切换时重置状态
    useEffect(() => {
        if (!hasPermission) {
            // 无权限用户：重置为默认状态
            setState(DEFAULT_STATE);
            setGroups([]);
            setExpanded(false);
            clearSessionCheck();
            onHealthChange?.(DEFAULT_STATE);
            return;
        }
    }, [hasPermission, onHealthChange, clearSessionCheck]);

    // 加载团队资源数据
    useEffect(() => {
        if (!hasPermission) return;

        fetch('/api/resources/data')
            .then(res => res.json())
            .then(json => {
                if (json.encrypted) {
                    const bytes = CryptoJS.AES.decrypt(json.encrypted, ENCRYPTION_KEY);
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    if (decrypted) {
                        setGroups(JSON.parse(decrypted));
                    }
                }
            })
            .catch(() => { /* ignore */ });
    }, [hasPermission]);

    // 检测单个URL
    const checkSingleUrl = async (url: string, signal?: AbortSignal): Promise<{
        accessible: boolean;
        daysRemaining?: number;
        error?: string;
    }> => {
        try {
            const response = await fetch('/api/health-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                signal,
            });
            const data = await response.json();
            return {
                accessible: data.accessible ?? false,
                daysRemaining: data.ssl?.daysRemaining,
                error: data.error,
            };
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw error; // 让上层处理超时
            }
            return {
                accessible: false,
                error: (error as Error).message,
            };
        }
    };

    // 执行健康检测
    const runHealthCheck = useCallback(async () => {
        if (groups.length === 0 || isCheckingRef.current) return;

        // 取消之前的检测
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        abortControllerRef.current = new AbortController();
        isCheckingRef.current = true;

        // 设置超时
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
            timeoutRef.current = setTimeout(() => {
                resolve('timeout');
            }, HEALTH_CHECK_TIMEOUT_MS);
        });

        // 更新状态为loading，并通知父组件
        const loadingState: HealthCheckState = {
            ...state,
            status: 'loading',
            checkedEnvs: 0,
            issues: []
        };
        setState(loadingState);
        onHealthChange?.(loadingState);

        // 手动检测时清除之前的session记录
        clearSessionCheck();

        const foundIssues: EnvCheckResult[] = [];
        let totalEnvs = 0;
        let checkedCount = 0;

        // 收集所有环境
        const allEnvs: {
            url: string;
            env: Environment;
            systemName: string;
            groupName: string;
        }[] = [];

        for (const group of groups) {
            for (const system of group.systems) {
                const envOrder: Environment[] = ['prod', 'test', 'dev'];
                for (const envKey of envOrder) {
                    const env = system.environments[envKey];
                    if (env?.url && env.url.trim() && env.url !== 'https://' && env.url !== 'example.com') {
                        allEnvs.push({
                            url: env.url.trim(),
                            env: envKey,
                            systemName: system.name,
                            groupName: group.name,
                        });
                    }
                }
            }
        }

        totalEnvs = allEnvs.length;
        setState(prev => ({ ...prev, totalEnvs }));

        // 检测逻辑
        const doCheck = async (): Promise<'success' | 'error'> => {
            try {
                for (const envInfo of allEnvs) {
                    // 检查是否已超时或取消
                    if (abortControllerRef.current?.signal.aborted) {
                        throw new Error('Aborted');
                    }

                    const result = await checkSingleUrl(envInfo.url, abortControllerRef.current?.signal);
                    checkedCount++;

                    // 只检查过期和即将过期（30天内）
                    const hasIssue = !result.accessible ||
                        (result.daysRemaining !== undefined && result.daysRemaining <= 30);

                    if (hasIssue) {
                        foundIssues.push({
                            ...envInfo,
                            envLabel: envLabels[envInfo.env],
                            daysRemaining: result.daysRemaining,
                            error: result.error,
                            accessible: result.accessible,
                        });
                    }

                    setState(prev => ({ ...prev, checkedEnvs: checkedCount }));
                }

                return 'success';
            } catch {
                return 'error';
            }
        };

        try {
            const result = await Promise.race([doCheck(), timeoutPromise]);

            // 清除超时计时器
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            if (result === 'timeout') {
                // 超时处理
                abortControllerRef.current?.abort();
                const errorState: HealthCheckState = {
                    status: 'error',
                    totalEnvs,
                    checkedEnvs: checkedCount,
                    issues: [],
                    healthPercent: 100,
                };
                setState(errorState);
                onHealthChange?.(errorState);
            } else if (result === 'success') {
                // 成功完成
                const healthyCount = totalEnvs - foundIssues.length;
                const healthPercent = totalEnvs > 0 ? Math.round((healthyCount / totalEnvs) * 100) : 100;

                const newState: HealthCheckState = {
                    status: 'success',
                    totalEnvs,
                    checkedEnvs: checkedCount,
                    issues: foundIssues,
                    healthPercent,
                    lastChecked: new Date(),
                };

                setState(newState);
                saveResult(newState); // 保存结果到sessionStorage供刷新恢复
                onHealthChange?.(newState);
            } else {
                // 检测出错
                const errorState: HealthCheckState = {
                    status: 'error',
                    totalEnvs,
                    checkedEnvs: checkedCount,
                    issues: [],
                    healthPercent: 100,
                };
                setState(errorState);
                onHealthChange?.(errorState);
            }
        } catch {
            // 异常处理
            const errorState: HealthCheckState = {
                status: 'error',
                totalEnvs,
                checkedEnvs: checkedCount,
                issues: [],
                healthPercent: 100,
            };
            setState(errorState);
            onHealthChange?.(errorState);
        } finally {
            isCheckingRef.current = false;
            abortControllerRef.current = null;
        }
    }, [groups, onHealthChange, saveResult, state, clearSessionCheck]);

    // 只在首次登录时自动检测（不是浏览器刷新）
    // 自动检测逻辑
    useEffect(() => {
        // 前置条件：有权限 + 有资源数据 + 有用户 + 状态为空闲
        if (!hasPermission || groups.length === 0 || !userKey || state.status !== 'idle') {
            return;
        }

        // 1. 如果是新登录，强制重新检测（忽略之前的缓存）
        if (isFreshLogin) {
            runHealthCheck();
            return;
        }

        // 2. 尝试从 sessionStorage 恢复结果
        const restored = restoreResult();
        if (restored) {
            setState(restored);
            onHealthChange?.(restored);
            return;
        }

        // 3. 如果既不是新登录，也没有缓存结果（可能是首次加载，或者上次刷新时正在loading导致没有保存结果）
        // 此时应该触发检测，保证界面不会一直卡在骨架屏
        runHealthCheck();

    }, [hasPermission, groups.length, userKey, isFreshLogin, state.status, runHealthCheck, restoreResult, onHealthChange]);

    // 点击外部关闭详情
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setExpanded(false);
            }
        };

        if (expanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [expanded]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    if (!hasPermission) return null;

    const isLoading = state.status === 'loading';
    const isError = state.status === 'error';
    const hasIssues = state.status === 'success' && state.issues.length > 0;
    const expiredCount = state.issues.filter(i => i.daysRemaining !== undefined && i.daysRemaining <= 0).length;

    // 如果正在加载，显示进度
    if (isLoading) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-200 dark:border-blue-800">
                <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                <span className="text-xs text-blue-700 dark:text-blue-300">
                    {tr.checking} {state.checkedEnvs}/{state.totalEnvs}
                </span>
            </div>
        );
    }

    // 检测出错：显示重试按钮
    if (isError) {
        return (
            <button
                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-full border border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                onClick={runHealthCheck}
                title={tr.retryTooltip}
            >
                <ShieldAlert className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-xs text-yellow-700 dark:text-yellow-300">{tr.checkFailed}</span>
                <RefreshCw className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
            </button>
        );
    }

    // 如果有问题，显示问题指示器
    if (hasIssues) {
        return (
            <div className="relative" ref={containerRef}>
                <button
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors shrink-0 whitespace-nowrap ${expiredCount > 0
                        ? 'bg-destructive/10 border-destructive/20 hover:bg-destructive/20'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
                        }`}
                    onClick={() => setExpanded(!expanded)}
                >
                    {expiredCount > 0 ? (
                        <ShieldX className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                        <ShieldAlert className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                    )}
                    <span className={`text-xs font-medium ${expiredCount > 0 ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-300'
                        }`}>
                        {state.issues.length}{tr.issues}
                    </span>
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {/* 下拉详情 */}
                {expanded && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
                        <div className="p-3 border-b border-border flex items-center justify-between">
                            <span className="text-sm font-medium text-popover-foreground">{tr.certIssues}</span>
                            <button
                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded(false);
                                    runHealthCheck();
                                }}
                            >
                                <RefreshCw className="w-3 h-3" />
                                {tr.recheck}
                            </button>
                        </div>
                        <div className="p-2 space-y-1.5">
                            {state.issues.map((issue, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs p-2 bg-muted/50 hover:bg-muted rounded transition-colors">
                                    <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${issue.env === 'prod' ? 'bg-destructive/15 text-destructive' :
                                        issue.env === 'test' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                                            'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                        }`}>
                                        {issue.envLabel}
                                    </span>
                                    <span className="font-medium text-foreground truncate">{issue.systemName}</span>
                                    <a
                                        href={issue.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-auto text-primary hover:text-primary/80 transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className={`font-medium shrink-0 ${!issue.accessible ? 'text-destructive' :
                                        issue.daysRemaining !== undefined && issue.daysRemaining <= 0 ? 'text-destructive' :
                                            'text-yellow-600 dark:text-yellow-400'
                                        }`}>
                                        {!issue.accessible ? tr.inaccessible :
                                            issue.daysRemaining !== undefined && issue.daysRemaining <= 0 ? tr.expired :
                                                `${issue.daysRemaining}${tr.days}`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // 没有问题时不显示（不占空间）
    return null;
}

export default HeaderHealthIndicator;
