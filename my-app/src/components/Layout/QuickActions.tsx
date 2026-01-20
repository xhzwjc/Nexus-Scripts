'use client';

import React, { useEffect, useState } from 'react';
import { Play, Clock, Zap, ArrowRight, Terminal, FileCode, Settings, BookOpen } from 'lucide-react';
import type { ViewType, Script } from '@/lib/types';
import { allScripts } from '@/lib/config';
import { useI18n } from '@/lib/i18n';

interface QuickActionsProps {
    onNavigateToScript: (systemId: string, scriptId: string) => void;
    onNavigateToSystem: () => void;
    setCurrentView: (view: ViewType) => void;
    userKey: string;
}

interface RecentScript {
    systemId: string;
    scriptId: string;
    timestamp: number;
}

const RECENT_SCRIPTS_KEY_PREFIX = 'scripthub_recent_scripts_';
const MAX_RECENT = 3;

// 获取用户专属的 localStorage key
const getUserStorageKey = (userKey: string) => {
    // 使用 userKey 的简单 hash 作为键，避免密钥直接暴露
    const hash = userKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `${RECENT_SCRIPTS_KEY_PREFIX}${hash}`;
};

// 获取最近使用的脚本
const getRecentScripts = (userKey: string): RecentScript[] => {
    try {
        const saved = localStorage.getItem(getUserStorageKey(userKey));
        if (saved) {
            return JSON.parse(saved);
        }
    } catch {
        // ignore
    }
    return [];
};

// 保存最近使用的脚本（需要 userKey）
export const saveRecentScript = (userKey: string, systemId: string, scriptId: string) => {
    const storageKey = getUserStorageKey(userKey);
    const recent = getRecentScripts(userKey).filter(
        r => !(r.systemId === systemId && r.scriptId === scriptId)
    );
    recent.unshift({ systemId, scriptId, timestamp: Date.now() });
    localStorage.setItem(storageKey, JSON.stringify(recent.slice(0, MAX_RECENT)));
};


export const QuickActions: React.FC<QuickActionsProps> = ({
    onNavigateToScript,
    onNavigateToSystem,
    setCurrentView,
    userKey
}) => {
    const { t } = useI18n();
    const [recentScripts, setRecentScripts] = useState<RecentScript[]>([]);

    // Dynamic quickLinks using translations
    const quickLinks = [
        { id: 'devtools', label: t.quickActions.devTools, icon: <Terminal className="w-3.5 h-3.5" />, view: 'dev-tools' as ViewType },
        { id: 'ocr', label: t.quickActions.ocrTool, icon: <FileCode className="w-3.5 h-3.5" />, view: 'ocr-tool' as ViewType },
        { id: 'help', label: t.quickActions.helpDocs, icon: <BookOpen className="w-3.5 h-3.5" />, view: 'help' as ViewType },
    ];

    useEffect(() => {
        if (userKey) {
            setRecentScripts(getRecentScripts(userKey));
        }
    }, [userKey]);

    // 根据 scriptId 找到脚本信息
    const findScript = (systemId: string, scriptId: string): Script | undefined => {
        const system = allScripts[systemId];
        return system?.scripts.find(s => s.id === scriptId);
    };

    const hasRecent = recentScripts.length > 0;

    return (
        <div className="glass-card p-5 w-70 shrink-0 self-stretch flex flex-col">
            <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-teal-600" />
                <h3 className="font-semibold text-slate-700 text-sm">{t.quickActions.title}</h3>
            </div>

            {/* 最近使用区块 */}
            {hasRecent && (
                <div className="space-y-2 mb-4">
                    <p className="text-xs text-slate-400 mb-2">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {t.quickActions.recentUsed}
                    </p>
                    {recentScripts.map((recent) => {
                        const script = findScript(recent.systemId, recent.scriptId);
                        if (!script) return null;

                        // Helper for translation key mapping (same as in app.tsx)
                        const scriptIdToKey: Record<string, keyof typeof t.scriptConfig.items> = {
                            'settlement': 'settlement',
                            'commission': 'commission',
                            'balance': 'balance',
                            'task-automation': 'taskAutomation',
                            'sms_operations_center': 'smsOperationsCenter',
                            'tax-reporting': 'taxReporting',
                            'tax-calculation': 'taxCalculation',
                            'payment-stats': 'paymentStats',
                            'delivery-tool': 'deliveryTool',
                        };

                        const translatedName = scriptIdToKey[script.id] && t.scriptConfig.items[scriptIdToKey[script.id]]
                            ? t.scriptConfig.items[scriptIdToKey[script.id]].name
                            : script.name;

                        return (
                            <button
                                key={`${recent.systemId}-${recent.scriptId}`}
                                onClick={() => onNavigateToScript(recent.systemId, recent.scriptId)}
                                className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white/50 hover:bg-white/80 transition-all group text-left"
                            >
                                <div className="p-1.5 bg-teal-50 rounded-md text-teal-600">
                                    {script.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">{translatedName}</p>
                                </div>
                                <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-colors" />
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 快捷入口区块 */}
            <div className={`space-y-2 ${hasRecent ? 'pt-3 border-t border-slate-100' : ''}`}>
                <p className="text-xs text-slate-400 mb-2">
                    <Settings className="w-3 h-3 inline mr-1" />
                    {t.quickActions.quickEntry}
                </p>
                {quickLinks.map((link) => (
                    <button
                        key={link.id}
                        onClick={() => setCurrentView(link.view)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white/50 hover:bg-white/80 transition-all group text-left"
                    >
                        <div className="p-1.5 bg-slate-50 rounded-md text-slate-500 group-hover:text-teal-600 group-hover:bg-teal-50 transition-colors">
                            {link.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-600 group-hover:text-slate-700 truncate">{link.label}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-500 transition-colors" />
                    </button>
                ))}
            </div>

            {/* 底部：浏览更多 */}
            <div className="mt-auto pt-4 border-t border-slate-100">
                <button
                    onClick={onNavigateToSystem}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-medium hover:from-teal-600 hover:to-cyan-600 transition-all shadow-sm hover:shadow"
                >
                    {t.quickActions.browseAll}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
