import React, { useState, useMemo } from 'react';
import { ResourceGroup } from '@/lib/team-resources-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Lock, ArrowLeft, Settings, FolderOpen, Building2, Shield } from 'lucide-react';
import { SystemCard } from './SystemCard';
import { HealthCheckPanel } from './HealthCheckPanel';
import { useI18n } from '@/lib/i18n';

interface ResourceViewerProps {
    data: ResourceGroup[];
    onBack: () => void;
    onLock: () => void;
    onManage: () => void;
    isAdmin: boolean;
}

export function ResourceViewer({ data, onBack, onLock, onManage, isAdmin }: ResourceViewerProps) {
    const { t } = useI18n();
    const tr = t.teamResources;
    const [activeGroup, setActiveGroup] = useState<string>(data[0]?.id || '');
    const [searchQuery, setSearchQuery] = useState('');
    const [showHealthCheck, setShowHealthCheck] = useState(false);

    // 搜索过滤
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return data;

        const query = searchQuery.toLowerCase();
        return data.map(group => ({
            ...group,
            systems: group.systems.filter(sys =>
                sys.name.toLowerCase().includes(query) ||
                sys.description?.toLowerCase().includes(query) ||
                Object.values(sys.environments).some(env => env?.url.includes(query))
            )
        })).filter(group => group.systems.length > 0);
    }, [data, searchQuery]);

    const currentGroup = filteredGroups.find(g => g.id === activeGroup) || filteredGroups[0];

    // 集团图标颜色
    const groupColors: Record<string, string> = {
        chunmiao: 'text-green-600 bg-green-50',
        haoshi: 'text-orange-600 bg-orange-50',
        jiwei: 'text-blue-600 bg-blue-50',
        shujian: 'text-purple-600 bg-purple-50',
        tangren: 'text-red-600 bg-red-50',
    };

    return (
        <div className="flex h-full bg-[var(--page-bg)]">
            {/* 侧边栏 - 集团列表 */}
            <div className="w-64 bg-[var(--glass-bg)] border-r border-[var(--border-subtle)] flex flex-col pt-4 pb-4">
                <div className="px-4 mb-6 flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2 text-[var(--text-secondary)]">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <span className="font-bold text-[var(--text-primary)]">{tr.viewerTitle}</span>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setShowHealthCheck(true)} className="text-muted-foreground hover:text-green-600 dark:hover:text-green-400" title={tr.healthCheck}>
                            <Shield className="w-4 h-4" />
                        </Button>
                        {isAdmin && (
                            <Button variant="ghost" size="icon" onClick={onManage} className="text-muted-foreground hover:text-primary transition-colors" title={tr.manageResources}>
                                <Settings className="w-4 h-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={onLock} className="text-muted-foreground hover:text-destructive transition-colors" title={tr.lock}>
                            <Lock className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="px-4 mb-4">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-tertiary)]" />
                        <Input
                            placeholder={tr.searchPlaceholder}
                            className="pl-9 h-9 bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-primary)]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 space-y-1">
                    {data.map(group => (
                        <button
                            key={group.id}
                            onClick={() => setActiveGroup(group.id)}
                            className={`
                                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                                ${activeGroup === group.id
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }
                            `}
                        >
                            {group.logo ? (
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-0.5 flex-shrink-0 group-hover:from-blue-500/40 group-hover:to-purple-500/40 transition-all duration-300">
                                    <div className="w-full h-full rounded-[10px] bg-white overflow-hidden flex items-center justify-center relative">
                                        <div className="absolute inset-0 bg-muted animate-pulse" id={`skeleton-${group.id}`} />
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={group.logo}
                                            alt={group.name}
                                            loading="lazy"
                                            className="w-full h-full object-contain relative z-10 transition-opacity duration-300 opacity-0"
                                            onLoad={(e) => {
                                                const img = e.target as HTMLImageElement;
                                                img.classList.remove('opacity-0');
                                                const skeleton = document.getElementById(`skeleton-${group.id}`);
                                                if (skeleton) skeleton.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br p-0.5 flex-shrink-0 ${groupColors[group.id]?.replace('text-', 'from-').replace('bg-', 'to-') || 'from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900'} group-hover:shadow-sm transition-all duration-300`}>
                                    <div className="w-full h-full rounded-[10px] bg-card flex items-center justify-center text-muted-foreground">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 text-left">
                                <div>{group.name}</div>
                                <div className="text-xs text-muted-foreground font-normal">{group.systems.length} {tr.systems}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 主内容区 - 系统卡片网格 */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-6xl mx-auto">
                    {searchQuery && (
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-6">
                            &ldquo;{searchQuery}&rdquo;{tr.searchResults}
                        </h2>
                    )}

                    {!searchQuery && currentGroup && (
                        <div className="mb-8">
                            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">{currentGroup.name}</h1>
                            <p className="text-[var(--text-secondary)]">{tr.manageDescription.replace('{name}', currentGroup.name)}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {(searchQuery ? filteredGroups.flatMap(g => g.systems.map(s => ({ system: s, logo: g.logo }))) : (currentGroup?.systems || []).map(s => ({ system: s, logo: currentGroup?.logo }))).map(({ system, logo }) => (
                            <SystemCard key={system.id} system={system} groupLogo={logo} />
                        ))}

                        {filteredGroups.length === 0 && (
                            <div className="col-span-full text-center py-20 text-muted-foreground">
                                {tr.noSystems}
                            </div>
                        )}

                        {!searchQuery && currentGroup?.systems.length === 0 && (
                            <div className="col-span-full text-center py-20 text-muted-foreground">
                                <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                                <p>{tr.noSystemsInGroup}</p>
                                {isAdmin && (
                                    <Button variant="outline" className="mt-4" onClick={onManage}>
                                        {tr.addSystem}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Health Check Panel */}
            {
                showHealthCheck && (
                    <HealthCheckPanel
                        groups={data}
                        onClose={() => setShowHealthCheck(false)}
                    />
                )
            }
        </div >
    );
}
