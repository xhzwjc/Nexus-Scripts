'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Search, Settings, ArrowLeft, X, Download, ChevronRight } from 'lucide-react';
import { AIResource, AIResourcesData, INITIAL_AI_RESOURCES } from '@/lib/ai-resources-data';
import { AIResourceEditor } from '@/components/AIResources/AIResourceEditor';
import { toast } from 'sonner';

interface AIResourcesContainerProps {
    onBack: () => void;
    isAdmin?: boolean;
}

export function AIResourcesContainer({ onBack, isAdmin = false }: AIResourcesContainerProps) {
    const [data, setData] = useState<AIResourcesData>(INITIAL_AI_RESOURCES);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [isEditing, setIsEditing] = useState(false);
    const [logoCache, setLogoCache] = useState<Record<string, string>>({});
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

    // 加载数据和本地logo列表
    useEffect(() => {
        const loadAll = async () => {
            try {
                const dataRes = await fetch('/api/ai-resources/data');
                if (dataRes.ok) {
                    const jsonData = await dataRes.json();
                    if (jsonData && Array.isArray(jsonData.categories) && Array.isArray(jsonData.resources)) {
                        setData(jsonData);
                    }
                }

                const logoListRes = await fetch('/api/ai-resources/logo-list');
                if (logoListRes.ok) {
                    const logoListData = await logoListRes.json();
                    setLogoCache(logoListData.logos || {});
                }
            } catch (error) {
                console.error('Failed to load AI resources:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadAll();
    }, []);

    const refreshLogos = async () => {
        try {
            const logoListRes = await fetch('/api/ai-resources/logo-list');
            const logoListData = await logoListRes.json();
            setLogoCache(logoListData.logos || {});
        } catch {
            // ignore
        }
    };

    const downloadMissingLogos = async () => {
        if (isDownloading) return;

        const missingLogos = data.resources.filter(r => r.logoUrl && !logoCache[r.id]);

        if (missingLogos.length === 0) {
            toast.info('所有图标已存在');
            return;
        }

        setIsDownloading(true);
        setDownloadProgress({ current: 0, total: missingLogos.length });

        let successCount = 0;
        let failCount = 0;
        let completed = 0;

        // 并行下载，每批10个
        const BATCH_SIZE = 10;

        const downloadOne = async (resource: AIResource) => {
            try {
                const res = await fetch('/api/ai-resources/logo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: resource.id, logoUrl: resource.logoUrl, siteUrl: resource.url })
                });
                const result = await res.json();

                if (result.success && result.path) {
                    setLogoCache(prev => ({ ...prev, [resource.id]: result.path }));
                    successCount++;
                } else {
                    failCount++;
                }
            } catch {
                failCount++;
            }
            completed++;
            setDownloadProgress({ current: completed, total: missingLogos.length });
        };

        // 分批并行下载
        for (let i = 0; i < missingLogos.length; i += BATCH_SIZE) {
            const batch = missingLogos.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(downloadOne));
        }

        setIsDownloading(false);
        toast.success(`完成：${successCount} 成功，${failCount} 失败`);
        await refreshLogos();
    };

    const getLogo = (resource: AIResource): string | null => {
        return logoCache[resource.id] || null;
    };

    const filteredResources = useMemo(() => {
        let resources = data.resources;

        if (activeCategory !== 'all') {
            resources = resources.filter(r => r.category === activeCategory);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            resources = resources.filter(r =>
                r.name.toLowerCase().includes(query) ||
                r.description.toLowerCase().includes(query) ||
                r.tags?.some(t => t.toLowerCase().includes(query))
            );
        }

        return resources.sort((a, b) => (a.order || 99) - (b.order || 99));
    }, [data.resources, activeCategory, searchQuery]);

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
                toast.success('已保存');
            } else {
                toast.error('保存失败');
            }
        } catch {
            toast.error('保存失败');
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-[#f5f5f7]">
                <div className="text-neutral-400 text-sm">加载中...</div>
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
        <div className="h-full flex flex-col bg-[#f5f5f7]">
            {/* 顶部导航栏 - iOS 26 毛玻璃风格 */}
            <div className="flex-shrink-0 bg-white/60 backdrop-blur-xl border-b border-black/5 px-5 py-3">
                <div className="flex items-center justify-between">
                    {/* 左侧：返回 + 标题 */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-800 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="text-sm">返回</span>
                        </button>
                        <div className="w-px h-4 bg-neutral-200" />
                        <h1 className="text-base font-semibold text-neutral-800">AI 工具库</h1>
                    </div>

                    {/* 右侧：搜索 + 管理 */}
                    <div className="flex items-center gap-3">
                        {/* 搜索框 - 极简胶囊样式 */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="搜索..."
                                className="pl-9 pr-8 w-56 h-8 bg-neutral-100/80 border-0 rounded-lg text-sm 
                                         placeholder:text-neutral-400 focus:outline-none focus:bg-white 
                                         focus:ring-1 focus:ring-neutral-200 transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* 管理按钮 - 仅管理员可见 */}
                        {isAdmin && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={downloadMissingLogos}
                                    disabled={isDownloading}
                                    className="flex items-center gap-1.5 px-3 h-8 text-sm text-neutral-600 
                                             hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors
                                             disabled:opacity-50"
                                >
                                    {isDownloading ? (
                                        <>
                                            <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                                            <span>{downloadProgress.current}/{downloadProgress.total}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-3.5 h-3.5" />
                                            <span>图标</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-1.5 px-3 h-8 text-sm text-neutral-600 
                                             hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                    <span>管理</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 分类标签 - 极简风格 */}
                <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1 scrollbar-none">
                    <button
                        onClick={() => setActiveCategory('all')}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${activeCategory === 'all'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100'
                            }`}
                    >
                        全部
                    </button>
                    {data.categories.sort((a, b) => a.order - b.order).map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${activeCategory === cat.id
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100'
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* 资源网格 */}
            <div className="flex-1 overflow-y-auto p-5">
                {Object.keys(groupedResources).length === 0 ? (
                    <div className="text-center py-16 text-neutral-400 text-sm">
                        没有找到匹配的工具
                    </div>
                ) : (
                    <div className="space-y-6">
                        {data.categories
                            .filter(cat => groupedResources[cat.id]?.length > 0)
                            .sort((a, b) => a.order - b.order)
                            .map(cat => (
                                <div key={cat.id}>
                                    {/* 分类标题 - 极简小号 */}
                                    {activeCategory === 'all' && (
                                        <h2 className="text-[12px] font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
                                            {cat.name} · {groupedResources[cat.id].length}
                                        </h2>
                                    )}

                                    {/* 卡片网格 */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                                        {groupedResources[cat.id].map(resource => (
                                            <ResourceCard
                                                key={resource.id}
                                                resource={resource}
                                                logo={getLogo(resource)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// 资源卡片组件 - iOS 26 毛玻璃风格
function ResourceCard({ resource, logo }: { resource: AIResource; logo: string | null }) {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        if (logo) {
            setImgError(false);
        }
    }, [logo]);

    const handleClick = () => {
        window.open(resource.url, '_blank', 'noopener,noreferrer');
    };

    const renderLogo = () => {
        if (logo && !imgError) {
            return (
                <Image
                    src={logo}
                    alt={resource.name}
                    width={28}
                    height={28}
                    className="object-contain"
                    onError={() => setImgError(true)}
                    unoptimized
                />
            );
        }
        // 默认使用首字母
        return (
            <span className="text-sm font-medium text-neutral-400">
                {resource.name.charAt(0).toUpperCase()}
            </span>
        );
    };

    return (
        <button
            onClick={handleClick}
            className="group flex items-center gap-3 p-3 bg-white/70 backdrop-blur-sm rounded-xl 
                     border border-black/5 hover:bg-white hover:shadow-sm 
                     transition-all duration-150 text-left w-full"
        >
            {/* Logo */}
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center overflow-hidden">
                {renderLogo()}
            </div>

            {/* 内容 */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <h3 className="text-[15px] font-medium text-neutral-800 truncate group-hover:text-neutral-600 transition-colors">
                        {resource.name}
                    </h3>
                    <ChevronRight className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <p className="text-[13px] text-neutral-400 mt-0.5 truncate">
                    {resource.description}
                </p>
                {/* Tags - 极简风格 */}
                {resource.tags && resource.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
                        {resource.tags.slice(0, 2).map(tag => (
                            <span
                                key={tag}
                                className="px-1.5 py-0.5 text-[11px] bg-neutral-100 text-neutral-400 rounded"
                            >
                                {tag}
                            </span>
                        ))}
                        {resource.tags.length > 2 && (
                            <span className="text-[11px] text-neutral-300">+{resource.tags.length - 2}</span>
                        )}
                    </div>
                )}
            </div>
        </button>
    );
}
