import React, { useState, useMemo } from 'react';
import { ResourceGroup } from '@/lib/team-resources-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Lock, ArrowLeft, Settings, FolderOpen, Building2 } from 'lucide-react';
import { SystemCard } from './SystemCard';

interface ResourceViewerProps {
    data: ResourceGroup[];
    onBack: () => void;
    onLock: () => void;
    onManage: () => void;
    isAdmin: boolean;
}

export function ResourceViewer({ data, onBack, onLock, onManage, isAdmin }: ResourceViewerProps) {
    const [activeGroup, setActiveGroup] = useState<string>(data[0]?.id || '');
    const [searchQuery, setSearchQuery] = useState('');

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
        <div className="flex h-full bg-slate-50">
            {/* 侧边栏 - 集团列表 */}
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col pt-4 pb-4">
                <div className="px-4 mb-6 flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2 text-slate-500">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <span className="font-bold text-slate-800">团队资源</span>
                    <div className="flex gap-1">
                        {isAdmin && (
                            <Button variant="ghost" size="icon" onClick={onManage} className="text-slate-400 hover:text-blue-500" title="管理资源">
                                <Settings className="w-4 h-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={onLock} className="text-slate-400 hover:text-red-500" title="锁定">
                            <Lock className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="px-4 mb-4">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <Input
                            placeholder="搜索系统..."
                            className="pl-9 h-9 bg-slate-50 border-slate-200"
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
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }
                            `}
                        >
                            {group.logo ? (
                                <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-slate-200 flex-shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={group.logo}
                                        alt={group.name}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            ) : (
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${groupColors[group.id] || 'text-slate-600 bg-slate-100'}`}>
                                    <Building2 className="w-4 h-4" />
                                </div>
                            )}
                            <div className="flex-1 text-left">
                                <div>{group.name}</div>
                                <div className="text-xs text-slate-400 font-normal">{group.systems.length} 个系统</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 主内容区 - 系统卡片网格 */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-6xl mx-auto">
                    {searchQuery && (
                        <h2 className="text-lg font-semibold text-slate-800 mb-6">
                            &ldquo;{searchQuery}&rdquo; 的搜索结果
                        </h2>
                    )}

                    {!searchQuery && currentGroup && (
                        <div className="mb-8">
                            <h1 className="text-2xl font-bold text-slate-900 mb-2">{currentGroup.name}</h1>
                            <p className="text-slate-500">管理 {currentGroup.name} 下的系统环境及凭证信息</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {(searchQuery ? filteredGroups.flatMap(g => g.systems.map(s => ({ system: s, logo: g.logo }))) : (currentGroup?.systems || []).map(s => ({ system: s, logo: currentGroup?.logo }))).map(({ system, logo }) => (
                            <SystemCard key={system.id} system={system} groupLogo={logo} />
                        ))}

                        {filteredGroups.length === 0 && (
                            <div className="col-span-full text-center py-20 text-slate-400">
                                未找到匹配的系统。
                            </div>
                        )}

                        {!searchQuery && currentGroup?.systems.length === 0 && (
                            <div className="col-span-full text-center py-20 text-slate-400">
                                <FolderOpen className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                <p>该集团下暂无系统</p>
                                {isAdmin && (
                                    <Button variant="outline" className="mt-4" onClick={onManage}>
                                        添加系统
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
