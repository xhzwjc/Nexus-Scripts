
import React from 'react';
import { Card } from '@/components/ui/card';

// 单个系统卡片的骨架屏
function SkeletonSystemCard() {
    return (
        <Card className="flex flex-col overflow-hidden border-border/60 shadow-sm bg-card h-[320px]">
            {/* Header Skeleton */}
            <div className="p-5 border-b border-border/60 flex items-start justify-between bg-muted/20">
                <div className="flex gap-3 w-full">
                    {/* Logo Skeleton */}
                    <div className="w-10 h-10 rounded-lg bg-muted animate-pulse shrink-0" />

                    <div className="flex-1 space-y-2">
                        {/* Title Skeleton */}
                        <div className="h-5 w-1/3 bg-muted animate-pulse rounded" />
                        {/* Description Skeleton */}
                        <div className="h-3 w-3/4 bg-muted/60 animate-pulse rounded" />
                    </div>
                </div>
            </div>

            {/* Content Skeleton */}
            <div className="p-5 flex-1 flex flex-col gap-4">
                {/* Tabs Skeleton */}
                <div className="w-full h-10 bg-muted/30 rounded-md animate-pulse p-1 grid grid-cols-3 gap-1">
                    <div className="bg-muted/50 rounded h-full" />
                    <div className="bg-muted/50 rounded h-full" />
                    <div className="bg-muted/50 rounded h-full" />
                </div>

                <div className="space-y-4">
                    {/* URL Bar Skeleton */}
                    <div className="h-12 w-full bg-muted/20 border border-border/40 rounded-lg animate-pulse" />

                    {/* Credentials Skeleton */}
                    <div className="space-y-3">
                        <div className="h-10 w-full bg-muted/20 border border-border/40 rounded-lg animate-pulse" />
                        <div className="h-10 w-full bg-muted/20 border border-border/40 rounded-lg animate-pulse" />
                    </div>
                </div>
            </div>
        </Card>
    );
}

// 整个团队资源页面的骨架屏
export function TeamResourceSkeleton() {
    return (
        <div className="flex h-full bg-background">
            {/* Sidebar Skeleton */}
            <div className="w-64 border-r border-border/60 flex flex-col pt-4 pb-4">
                {/* Sidebar Header */}
                <div className="px-4 mb-6 flex items-center justify-between">
                    <div className="w-8 h-8 bg-muted animate-pulse rounded" />
                    <div className="w-20 h-5 bg-muted animate-pulse rounded" />
                    <div className="flex gap-1">
                        <div className="w-8 h-8 bg-muted animate-pulse rounded" />
                        <div className="w-8 h-8 bg-muted animate-pulse rounded" />
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-4 mb-4">
                    <div className="h-9 w-full bg-muted animate-pulse rounded-md" />
                </div>

                {/* Group List */}
                <div className="flex-1 px-2 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="w-10 h-10 rounded-xl bg-muted animate-pulse shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                                <div className="h-3 w-16 bg-muted/60 animate-pulse rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content Skeleton */}
            <div className="flex-1 overflow-hidden p-8">
                <div className="max-w-6xl mx-auto h-full flex flex-col">
                    {/* Title Area */}
                    <div className="mb-8 space-y-3">
                        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                        <div className="h-4 w-96 bg-muted/60 animate-pulse rounded" />
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonSystemCard key={i} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
