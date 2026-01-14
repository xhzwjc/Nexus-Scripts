'use client';

import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { StatusChip } from './StatusChip';

export interface TimeChipProps {
    name?: string;
    now: Date;
}

export const TimeChip: React.FC<TimeChipProps> = ({ name, now }) => {
    const dtf = useMemo(() => new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short', month: '2-digit', day: '2-digit', hour12: false
    }), []);

    const parts = useMemo(() => {
        const p = dtf.formatToParts(now);
        const get = (type: string) => p.find(x => x.type === type)?.value || '';
        const hour = parseInt(get('hour') || '0', 10);
        return { hour, minute: get('minute'), second: get('second'), weekday: get('weekday') };
    }, [dtf, now]);

    const greeting = parts.hour < 6 ? '自律' : parts.hour < 12 ? '早安' : parts.hour < 14 ? '午安' : parts.hour < 18 ? '下午好' : '晚上好';

    return (
        <StatusChip>
            <Clock className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap tabular-nums font-mono">
                {parts.hour.toString().padStart(2, '0')}:{parts.minute}:{parts.second}
            </span>
            <span className="text-muted-foreground hidden sm:inline">{parts.weekday}</span>
            <span className="text-muted-foreground hidden lg:inline">| {greeting}{name ? `, ${name}` : ''}</span>
        </StatusChip>
    );
};
