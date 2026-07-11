'use client';

import React from 'react';
import {
    CalendarDays,
    ChevronDown,
    CircleHelp,
    Cloud,
    Lock,
    LogOut,
    MapPin,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useI18n } from '@/lib/i18n';
import type { User, WeatherState, ViewType } from '@/lib/types';

type DashboardUserMenuProps = {
    currentUser: User | null;
    now: Date;
    weather: WeatherState;
    weatherRefreshing: boolean;
    weatherLocationLabel: string;
    onRefreshWeather: () => void;
    setCurrentView: (view: ViewType) => void;
    handleLock: () => void;
    onLogoutRequest: () => void;
};

function resolveAvatarLabel(name?: string | null) {
    const normalized = String(name || '').trim();
    if (!normalized) return 'U';

    const chineseCharacter = Array.from(normalized).find((character) => /[\u3400-\u9fff]/.test(character));
    if (chineseCharacter) return chineseCharacter;

    const parts = normalized.split(/[\s_.-]+/).filter(Boolean);
    if (parts.length > 1) {
        return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
    }
    return normalized.slice(0, 2).toUpperCase();
}

export function DashboardUserMenu({
    currentUser,
    now,
    weather,
    weatherRefreshing,
    weatherLocationLabel,
    onRefreshWeather,
    setCurrentView,
    handleLock,
    onLogoutRequest,
}: DashboardUserMenuProps) {
    const { t, language } = useI18n();
    const [open, setOpen] = React.useState(false);
    const userName = currentUser?.name?.trim() || currentUser?.role || 'User';
    const avatarLabel = resolveAvatarLabel(userName);
    const accountMeta = currentUser?.primaryOrgCode || currentUser?.role || (language === 'zh-CN' ? '当前账号' : 'Current account');
    const dateTimeText = new Intl.DateTimeFormat(language, {
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(now);
    const weatherText = weather.data
        ? `${weather.data.temp}°C · ${weather.data.desc}`
        : (weather.loading ? (language === 'zh-CN' ? '天气加载中' : 'Loading weather') : (language === 'zh-CN' ? '天气暂不可用' : 'Weather unavailable'));

    const closeThen = (action: () => void) => {
        setOpen(false);
        action();
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="dashboard-user-trigger group"
                    aria-label={language === 'zh-CN' ? '打开账号菜单' : 'Open account menu'}
                    aria-expanded={open}
                >
                    <Avatar className="h-[30px] w-[30px]">
                        <AvatarFallback className="bg-[#1E3BFA] text-[12px] font-medium text-white">
                            {avatarLabel}
                        </AvatarFallback>
                    </Avatar>
                    <span className="max-w-32 truncate text-[13px] text-[#0E1114] dark:text-slate-100">{userName}</span>
                    <ChevronDown className="h-3 w-3 text-[#86888F] transition-transform duration-200 group-data-[state=open]:rotate-180"/>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={10}
                className="dashboard-user-menu w-[320px] rounded-lg border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[0_8px_24px_rgba(14,17,20,0.12)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
                <div className="flex items-center gap-3 border-b border-[#F2F3F5] px-4 py-4 dark:border-slate-800">
                    <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-[#1E3BFA] text-sm font-medium text-white">{avatarLabel}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#0E1114] dark:text-slate-50">{userName}</p>
                        <p className="mt-1 truncate text-xs text-[#86888F] dark:text-slate-400">{accountMeta}</p>
                    </div>
                </div>

                <div className="space-y-2 border-b border-[#F2F3F5] px-4 py-3 text-xs dark:border-slate-800">
                    <div className="flex items-center gap-2 text-[#33353D] dark:text-slate-300">
                        <CalendarDays className="h-3.5 w-3.5 text-[#86888F]"/>
                        <span className="tabular-nums">{dateTimeText}</span>
                    </div>
                    <button
                        type="button"
                        onClick={onRefreshWeather}
                        className="flex w-full items-center gap-2 rounded-md text-left text-[#33353D] transition hover:text-[#1E3BFA] dark:text-slate-300"
                    >
                        {weather.data ? <MapPin className="h-3.5 w-3.5 text-[#86888F]"/> : <Cloud className="h-3.5 w-3.5 text-[#86888F]"/>}
                        <span className="min-w-0 flex-1 truncate">{weatherLocationLabel} · {weatherText}</span>
                        {weatherRefreshing ? <span className="text-[#86888F]">•••</span> : null}
                    </button>
                </div>

                <div className="space-y-1 px-2 py-2">
                    <div className="dashboard-user-menu-row cursor-default">
                        <span>{language === 'zh-CN' ? '外观主题' : 'Appearance'}</span>
                        <ThemeSwitcher/>
                    </div>
                    <div className="dashboard-user-menu-row cursor-default">
                        <span>{language === 'zh-CN' ? '界面语言' : 'Language'}</span>
                        <LanguageSwitcher/>
                    </div>
                    <button
                        type="button"
                        className="dashboard-user-menu-row"
                        onClick={() => closeThen(() => setCurrentView('help'))}
                    >
                        <span>{t.nav.helpCenter}</span>
                        <CircleHelp className="h-4 w-4 text-[#86888F]"/>
                    </button>
                    <button
                        type="button"
                        className="dashboard-user-menu-row"
                        onClick={() => closeThen(handleLock)}
                    >
                        <span>{t.header.lockTitle}</span>
                        <Lock className="h-4 w-4 text-[#86888F]"/>
                    </button>
                </div>

                <div className="border-t border-[#F2F3F5] p-2 dark:border-slate-800">
                    <button
                        type="button"
                        className="dashboard-user-menu-row text-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] hover:text-[#F53F3F]"
                        onClick={() => closeThen(onLogoutRequest)}
                    >
                        <span>{t.nav.logout}</span>
                        <LogOut className="h-4 w-4"/>
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
