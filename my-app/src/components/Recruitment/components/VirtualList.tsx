"use client";

import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface VirtualListProps<T> {
    items: T[];
    getItemId: (item: T) => string | number;
    renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
    rowHeight: number;
    overscan?: number;
    className?: string;
    containerClassName?: string;
    onScroll?: (scrollTop: number) => void;
    scrollToIndex?: number | null;
    header?: React.ReactNode;
    footer?: React.ReactNode;
    emptyState?: React.ReactNode;
}

// 简单的虚拟列表实现，不依赖外部库
export function VirtualList<T>({
    items,
    getItemId,
    renderItem,
    rowHeight,
    overscan = 8,
    className,
    containerClassName,
    onScroll,
    scrollToIndex,
    header,
    footer,
    emptyState,
}: VirtualListProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    
    // 计算可见范围
    const virtualState = useMemo(() => {
        const totalHeight = items.length * rowHeight;
        const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
        const visibleEnd = Math.min(
            items.length - 1,
            Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
        );
        
        const visibleItems = items.slice(visibleStart, visibleEnd + 1);
        const topPadding = visibleStart * rowHeight;
        const bottomPadding = Math.max(0, totalHeight - (visibleEnd + 1) * rowHeight);
        
        return {
            visibleItems,
            visibleStart,
            visibleEnd,
            topPadding,
            bottomPadding,
            totalHeight,
        };
    }, [items, rowHeight, scrollTop, containerHeight, overscan]);
    
    // 监听容器大小变化
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        
        const updateHeight = () => {
            setContainerHeight(container.clientHeight);
        };
        
        updateHeight();
        
        // 使用 ResizeObserver 监听大小变化
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(updateHeight);
            observer.observe(container);
        } else {
            window.addEventListener('resize', updateHeight);
        }
        
        return () => {
            if (observer) {
                observer.disconnect();
            } else {
                window.removeEventListener('resize', updateHeight);
            }
        };
    }, []);
    
    // 处理滚动
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const newScrollTop = (e.target as HTMLDivElement).scrollTop;
        setScrollTop(newScrollTop);
        onScroll?.(newScrollTop);
    }, [onScroll]);
    
    // 滚动到指定索引
    useEffect(() => {
        if (scrollToIndex !== null && scrollToIndex !== undefined && containerRef.current) {
            const targetScrollTop = scrollToIndex * rowHeight;
            containerRef.current.scrollTop = targetScrollTop;
        }
    }, [scrollToIndex, rowHeight]);
    
    if (items.length === 0 && emptyState) {
        return (
            <div className={cn("h-full overflow-auto", containerClassName)}>
                {header}
                <div className={className}>{emptyState}</div>
                {footer}
            </div>
        );
    }
    
    return (
        <div
            ref={containerRef}
            className={cn("h-full overflow-auto", containerClassName)}
            onScroll={handleScroll}
        >
            {header}
            <div style={{ height: virtualState.totalHeight, position: 'relative' }}>
                {/* 顶部占位 */}
                {virtualState.topPadding > 0 && (
                    <div style={{ height: virtualState.topPadding }} aria-hidden="true" />
                )}
                
                {/* 可见项目 */}
                {virtualState.visibleItems.map((item, idx) => {
                    const actualIndex = virtualState.visibleStart + idx;
                    const style: React.CSSProperties = {
                        position: 'absolute',
                        top: actualIndex * rowHeight,
                        left: 0,
                        right: 0,
                        height: rowHeight,
                    };
                    
                    return (
                        <div key={getItemId(item)} style={style} className={className}>
                            {renderItem(item, actualIndex, {})}
                        </div>
                    );
                })}
                
                {/* 底部占位 */}
                {virtualState.bottomPadding > 0 && (
                    <div 
                        style={{ 
                            height: virtualState.bottomPadding,
                            position: 'absolute',
                            top: virtualState.totalHeight - virtualState.bottomPadding,
                            left: 0,
                            right: 0,
                        }} 
                        aria-hidden="true" 
                    />
                )}
            </div>
            {footer}
        </div>
    );
}

// 用于表格的虚拟列表
interface VirtualTableProps<T> {
    items: T[];
    getItemId: (item: T) => string | number;
    columns: {
        key: string;
        header: React.ReactNode;
        width?: number | string;
        minWidth?: number | string;
        maxWidth?: number | string;
        render: (item: T, index: number) => React.ReactNode;
    }[];
    rowHeight: number;
    headerHeight?: number;
    overscan?: number;
    className?: string;
    containerClassName?: string;
    onScroll?: (scrollTop: number) => void;
    scrollToIndex?: number | null;
    emptyState?: React.ReactNode;
    loading?: boolean;
    loadingRows?: number;
}

