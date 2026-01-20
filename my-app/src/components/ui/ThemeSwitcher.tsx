'use client';

import React from 'react';
import { useTheme, type Theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { Sun, Moon, Monitor } from 'lucide-react';

const themeOrder: Theme[] = ['light', 'dark', 'system'];

export function ThemeSwitcher() {
    const { theme, resolvedTheme, setTheme } = useTheme();
    const { t } = useI18n();

    const cycleTheme = () => {
        const currentIndex = themeOrder.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themeOrder.length;
        setTheme(themeOrder[nextIndex]);
    };

    const getIcon = () => {
        if (theme === 'system') {
            return <Monitor className="w-[18px] h-[18px]" />;
        }
        return resolvedTheme === 'dark'
            ? <Moon className="w-[18px] h-[18px]" />
            : <Sun className="w-[18px] h-[18px]" />;
    };

    const getTooltip = () => {
        switch (theme) {
            case 'light': return t.theme.light;
            case 'dark': return t.theme.dark;
            case 'system': return t.theme.system;
        }
    };

    return (
        <button
            onClick={cycleTheme}
            className="p-2 rounded-lg transition-all duration-200 
                       hover:bg-[var(--glass-bg)] 
                       text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                       focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
            title={getTooltip()}
            aria-label={t.theme.toggle}
        >
            {getIcon()}
        </button>
    );
}
