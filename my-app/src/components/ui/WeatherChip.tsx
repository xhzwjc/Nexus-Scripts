'use client';

import React from 'react';
import {
    Cloud,
    Sun,
    CloudRain,
    CloudSnow,
    CloudFog,
    CloudLightning,
    Thermometer,
    MapPin,
    Wind,
    Droplets,
    Loader2
} from 'lucide-react';
import { StatusChip } from './StatusChip';
import type { WeatherState } from '@/lib/types';

export interface WeatherChipProps {
    state: WeatherState;
    refreshing: boolean;
    label?: string;
    onRefresh?: () => void;
}

const weatherIconMap: Record<string, React.ReactNode> = {
    "100": <Sun className="w-4 h-4" />,          // 晴
    "101": <Cloud className="w-4 h-4" />,         // 多云
    "102": <Cloud className="w-4 h-4" />,         // 少云
    "103": <Cloud className="w-4 h-4" />,         // 晴间多云
    "104": <Cloud className="w-4 h-4" />,         // 阴
    "300": <CloudRain className="w-4 h-4" />,     // 阵雨
    "301": <CloudRain className="w-4 h-4" />,     // 强阵雨
    "302": <CloudLightning className="w-4 h-4" />, // 雷阵雨
    "303": <CloudLightning className="w-4 h-4" />, // 强雷阵雨
    "304": <CloudRain className="w-4 h-4" />,     // 冰雹
    "305": <CloudRain className="w-4 h-4" />,     // 小雨
    "306": <CloudRain className="w-4 h-4" />,     // 中雨
    "307": <CloudRain className="w-4 h-4" />,     // 大雨
    "308": <CloudRain className="w-4 h-4" />,     // 极端降雨
    "309": <CloudRain className="w-4 h-4" />,     // 毛毛雨
    "310": <CloudRain className="w-4 h-4" />,     // 暴雨
    "311": <CloudRain className="w-4 h-4" />,     // 大暴雨
    "312": <CloudRain className="w-4 h-4" />,     // 特大暴雨
    "313": <CloudRain className="w-4 h-4" />,     // 冻雨
    "400": <CloudSnow className="w-4 h-4" />,     // 小雪
    "401": <CloudSnow className="w-4 h-4" />,     // 中雪
    "402": <CloudSnow className="w-4 h-4" />,     // 大雪
    "403": <CloudSnow className="w-4 h-4" />,     // 暴雪
    "404": <CloudRain className="w-4 h-4" />,     // 雨夹雪
    "405": <CloudRain className="w-4 h-4" />,     // 雨雪天气
    "406": <CloudSnow className="w-4 h-4" />,     // 阵雨夹雪
    "407": <CloudSnow className="w-4 h-4" />,     // 阵雪
    "500": <CloudFog className="w-4 h-4" />,      // 薄雾
    "501": <CloudFog className="w-4 h-4" />,      // 雾
    "502": <CloudFog className="w-4 h-4" />,      // 霾
    "503": <CloudFog className="w-4 h-4" />,      // 扬沙
    "504": <CloudFog className="w-4 h-4" />,      // 浮尘
    "507": <CloudFog className="w-4 h-4" />,      // 沙尘暴
    "508": <CloudFog className="w-4 h-4" />,      // 强沙尘暴
    "900": <Sun className="w-4 h-4" />,           // 热
    "901": <Thermometer className="w-4 h-4" />,   // 冷
    "999": <Cloud className="w-4 h-4" />          // 未知
};

const getWeatherIcon = (code?: string) => {
    if (!code) return <Cloud className="w-4 h-4" />;
    return weatherIconMap[code] || <Cloud className="w-4 h-4" />;
};

import { useI18n } from '@/lib/i18n';

export const WeatherChip: React.FC<WeatherChipProps> = ({
    state,
    refreshing,
    label,
    onRefresh
}) => {
    const { t } = useI18n();
    const tr = t.weatherChip;
    const displayLabel = label || tr.defaultCity;

    return (
        <StatusChip className="shrink-0 whitespace-nowrap">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="whitespace-nowrap hidden 2xl:inline">{displayLabel}</span>
            <span className="text-muted-foreground hidden 2xl:inline">·</span>
            {state.loading && !state.data ? (
                <span className="text-gray-500 dark:text-gray-100">{tr.loading}</span>
            ) : state.error && !state.data ? (
                <span className="text-gray-500 dark:text-gray-100">{tr.unavailable}</span>
            ) : state.data ? (
                <>
                    {getWeatherIcon(state.data.code)}
                    <span className="whitespace-nowrap tabular-nums font-mono dark:text-gray-100">{state.data.temp}°C</span>
                    <span className="hidden sm:inline dark:text-gray-100">{state.data.desc}</span>
                    <span className="text-gray-400 dark:text-gray-500 hidden md:inline">·</span>
                    <span className="text-gray-500 dark:text-gray-100 hidden 2xl:inline">
                        <Wind className="inline w-3 h-3 mr-1" />
                        {state.data.wind} km/h
                    </span>
                    <span className="text-gray-500 dark:text-gray-100 hidden 2xl:inline">
                        <Droplets className="inline w-3 h-3 mx-1" />
                        {state.data.humidity}%
                    </span>
                    {refreshing &&
                        <Loader2 className="w-3 h-3 ml-1 animate-spin text-gray-500 dark:text-gray-100" aria-label={tr.refreshing} />}
                </>
            ) : null}

            {onRefresh && (
                <button
                    type="button"
                    onClick={onRefresh}
                    className="ml-1 text-xs text-primary hover:underline hidden md:inline"
                    aria-label={tr.refreshWeather}>
                    {t.common.refresh}
                </button>
            )}
        </StatusChip>
    );
};
