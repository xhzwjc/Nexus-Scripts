'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AccessControlLabels } from './utils';

interface CompactBadgeListProps {
    items: string[];
    max?: number;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
    emptyLabel?: ReactNode;
}

export function CompactBadgeList({ items, max = 3, variant = 'secondary', emptyLabel }: CompactBadgeListProps) {
    const visibleItems = items.slice(0, max);
    const hiddenCount = Math.max(0, items.length - visibleItems.length);
    const toneClass = variant === 'destructive'
        ? 'border-transparent bg-[rgba(245,63,63,0.08)] text-[#F53F3F]'
        : variant === 'default'
            ? 'border-transparent bg-[rgba(30,59,250,0.08)] text-[#0F23D9]'
            : variant === 'outline'
                ? 'border-[#E6E7EB] bg-white text-[#5E5F66] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                : 'border-transparent bg-[#F2F3F5] text-[#5E5F66] dark:bg-slate-800 dark:text-slate-300';

    if (items.length === 0) {
        return <span className="text-[11px] text-[#B0B2B8]">{emptyLabel || '-'}</span>;
    }

    return (
        <div className="flex max-w-full flex-wrap gap-1">
            {visibleItems.map((item, index) => (
                <Badge key={`${item}-${index}`} variant="outline" className={cn('h-[22px] max-w-[180px] truncate rounded-[4px] px-2 text-[10px] font-normal shadow-none', toneClass)}>
                    {item}
                </Badge>
            ))}
            {hiddenCount > 0 && (
                <Badge variant="outline" className="h-[22px] rounded-[4px] border-[#E6E7EB] bg-white px-2 text-[10px] font-normal text-[#86888F] shadow-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">+{hiddenCount}</Badge>
            )}
        </div>
    );
}

export function StatusBadge({ active, labels }: { active: boolean; labels: AccessControlLabels }) {
    return (
        <Badge variant="outline" className={cn('h-[22px] rounded-[4px] border-transparent px-2 text-[10px] font-normal shadow-none', active ? 'bg-[rgba(12,201,145,0.1)] text-[#0A9C71]' : 'bg-[#F2F3F5] text-[#86888F]')}>
            {active ? labels.active : labels.inactive}
        </Badge>
    );
}

export function ConfigPermissionBadge({
    state,
    labels,
}: {
    state: 'enabled' | 'partial' | 'none';
    labels: AccessControlLabels;
}) {
    if (state === 'enabled') {
        return <Badge variant="outline" className="h-[22px] rounded-[4px] border-transparent bg-[rgba(12,201,145,0.1)] px-2 text-[10px] font-normal text-[#0A9C71] shadow-none">{labels.configPermissionEnabled}</Badge>;
    }
    if (state === 'partial') {
        return <Badge variant="outline" className="h-[22px] rounded-[4px] border-transparent bg-[rgba(255,171,36,0.12)] px-2 text-[10px] font-normal text-[#D48806] shadow-none">{labels.configPermissionPartial}</Badge>;
    }
    return <Badge variant="outline" className="h-[22px] rounded-[4px] border-transparent bg-[#F2F3F5] px-2 text-[10px] font-normal text-[#86888F] shadow-none">{labels.configPermissionNone}</Badge>;
}

export function SensitivityBadge({ value, labels }: { value?: string | null; labels: AccessControlLabels }) {
    const normalized = value || 'normal';
    if (normalized === 'sensitive') {
        return <Badge variant="outline" className="h-[22px] rounded-[4px] border-transparent bg-[rgba(245,63,63,0.08)] px-2 text-[10px] font-normal text-[#F53F3F] shadow-none">{labels.sensitivitySensitive}</Badge>;
    }
    return <Badge variant="outline" className="h-[22px] rounded-[4px] border-[#E6E7EB] bg-white px-2 text-[10px] font-normal text-[#86888F] shadow-none">{labels.sensitivityNormal}</Badge>;
}
