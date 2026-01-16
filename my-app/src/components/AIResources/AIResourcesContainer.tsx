'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Search, ExternalLink, Settings, ArrowLeft, Sparkles, X, Folder } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AIResource, AIResourcesData, INITIAL_AI_RESOURCES } from '@/lib/ai-resources-data';
import { AIResourceEditor } from '@/components/AIResources/AIResourceEditor';
import { toast } from 'sonner';

interface AIResourcesContainerProps {
    onBack: () => void;
    isAdmin?: boolean;
}

// 动态获取Lucide图标
const getIcon = (iconName: string) => {
    const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
    return icons[iconName] || Folder;
};

export function AIResourcesContainer({ onBack, isAdmin = false }: AIResourcesContainerProps) {
    const [data, setData] = useState<AIResourcesData>(INITIAL_AI_RESOURCES);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [isEditing, setIsEditing] = useState(false);
    const [logoCache, setLogoCache] = useState<Record<string, string>>({});

    // 加载数据和本地logo列表
    useEffect(() => {
        const loadAll = async () => {
            try {
                // 1. 加载资源数据
                const dataRes = await fetch('/api/ai-resources/data');
                const jsonData = await dataRes.json();
                setData(jsonData);

                // 2. 获取本地logo列表
                const logoListRes = await fetch('/api/ai-resources/logo-list');
                const logoListData = await logoListRes.json();
                setLogoCache(logoListData.logos || {});
            } catch (error) {
                console.error('Failed to load AI resources:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadAll();
    }, []);

    // 刷新logo列表（用于上传后刷新）
    const refreshLogos = async () => {
        try {
            const logoListRes = await fetch('/api/ai-resources/logo-list');
            const logoListData = await logoListRes.json();
            setLogoCache(logoListData.logos || {});
        } catch {
            // ignore
        }
    };

    // 获取logo路径（只从本地缓存获取）
    const getLogo = (resource: AIResource): string | null => {
        return logoCache[resource.id] || null;
    };


    // 搜索过滤
    const filteredResources = useMemo(() => {
        let resources = data.resources;

        // 分类过滤
        if (activeCategory !== 'all') {
            resources = resources.filter(r => r.category === activeCategory);
        }

        // 搜索过滤
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            resources = resources.filter(r =>
                r.name.toLowerCase().includes(query) ||
                r.description.toLowerCase().includes(query) ||
                r.tags?.some(t => t.toLowerCase().includes(query))
            );
        }

        // 按order排序
        return resources.sort((a, b) => (a.order || 99) - (b.order || 99));
    }, [data.resources, activeCategory, searchQuery]);

    // 按分类分组资源
    const groupedResources = useMemo(() => {
        if (activeCategory !== 'all') {
            return { [activeCategory]: filteredResources };
        }

        const groups: Record<string, AIResource[]> = {};
        for (const resource of filteredResources) {
            if (!groups[resource.category]) {
                groups[resource.category] = [];
            }
            groups[resource.category].push(resource);
        }
        return groups;
    }, [filteredResources, activeCategory]);

    // 保存数据
    const handleSave = async (updatedData: AIResourcesData) => {
        try {
            const res = await fetch('/api/ai-resources/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });

            if (res.ok) {
                setData(updatedData);
                setIsEditing(false);
                toast.success('保存成功');
            } else {
                toast.error('保存失败');
            }
        } catch {
            toast.error('保存失败');
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-slate-500">加载中...</div>
            </div>
        );
    }

    if (isEditing) {
        return (
            <AIResourceEditor
                data={data}
                onCancel={() => setIsEditing(false)}
                onSave={handleSave}
            />
        );
    }

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
            {/* 顶部导航栏 */}
            <div className="flex-shrink-0 bg-white/80 backdrop-blur-sm border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-500">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-blue-500" />
                            <h1 className="text-xl font-bold text-slate-800">AI资源导航</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* 搜索框 */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="搜索工具..."
                                className="pl-9 w-64 bg-white"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* 管理按钮 */}
                        {isAdmin && (
                            <Button variant="outline" onClick={() => setIsEditing(true)} className="gap-2">
                                <Settings className="w-4 h-4" />
                                管理
                            </Button>
                        )}
                    </div>
                </div>

                {/* 分类标签 */}
                <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2">
                    <button
                        onClick={() => setActiveCategory('all')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === 'all'
                            ? 'bg-blue-500 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        全部
                    </button>
                    {data.categories.sort((a, b) => a.order - b.order).map(cat => {
                        const Icon = getIcon(cat.icon);
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeCategory === cat.id
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {cat.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 资源网格 */}
            <div className="flex-1 overflow-y-auto p-6">
                {Object.keys(groupedResources).length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        没有找到匹配的资源
                    </div>
                ) : (
                    <div className="space-y-8">
                        {data.categories
                            .filter(cat => groupedResources[cat.id]?.length > 0)
                            .sort((a, b) => a.order - b.order)
                            .map(cat => {
                                const Icon = getIcon(cat.icon);
                                return (
                                    <div key={cat.id}>
                                        {activeCategory === 'all' && (
                                            <div className="flex items-center gap-2 mb-4">
                                                <Icon className="w-5 h-5 text-slate-600" />
                                                <h2 className="text-lg font-semibold text-slate-800">{cat.name}</h2>
                                                <span className="text-sm text-slate-400">
                                                    ({groupedResources[cat.id].length})
                                                </span>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {groupedResources[cat.id].map(resource => (
                                                <ResourceCard
                                                    key={resource.id}
                                                    resource={resource}
                                                    logo={getLogo(resource)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>
        </div>
    );
}

// 资源卡片组件
function ResourceCard({ resource, logo }: { resource: AIResource; logo: string | null }) {
    const [imgError, setImgError] = useState(false);

    // 当logo变化时重置错误状态
    useEffect(() => {
        if (logo) {
            setImgError(false);
        }
    }, [logo]);

    const handleClick = () => {
        window.open(resource.url, '_blank', 'noopener,noreferrer');
    };

    // 渲染logo内容
    const renderLogo = () => {
        // 有logo且没有错误
        if (logo && !imgError) {
            return (
                <Image
                    src={logo}
                    alt={resource.name}
                    width={32}
                    height={32}
                    className="object-contain"
                    onError={() => setImgError(true)}
                    unoptimized
                />
            );
        }
        // 默认图标
        return <Sparkles className="w-6 h-6 text-blue-400" />;
    };

    return (
        <button
            onClick={handleClick}
            className="group flex items-start gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100/50 transition-all duration-200 text-left w-full"
        >
            {/* Logo */}
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center overflow-hidden relative">
                {renderLogo()}
            </div>

            {/* 内容 */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                        {resource.name}
                    </h3>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                    {resource.description}
                </p>
                {resource.tags && resource.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {resource.tags.slice(0, 3).map(tag => (
                            <span
                                key={tag}
                                className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded-full"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </button>
    );
}