export function VirtualTable<T>({
    items,
    getItemId,
    columns,
    rowHeight,
    headerHeight = 40,
    overscan = 8,
    className,
    containerClassName,
    onScroll,
    scrollToIndex,
    emptyState,
    loading,
    loadingRows = 5,
}: VirtualTableProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    
    const virtualState = useMemo(() => {
        const totalHeight = items.length * rowHeight;
        const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
        const visibleEnd = Math.min(
            items.length - 1,
            Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
        );
        
        const visibleItems = items.slice(visibleStart, visibleEnd + 1);
        const topPadding = visibleStart * rowHeight;
        const bottomPadding = Math.max(0, totalHeight - (visibleEnd + 1) * rowHeight);
        
        return {
            visibleItems,
            visibleStart,
            visibleEnd,
            topPadding,
            bottomPadding,
            totalHeight,
        };
    }, [items, rowHeight, scrollTop, containerHeight, overscan]);
    
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        
        const updateSize = () => {
            setContainerHeight(container.clientHeight);
            setContainerWidth(container.clientWidth);
        };
        
        updateSize();
        
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(updateSize);
            observer.observe(container);
        } else {
            window.addEventListener('resize', updateSize);
        }
        
        return () => {
            if (observer) {
                observer.disconnect();
            } else {
                window.removeEventListener('resize', updateSize);
            }
        };
    }, []);
    
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const newScrollTop = (e.target as HTMLDivElement).scrollTop;
        setScrollTop(newScrollTop);
        onScroll?.(newScrollTop);
    }, [onScroll]);
    
    useEffect(() => {
        if (scrollToIndex !== null && scrollToIndex !== undefined && containerRef.current) {
            const targetScrollTop = scrollToIndex * rowHeight;
            containerRef.current.scrollTop = targetScrollTop;
        }
    }, [scrollToIndex, rowHeight]);
    
    const totalTableWidth = useMemo(() => {
        return columns.reduce((sum, col) => {
            const width = typeof col.width === 'number' ? col.width : 150;
            return sum + width;
        }, 0);
    }, [columns]);
    
    if (items.length === 0 && emptyState && !loading) {
        return (
            <div className={cn("h-full overflow-auto", containerClassName)}>
                <div className="min-h-full flex items-center justify-center">
                    {emptyState}
                </div>
            </div>
        );
    }
    
    return (
        <div
            ref={containerRef}
            className={cn("h-full overflow-auto", containerClassName)}
            onScroll={handleScroll}
        >
            <table 
                className={cn("w-full table-fixed text-base", className)}
                style={{ width: Math.max(totalTableWidth, containerWidth) }}
            >
                <thead className="sticky top-0 z-10">
                    <tr style={{ height: headerHeight }}>
                        {columns.map(col => (
                            <th
                                key={col.key}
                                className="bg-white/95 dark:bg-slate-950/95 border-b px-2 text-left text-sm font-medium whitespace-nowrap"
                                style={{
                                    width: col.width,
                                    minWidth: col.minWidth,
                                    maxWidth: col.maxWidth,
                                    height: headerHeight,
                                }}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        // 骨架屏加载状态
                        Array.from({ length: loadingRows }).map((_, idx) => (
                            <tr key={`skeleton-${idx}`} style={{ height: rowHeight }}>
                                {columns.map(col => (
                                    <td key={col.key} className="border-b px-2 py-2">
                                        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : (
                        <>
                            {virtualState.topPadding > 0 && (
                                <tr style={{ height: virtualState.topPadding }} aria-hidden="true">
                                    <td colSpan={columns.length} />
                                </tr>
                            )}
                            
                            {virtualState.visibleItems.map((item, idx) => {
                                const actualIndex = virtualState.visibleStart + idx;
                                return (
                                    <tr 
                                        key={getItemId(item)} 
                                        style={{ height: rowHeight }}
                                        className="border-b hover:bg-slate-50 dark:hover:bg-slate-900/50"
                                    >
                                        {columns.map(col => (
                                            <td
                                                key={col.key}
                                                className="px-2 py-2 overflow-hidden"
                                                style={{
                                                    width: col.width,
                                                    minWidth: col.minWidth,
                                                    maxWidth: col.maxWidth,
                                                }}
                                            >
                                                {col.render(item, actualIndex)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                            
                            {virtualState.bottomPadding > 0 && (
                                <tr style={{ height: virtualState.bottomPadding }} aria-hidden="true">
                                    <td colSpan={columns.length} />
                                </tr>
                            )}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// 优化的行组件，使用 React.memo 避免不必要的重渲染
interface VirtualRowProps {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    isSelected?: boolean;
    onClick?: () => void;
}

export const VirtualRow = React.memo(function VirtualRow({
    children,
    className,
    style,
    isSelected,
    onClick,
}: VirtualRowProps) {
    return (
        <div
            className={cn(
                "flex items-center",
                isSelected && "bg-slate-100 dark:bg-slate-900",
                onClick && "cursor-pointer",
                className
            )}
            style={style}
            onClick={onClick}
        >
            {children}
        </div>
    );
});

// 用于无限滚动的 Hook
export function useInfiniteScroll(
    loadMore: () => void,
    options?: {
        threshold?: number;
        hasMore?: boolean;
        disabled?: boolean;
    }
) {
    const { threshold = 100, hasMore = true, disabled = false } = options || {};
    const observerRef = useRef<IntersectionObserver | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    
    const setSentinel = useCallback((node: HTMLDivElement | null) => {
        sentinelRef.current = node;
        
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }
        
        if (node && !disabled && hasMore) {
            observerRef.current = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting) {
                        loadMore();
                    }
                },
                { rootMargin: `${threshold}px` }
            );
            observerRef.current.observe(node);
        }
    }, [loadMore, threshold, hasMore, disabled]);
    
    useEffect(() => {
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, []);
    
    return { sentinelRef: setSentinel };
}
