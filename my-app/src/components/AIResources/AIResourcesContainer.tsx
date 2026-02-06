'use client';

import { useState, useEffect, useMemo, memo, useDeferredValue, useCallback } from 'react';
import Image from 'next/image';
import { Search, Settings, ArrowLeft, X, Download, ChevronRight } from 'lucide-react';
import type { AIResource, AIResourcesData } from '@/lib/ai-resources-data';
import { AIResourceEditor } from '@/components/AIResources/AIResourceEditor';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

interface AIResourcesContainerProps {
    onBack: () => void;
    isAdmin?: boolean;
}

// 空的初始状态，数据通过 API 加载
const EMPTY_DATA: AIResourcesData = {
    categories: [],
    resources: []
};

export function AIResourcesContainer({ onBack }: AIResourcesContainerProps) {
    const { t } = useI18n();
    const tr = t.aiResources;

    // 数据状态
    const [data, setData] = useState<AIResourcesData>(EMPTY_DATA);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // UI 状态
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [isEditing, setIsEditing] = useState(false);
    const [logoCache, setLogoCache] = useState<Record<string, string>>({});
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
    const [isSaving, setIsSaving] = useState(false);

    const deferredSearchQuery = useDeferredValue(searchQuery);

    // 用户权限状态
    const [currentUserKey, setCurrentUserKey] = useState<string | null>(null);

    useEffect(() => {
        try {
            const authStr = localStorage.getItem('scriptHubAuth');
            if (authStr) {
                const authData = JSON.parse(authStr);
                if (authData && authData.key) {
                    setCurrentUserKey(authData.key);
                }
            }
        } catch (e) {
            console.error('Failed to parse user info', e);
        }
    }, []);

    const isSuperAdmin = currentUserKey === 'wjc';

    // 加载数据
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();
        let isTimeout = false;

        const timeoutId = setTimeout(() => {
            isTimeout = true;
            controller.abort();
        }, 120000); // 120秒超时，解决远程访问慢的问题

        const loadAll = async () => {
            setLoadError(null);

            // 1. 并行发起请求
            const dataPromise = fetch('/api/ai-resources/data', { signal: controller.signal })
                .then(async res => {
                    if (!res.ok) throw new Error('Data fetch failed');
                    const jsonData = await res.json();
                    if (isMounted && jsonData && Array.isArray(jsonData.categories) && Array.isArray(jsonData.resources)) {
                        setData(jsonData);
                    }
                })
                .catch(err => {
                    if (err.name !== 'AbortError') console.error('Data load error:', err);
                    throw err;
                });

            // Logo 在后台加载，不阻塞主数据显示
            fetch('/api/ai-resources/logo-list', { signal: controller.signal })
                .then(async res => {
                    if (res.ok) {
                        const logoListData = await res.json();
                        if (isMounted) setLogoCache(logoListData.logos || {});
                    }
                })
                .catch(err => {
                    if (err.name !== 'AbortError') console.error('Logo load error:', err);
                });

            try {
                // 等待主数据加载完成（logo可以是后台加载，不阻塞主界面）
                await dataPromise;
            } catch (error) {
                if (!isMounted) return;
                console.error('Failed to load AI resources:', error);

                if (error instanceof Error && error.name === 'AbortError' && isTimeout) {
                    setLoadError('网络超时，请检查网络连接后重试');
                }
            } finally {
                clearTimeout(timeoutId);
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };
        loadAll();

        return () => {
            isMounted = false;
            controller.abort();
            clearTimeout(timeoutId);
        };
    }, []);

    // 筛选资源（直接渲染全部，不做分批）
    const filteredResources = useMemo(() => {
        let resources = data.resources;

        if (activeCategory !== 'all') {
            resources = resources.filter(r => r.category === activeCategory);
        }

        if (deferredSearchQuery.trim()) {
            const query = deferredSearchQuery.toLowerCase();
            resources = resources.filter(r =>
                r.name.toLowerCase().includes(query) ||
                r.description.toLowerCase().includes(query) ||
                r.tags?.some(t => t.toLowerCase().includes(query))
            );
        }

        return resources.sort((a, b) => (a.order || 99) - (b.order || 99));
    }, [data.resources, activeCategory, deferredSearchQuery]);

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
            toast.info(tr.allIconsExist);
            return;
        }
        setIsDownloading(true);
        setDownloadProgress({ current: 0, total: missingLogos.length });

        let successCount = 0;
        let failCount = 0;
        let completed = 0;
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

        for (let i = 0; i < missingLogos.length; i += BATCH_SIZE) {
            const batch = missingLogos.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(downloadOne));
        }

        setIsDownloading(false);
        toast.success(tr.downloadComplete.replace('{success}', String(successCount)).replace('{fail}', String(failCount)));
        await refreshLogos();
    };

    const getLogo = useCallback((resourceId: string): string | null => {
        return logoCache[resourceId] || null;
    }, [logoCache]);

    const handleSave = async (updatedData: AIResourcesData) => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/ai-resources/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });

            if (res.ok) {
                setData(updatedData);
                setIsEditing(false);
                toast.success(tr.saveSuccess);
            } else {
                toast.error(tr.saveFail);
            }
        } catch {
            toast.error(tr.saveFail);
        } finally {
            setIsSaving(false);
        }
    };

    // 错误状态
    if (loadError) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 bg-background/50">
                <div className="text-red-500">{loadError}</div>
                <button
                    className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
                    onClick={() => window.location.reload()}
                >
                    重新加载
                </button>
            </div>
        );
    }

    if (isEditing) {
        return (
            <AIResourceEditor
                data={data}
                isSaving={isSaving}
                onCancel={() => setIsEditing(false)}
                onSave={handleSave}
            />
        );
    }



    return (
        <div className="h-full flex flex-col bg-muted/30">
            {/* 顶部导航栏 */}
            <div className="flex-shrink-0 bg-background/60 backdrop-blur-xl border-b border-border px-5 py-3 z-10 sticky top-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="text-sm">{tr.back}</span>
                        </button>
                        <div className="w-px h-4 bg-border" />
                        <h1 className="text-base font-semibold text-foreground">{tr.title}</h1>
                        <span className="text-xs text-muted-foreground">
                            ({filteredResources.length} / {data.resources.length})
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={tr.searchPlaceholder}
                                className="pl-9 pr-8 w-56 h-8 bg-muted/80 border-0 rounded-lg text-sm 
                                         placeholder:text-muted-foreground focus:outline-none focus:bg-background 
                                         focus:ring-1 focus:ring-ring transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {isSuperAdmin && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={downloadMissingLogos}
                                    disabled={isDownloading}
                                    className="flex items-center gap-1.5 px-3 h-8 text-sm text-muted-foreground 
                                             hover:text-foreground hover:bg-muted rounded-lg transition-colors
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
                                            <span>{tr.downloadIcons}</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-1.5 px-3 h-8 text-sm text-muted-foreground 
                                             hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                    <span>{tr.manage}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1 scrollbar-none">
                    <CategoryTab
                        active={activeCategory === 'all'}
                        onClick={() => setActiveCategory('all')}
                        label={tr.allCategory}
                    />
                    {data.categories.sort((a, b) => a.order - b.order).map(cat => (
                        <CategoryTab
                            key={cat.id}
                            active={activeCategory === cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            label={cat.name}
                        />
                    ))}
                </div>
            </div>

            {/* 资源列表区域 */}
            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                {isLoading ? (
                    // 骨架屏加载状态
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {Array.from({ length: 15 }).map((_, i) => (
                            <SkeletonCard key={i} />
                        ))}
                    </div>
                ) : filteredResources.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground text-sm">
                        {tr.noResults}
                    </div>
                ) : (
                    <div
                        key={activeCategory}
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3"
                    >
                        {filteredResources.map((resource) => (
                            <div key={resource.id}>
                                <ResourceCard
                                    resource={resource}
                                    logo={getLogo(resource.id)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// 骨架屏卡片
function SkeletonCard() {
    return (
        <div className="flex items-center gap-3 p-3 bg-card/40 border border-border/40 rounded-xl h-[88px]">
            <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                <div className="h-3 w-1/2 bg-muted/60 animate-pulse rounded" />
            </div>
        </div>
    );
}

// 分类标签组件
const CategoryTab = memo(function CategoryTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string; }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
        >
            {label}
        </button>
    );
});

// 资源卡片组件
const ResourceCard = memo(function ResourceCard({ resource, logo }: { resource: AIResource; logo: string | null; }) {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        if (logo) setImgError(false);
    }, [logo]);

    const handleClick = useCallback(() => {
        window.open(resource.url, '_blank', 'noopener,noreferrer');
    }, [resource.url]);

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
                    loading="lazy"
                    unoptimized
                />
            );
        }
        return (
            <span className="text-sm font-medium text-muted-foreground">
                {resource.name.charAt(0).toUpperCase()}
            </span>
        );
    };

    return (
        <button
            onClick={handleClick}
            className="group flex items-center gap-3 p-3 bg-card/70 backdrop-blur-sm rounded-xl 
                     border border-border/40 hover:bg-card hover:shadow-sm 
                     transition-all duration-150 text-left w-full h-full"
        >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-0.5 shadow-sm group-hover:from-blue-500/30 group-hover:to-purple-500/30 transition-all duration-300">
                <div className="w-full h-full rounded-[10px] bg-background/90 flex items-center justify-center overflow-hidden relative">
                    {renderLogo()}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <h3 className="text-[15px] font-medium text-card-foreground truncate group-hover:text-primary transition-colors">
                        {resource.name}
                    </h3>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <p className="text-[13px] text-muted-foreground mt-0.5 truncate">
                    {resource.description}
                </p>
                {/* 仅显示前2个标签，简化视觉 */}
                {resource.tags && resource.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
                        {resource.tags.slice(0, 2).map(tag => (
                            <span
                                key={tag}
                                className="px-1.5 py-0.5 text-[11px] bg-muted/60 text-muted-foreground rounded"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </button>
    );
});
