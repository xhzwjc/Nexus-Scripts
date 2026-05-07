'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
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

    if (items.length === 0) {
        return <span className="text-sm text-muted-foreground">{emptyLabel || '-'}</span>;
    }

    return (
        <div className="flex max-w-[320px] flex-wrap gap-1.5">
            {visibleItems.map((item) => (
                <Badge key={item} variant={variant} className="max-w-[180px] truncate">
                    {item}
                </Badge>
            ))}
            {hiddenCount > 0 && (
                <Badge variant="outline">+{hiddenCount}</Badge>
            )}
        </div>
    );
}

export function StatusBadge({ active, labels }: { active: boolean; labels: AccessControlLabels }) {
    return (
        <Badge variant={active ? 'default' : 'outline'}>
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
        return <Badge variant="default">{labels.configPermissionEnabled}</Badge>;
    }
    if (state === 'partial') {
        return <Badge variant="outline">{labels.configPermissionPartial}</Badge>;
    }
    return <Badge variant="secondary">{labels.configPermissionNone}</Badge>;
}

export function SensitivityBadge({ value, labels }: { value?: string | null; labels: AccessControlLabels }) {
    const normalized = value || 'normal';
    if (normalized === 'sensitive') {
        return <Badge variant="destructive">{labels.sensitivitySensitive}</Badge>;
    }
    return <Badge variant="outline">{labels.sensitivityNormal}</Badge>;
}
