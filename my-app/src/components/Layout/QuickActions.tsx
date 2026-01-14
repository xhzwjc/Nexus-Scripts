'use client';

import React, { useEffect, useState } from 'react';
import { Play, Clock, Zap, ArrowRight } from 'lucide-react';
import type { ViewType, Script } from '@/lib/types';
import { allScripts } from '@/lib/config';

interface QuickActionsProps {
    onNavigateToScript: (systemId: string, scriptId: string) => void;
    onNavigateToSystem: () => void; // 浏览所有脚本
    setCurrentView: (view: ViewType) => void;
    userKey: string; // 用于区分不同用户
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
    const [recentScripts, setRecentScripts] = useState<RecentScript[]>([]);

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
                <h3 className="font-semibold text-slate-700 text-sm">快捷操作</h3>
            </div>

            {hasRecent ? (
                <div className="space-y-2">
                    <p className="text-xs text-slate-400 mb-2">
                        <Clock className="w-3 h-3 inline mr-1" />
                        最近使用
                    </p>
                    {recentScripts.map((recent) => {
                        const script = findScript(recent.systemId, recent.scriptId);
                        if (!script) return null;
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
                                    <p className="text-sm font-medium text-slate-700 truncate">{script.name}</p>
                                </div>
                                <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-colors" />
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-4 flex-1 flex flex-col justify-center">
                    <p className="text-xs text-slate-400 mb-3">暂无最近使用记录</p>
                    <button
                        onClick={onNavigateToSystem}
                        className="inline-flex items-center justify-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                        浏览所有脚本
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-100">
                <button
                    onClick={() => setCurrentView('help')}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                    查看帮助文档 →
                </button>
            </div>
        </div>
    );
};
