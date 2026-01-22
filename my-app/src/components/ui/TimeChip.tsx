'use client';

import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { StatusChip } from './StatusChip';

import { useI18n } from '@/lib/i18n';

export interface TimeChipProps {
    name?: string;
    now: Date;
}

export const TimeChip: React.FC<TimeChipProps> = ({ name, now }) => {
    const { t, language } = useI18n();
    const tr = t.timeChip;

    const dtf = useMemo(() => new Intl.DateTimeFormat(language, {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short', month: '2-digit', day: '2-digit', hour12: false
    }), [language]);

    const parts = useMemo(() => {
        const p = dtf.formatToParts(now);
        const get = (type: string) => p.find(x => x.type === type)?.value || '';
        const hour = parseInt(get('hour') || '0', 10);
        return { hour, minute: get('minute'), second: get('second'), weekday: get('weekday') };
    }, [dtf, now]);

    const greeting = parts.hour < 6 ? tr.greetings.night
        : parts.hour < 12 ? tr.greetings.morning
            : parts.hour < 14 ? tr.greetings.noon
                : parts.hour < 18 ? tr.greetings.afternoon
                    : tr.greetings.evening;

    return (
        <StatusChip className="shrink-0 whitespace-nowrap">
            <Clock className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap tabular-nums font-mono dark:text-gray-50">
                {parts.hour.toString().padStart(2, '0')}:{parts.minute}:{parts.second}
            </span>
            <span className="text-gray-500 dark:text-gray-100 hidden sm:inline">{parts.weekday}</span>
            <span className="text-gray-500 dark:text-gray-100 hidden 2xl:inline">| {greeting}{name ? `, ${name}` : ''}</span>
        </StatusChip>
    );
};
