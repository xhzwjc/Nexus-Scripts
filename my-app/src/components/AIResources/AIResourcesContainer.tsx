'use client';

import { useState, useEffect, useMemo, memo, useDeferredValue, useCallback, useRef, CSSProperties } from 'react';
import Image from 'next/image';
import { Search, Settings, ArrowLeft, X, Download, ChevronRight } from 'lucide-react';
import type { AIResource, AIResourcesData } from '@/lib/ai-resources-data';
import { AIResourceEditor } from '@/components/AIResources/AIResourceEditor';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { Grid } from 'react-window';

interface AIResourcesContainerProps {
    onBack: () => void;
    isAdmin?: boolean;
}

// 空的初始状态，数据通过 API 加载
const EMPTY_DATA: AIResourcesData = {
    categories: [],
    resources: []
};

// 卡片尺寸常量
const CARD_HEIGHT = 88; // px
const CARD_MIN_WIDTH = 280; // px
const GAP = 12; // px

// Cell props type for Grid
interface ResourceCellProps {
    resources: AIResource[];
    columns: number;
    getLogo: (id: string) => string | null;
}

// Cell component for virtual grid - must match react-window v2 cellComponent signature
function ResourceCell(props: {
    ariaAttributes: {
        "aria-colindex": number;
        role: "gridcell";
    };
    columnIndex: number;
    rowIndex: number;
    style: CSSProperties;
} & ResourceCellProps) {
    const { columnIndex, rowIndex, style, resources, columns, getLogo } = props;
    const index = rowIndex * columns + columnIndex;
    if (index >= resources.length) return null;

    const resource = resources[index];
    const logo = getLogo(resource.id);

    return (
        <div style={{
            ...style,
            paddingRight: columnIndex < columns - 1 ? GAP : 0,
            paddingBottom: GAP
        }}>
            <ResourceCard resource={resource} logo={logo} />
        </div>
    );
}

