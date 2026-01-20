'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ResourceGroup, Environment } from '@/lib/team-resources-data';
import {
    Shield,
    ShieldCheck,
    ShieldAlert,
    ShieldX,
    RefreshCw,
    X,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    ExternalLink
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// 单个环境的检测结果
interface EnvCheckResult {
    url: string;
    env: Environment;
    envLabel: string;
    accessible: boolean;
    responseTime: number;
    ssl: {
        valid: boolean;
        issuer?: string;
        validFrom?: string;
        validTo?: string;
        daysRemaining?: number;
        error?: string;
    } | null;
    error?: string;
    status: 'healthy' | 'warning' | 'danger' | 'unknown';
}

// 系统的完整检测结果
export interface SystemHealthResult {
    systemId: string;
    systemName: string;
    groupName: string;
    envResults: EnvCheckResult[];
    overallStatus: 'healthy' | 'warning' | 'danger' | 'unknown';
    checkedAt: string;
}

interface HealthCheckPanelProps {
    groups: ResourceGroup[];
    onClose: () => void;
}

const envLabels: Record<Environment, string> = {
    dev: '开发',
    test: '测试',
    prod: '生产'
};

// 根据单个环境检测结果判断状态
function getEnvStatus(result: Partial<EnvCheckResult>): 'healthy' | 'warning' | 'danger' | 'unknown' {
    if (!result.accessible) return 'danger';
    if (!result.ssl) return 'healthy';
    if (result.ssl.daysRemaining !== undefined && result.ssl.daysRemaining <= 0) return 'danger';
    if (result.ssl.daysRemaining !== undefined && result.ssl.daysRemaining <= 30) return 'warning';
    return 'healthy';
}

// 根据所有环境结果判断系统整体状态
function getOverallStatus(envResults: EnvCheckResult[]): 'healthy' | 'warning' | 'danger' | 'unknown' {
    if (envResults.some(r => r.status === 'danger')) return 'danger';
    if (envResults.some(r => r.status === 'warning')) return 'warning';
    if (envResults.every(r => r.status === 'healthy')) return 'healthy';
    return 'unknown';
}

// 状态配置
const statusConfig = {
    healthy: {
        icon: ShieldCheck,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
    },
    warning: {
        icon: ShieldAlert,
        color: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
    },
    danger: {
        icon: ShieldX,
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
    },
    unknown: {
        icon: Shield,
        color: 'text-slate-400',
        bg: 'bg-slate-50',
        border: 'border-slate-200',
    },
};

export function HealthCheckPanel({ groups, onClose }: HealthCheckPanelProps) {
    const { t } = useI18n();
    const tr = t.teamResources;
    const [results, setResults] = useState<Map<string, SystemHealthResult>>(new Map());
    const [isChecking, setIsChecking] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [showHealthy, setShowHealthy] = useState(false);

    // 收集所有需要检测的系统和环境
    const collectSystems = useCallback(() => {
        const systems: {
            systemId: string;
            systemName: string;
            groupName: string;
            envUrls: { env: Environment; url: string }[];
        }[] = [];

        for (const group of groups) {
            for (const system of group.systems) {
                const envUrls: { env: Environment; url: string }[] = [];

                // 收集所有有效的环境URL
                const envOrder: Environment[] = ['prod', 'test', 'dev'];
                for (const envKey of envOrder) {
                    const env = system.environments[envKey];
                    if (env?.url && env.url.trim() && env.url !== 'https://' && env.url !== 'example.com') {
                        envUrls.push({
                            env: envKey,
                            url: env.url.trim(),
                        });
                    }
                }

                if (envUrls.length > 0) {
                    systems.push({
                        systemId: system.id,
                        systemName: system.name,
                        groupName: group.name,
                        envUrls,
                    });
                }
            }
        }

        return systems;
    }, [groups]);

    // 检测单个URL
    const checkSingleUrl = async (url: string): Promise<{
        accessible: boolean;
        responseTime: number;
        ssl: EnvCheckResult['ssl'];
        error?: string;
    }> => {
        try {
            const response = await fetch('/api/health-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();
            return {
                accessible: data.accessible ?? false,
                responseTime: data.responseTime ?? 0,
                ssl: data.ssl ?? null,
                error: data.error,
            };
        } catch (error) {
            return {
                accessible: false,
                responseTime: 0,
                ssl: null,
                error: (error as Error).message,
            };
        }
    };

    // 开始批量检测
    const startCheck = async () => {
        const systems = collectSystems();
        if (systems.length === 0) return;

        // 计算总URL数量
        const totalUrls = systems.reduce((sum, s) => sum + s.envUrls.length, 0);

        setIsChecking(true);
        setProgress({ current: 0, total: totalUrls });
        setResults(new Map());

        let checkedCount = 0;

        // 逐个系统检测
        for (const system of systems) {
            const envResults: EnvCheckResult[] = [];

            // 检测该系统的所有环境
            for (const envUrl of system.envUrls) {
                const checkResult = await checkSingleUrl(envUrl.url);

                const envResult: EnvCheckResult = {
                    url: envUrl.url,
                    env: envUrl.env,
                    envLabel: tr['env' + envUrl.env.charAt(0).toUpperCase() + envUrl.env.slice(1) as keyof typeof tr] || envLabels[envUrl.env],
                    accessible: checkResult.accessible,
                    responseTime: checkResult.responseTime,
                    ssl: checkResult.ssl,
                    error: checkResult.error,
                    status: 'unknown',
                };
                envResult.status = getEnvStatus(envResult);
                envResults.push(envResult);

                checkedCount++;
                setProgress({ current: checkedCount, total: totalUrls });
            }

            // 更新系统结果
            const systemResult: SystemHealthResult = {
                systemId: system.systemId,
                systemName: system.systemName,
                groupName: system.groupName,
                envResults,
                overallStatus: getOverallStatus(envResults),
                checkedAt: new Date().toISOString(),
            };

            setResults(prev => new Map(prev).set(system.systemId, systemResult));
        }

        setIsChecking(false);
    };

    // 按状态分组结果
    const groupedResults = {
        danger: [] as SystemHealthResult[],
        warning: [] as SystemHealthResult[],
        healthy: [] as SystemHealthResult[],
    };

    results.forEach(result => {
        if (result.overallStatus === 'danger') groupedResults.danger.push(result);
        else if (result.overallStatus === 'warning') groupedResults.warning.push(result);
        else if (result.overallStatus === 'healthy') groupedResults.healthy.push(result);
    });

    const totalChecked = results.size;
    const systems = collectSystems();
    const totalUrls = systems.reduce((sum, s) => sum + s.envUrls.length, 0);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col bg-white">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Shield className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{tr.healthCheckTitle}</h2>
                            <p className="text-sm text-slate-500">{tr.healthCheckDesc}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Actions */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                            {tr.systemsCount.replace('{count}', String(systems.length))}
                            {tr.envsToCheck.replace('{count}', String(totalUrls))}
                        </div>
                        <Button
                            onClick={startCheck}
                            disabled={isChecking || systems.length === 0}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                            {isChecking ? tr.checking : tr.startCheck}
                        </Button>
                    </div>

                    {/* Progress */}
                    {isChecking && (
                        <div className="mt-4">
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                                <span>{tr.progressLabel}</span>
                                <span>{progress.current}/{progress.total}</span>
                            </div>
                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {totalChecked === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>{tr.clickToStart}</p>
                        </div>
                    ) : (
                        <>
                            {/* 危险 */}
                            {groupedResults.danger.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <ShieldX className="w-5 h-5 text-red-600" />
                                        <span className="font-semibold text-red-600">{tr.needAttention} ({groupedResults.danger.length})</span>
                                    </div>
                                    <div className="space-y-2">
                                        {groupedResults.danger.map(result => (
                                            <ResultItem key={result.systemId} result={result} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 警告 */}
                            {groupedResults.warning.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <ShieldAlert className="w-5 h-5 text-yellow-600" />
                                        <span className="font-semibold text-yellow-600">{tr.needFocus} ({groupedResults.warning.length})</span>
                                    </div>
                                    <div className="space-y-2">
                                        {groupedResults.warning.map(result => (
                                            <ResultItem key={result.systemId} result={result} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 正常 */}
                            {groupedResults.healthy.length > 0 && (
                                <div>
                                    <button
                                        className="flex items-center gap-2 mb-3 w-full text-left"
                                        onClick={() => setShowHealthy(!showHealthy)}
                                    >
                                        <ShieldCheck className="w-5 h-5 text-green-600" />
                                        <span className="font-semibold text-green-600">{tr.statusNormal} ({groupedResults.healthy.length})</span>
                                        {showHealthy ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    {showHealthy && (
                                        <div className="space-y-2">
                                            {groupedResults.healthy.map(result => (
                                                <ResultItem key={result.systemId} result={result} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Card>
        </div>
    );
}

// 单个系统结果项组件
function ResultItem({ result }: { result: SystemHealthResult }) {
    const config = statusConfig[result.overallStatus];
    const StatusIcon = config.icon;

    return (
        <div className={`p-4 rounded-lg border ${config.border} ${config.bg}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <StatusIcon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                    <div>
                        <div className="font-medium text-slate-800">{result.systemName}</div>
                        <div className="text-xs text-slate-500 mb-2">{result.groupName}</div>

                        {/* 显示所有环境URL */}
                        <div className="space-y-1">
                            {result.envResults.map((envResult, idx) => (
                                <EnvResultRow key={idx} envResult={envResult} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// 单个环境结果行
function EnvResultRow({ envResult }: { envResult: EnvCheckResult }) {
    const { t } = useI18n();
    const tr = t.teamResources;
    const envStatusColors = {
        healthy: 'text-green-600',
        warning: 'text-yellow-600',
        danger: 'text-red-600',
        unknown: 'text-slate-400',
    };

    const formatDays = (days?: number) => {
        if (days === undefined) return '';
        if (days <= 0) return `(${tr.expired})`;
        if (days <= 30) return `(${tr.expiresIn.replace('{days}', String(days))})`;
        return `(${tr.daysRemaining.replace('{days}', String(days))})`;
    };

    return (
        <div className="flex items-center gap-2 text-xs">
            <span className={`font-medium px-1.5 py-0.5 rounded ${envResult.env === 'prod' ? 'bg-red-100 text-red-700' :
                envResult.env === 'test' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                }`}>
                {envResult.envLabel}
            </span>
            <a
                href={envResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 hover:underline flex items-center gap-1"
            >
                <ExternalLink className="w-3 h-3" />
                {envResult.url.length > 45 ? envResult.url.slice(0, 45) + '...' : envResult.url}
            </a>
            <span className={`${envStatusColors[envResult.status]} font-medium`}>
                {envResult.accessible ? tr.accessible : tr.inaccessible}
                {formatDays(envResult.ssl?.daysRemaining)}
            </span>
            {envResult.error && (
                <span className="text-red-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {envResult.error}
                </span>
            )}
        </div>
    );
}

export default HealthCheckPanel;