export function AIResourcesContainer({ onBack, isAdmin = false }: AIResourcesContainerProps) {
    const { t } = useI18n();
    const tr = t.aiResources;

    // 使用空初始状态，避免静态数据打包到 bundle
    const [data, setData] = useState<AIResourcesData>(EMPTY_DATA);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null); // 新增：加载错误状态
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [isEditing, setIsEditing] = useState(false);
    const [logoCache, setLogoCache] = useState<Record<string, string>>({});
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

    // 虚拟列表容器尺寸
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    // 使用 useDeferredValue 避免输入时卡顿
    const deferredSearchQuery = useDeferredValue(searchQuery);

    // 监听容器尺寸变化
    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        // 立即获取初始尺寸
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setContainerSize({ width: rect.width, height: rect.height });
        }

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setContainerSize({ width, height });
                }
            }
        });

        resizeObserver.observe(element);
        return () => resizeObserver.disconnect();
    }, [isLoading]); // 当 loading 结束时重新检测

    // 加载数据和本地logo列表
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();
        let isTimeout = false;

        const timeoutId = setTimeout(() => {
            isTimeout = true;
            controller.abort();
        }, 30000); // 30秒超时

        const loadAll = async () => {
            try {
                setLoadError(null);
                const dataRes = await fetch('/api/ai-resources/data', { signal: controller.signal });
                if (!isMounted) return;

                if (dataRes.ok) {
                    const jsonData = await dataRes.json();
                    if (jsonData && Array.isArray(jsonData.categories) && Array.isArray(jsonData.resources)) {
                        setData(jsonData);
                    }
                }

                const logoListRes = await fetch('/api/ai-resources/logo-list', { signal: controller.signal });
                if (!isMounted) return;

                if (logoListRes.ok) {
                    const logoListData = await logoListRes.json();
                    setLogoCache(logoListData.logos || {});
                }
            } catch (error) {
                if (!isMounted) return;

                console.error('Failed to load AI resources:', error);
                // 只有真正的超时才显示错误
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
        toast.success(tr.downloadComplete.replace('{success}', String(successCount)).replace('{fail}', String(failCount)));
        await refreshLogos();
    };

    const getLogo = useCallback((resourceId: string): string | null => {
        return logoCache[resourceId] || null;
    }, [logoCache]);

    // 使用 deferredSearchQuery 进行过滤，避免输入时卡顿
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

    // 计算网格布局
    const gridLayout = useMemo(() => {
        if (containerSize.width === 0) return { columns: 1, columnWidth: CARD_MIN_WIDTH };

        const columns = Math.max(1, Math.floor((containerSize.width + GAP) / (CARD_MIN_WIDTH + GAP)));
        const columnWidth = (containerSize.width - GAP * (columns - 1)) / columns;

        return { columns, columnWidth };
    }, [containerSize.width]);

    const rowCount = Math.ceil(filteredResources.length / gridLayout.columns);

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
                toast.success(tr.saveSuccess);
            } else {
                toast.error(tr.saveFail);
            }
        } catch {
            toast.error(tr.saveFail);
        }
    };

    // 加载中或加载错误
    if (isLoading || loadError) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 bg-background/50">
                {isLoading ? (
                    <div className="text-muted-foreground text-sm">{t.common.loading}</div>
                ) : (
                    <>
                        <div className="text-red-500">{loadError}</div>
                        <button
                            className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
                            onClick={() => window.location.reload()}
                        >
                            重新加载
                        </button>
                    </>
                )}
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
        <div className="h-full flex flex-col bg-muted/30">
            {/* 顶部导航栏 - iOS 26 毛玻璃风格 */}
            <div className="flex-shrink-0 bg-background/60 backdrop-blur-xl border-b border-border px-5 py-3">
                <div className="flex items-center justify-between">
                    {/* 左侧：返回 + 标题 */}
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

                    {/* 右侧：搜索 + 管理 */}
                    <div className="flex items-center gap-3">
                        {/* 搜索框 - 极简胶囊样式 */}
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

                        {/* 管理按钮 - 仅管理员可见 */}
                        {isAdmin && (
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

                {/* 分类标签 - 极简风格 */}
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

            {/* 资源虚拟网格 */}
            <div ref={containerRef} className="flex-1 overflow-auto p-5" style={{ minHeight: 0 }}>
                {filteredResources.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground text-sm">
                        {tr.noResults}
                    </div>
                ) : containerSize.width > 0 && containerSize.height > 0 ? (
                    <Grid<ResourceCellProps>
                        cellComponent={ResourceCell}
                        cellProps={{
                            resources: filteredResources,
                            columns: gridLayout.columns,
                            getLogo
                        }}
                        columnCount={gridLayout.columns}
                        columnWidth={gridLayout.columnWidth + (gridLayout.columns > 1 ? GAP / gridLayout.columns : 0)}
                        rowCount={rowCount}
                        rowHeight={CARD_HEIGHT + GAP}
                        className="scrollbar-thin"
                        style={{ height: containerSize.height, width: containerSize.width }}
                    />
                ) : (
                    // Fallback: 普通网格渲染（当容器尺寸未检测到时）
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {filteredResources.slice(0, 50).map(resource => (
                            <ResourceCard key={resource.id} resource={resource} logo={getLogo(resource.id)} />
                        ))}
                        {filteredResources.length > 50 && (
                            <div className="col-span-full text-center py-4 text-muted-foreground text-sm">
                                ... 还有 {filteredResources.length - 50} 个资源
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// 分类标签组件 - 使用 memo 避免不必要的重渲染
const CategoryTab = memo(function CategoryTab({
    active,
    onClick,
    label
}: {
    active: boolean;
    onClick: () => void;
    label: string;
}) {
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

// 资源卡片组件 - 使用 memo 避免不必要的重渲染
const ResourceCard = memo(function ResourceCard({
    resource,
    logo
}: {
    resource: AIResource;
    logo: string | null;
}) {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        if (logo) {
            setImgError(false);
        }
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
        // 默认使用首字母
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
            {/* Logo with Gradient Border */}
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-0.5 shadow-sm group-hover:from-blue-500/40 group-hover:to-purple-500/40 transition-all duration-300">
                <div className="w-full h-full rounded-[10px] bg-white flex items-center justify-center overflow-hidden relative">
                    {renderLogo()}
                </div>
            </div>

            {/* 内容 */}
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
                {/* Tags - 极简风格 */}
                {resource.tags && resource.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
                        {resource.tags.slice(0, 2).map(tag => (
                            <span
                                key={tag}
                                className="px-1.5 py-0.5 text-[11px] bg-muted text-muted-foreground rounded"
                            >
                                {tag}
                            </span>
                        ))}
                        {resource.tags.length > 2 && (
                            <span className="text-[11px] text-muted-foreground/60">+{resource.tags.length - 2}</span>
                        )}
                    </div>
                )}
            </div>
        </button>
    );
});
