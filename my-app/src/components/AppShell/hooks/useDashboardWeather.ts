'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { WEATHER_CACHE_KEY, WEATHER_TTL } from '@/lib/config';
import type { WeatherState } from '@/lib/types';

export function useDashboardWeather(language: string) {
    const [now, setNow] = useState<Date>(new Date());
    const [weather, setWeather] = useState<WeatherState>({ loading: true });
    const [weatherRefreshing, setWeatherRefreshing] = useState(false);
    const previousLanguageRef = useRef(language);

    const refreshWeather = useCallback(async (options?: { background?: boolean }) => {
        const background = !!options?.background;
        const apiKey = process.env.NEXT_PUBLIC_HEWEATHER_API_KEY;
        const apiHost = process.env.NEXT_PUBLIC_HEWEATHER_HOST;

        if (!apiKey || !apiHost) {
            setWeather((previous) => ({ ...previous, loading: false, error: 'config' }));
            return;
        }

        if (!background) {
            setWeatherRefreshing(true);
        }

        try {
            const apiLang = language === 'en-US' ? 'en' : 'zh';
            const response = await fetch(
                `https://${apiHost}/v7/weather/now?location=101010100&lang=${apiLang}`,
                { headers: { 'X-QW-Api-Key': apiKey } },
            );
            const data = await response.json();
            if (data.code !== '200') {
                throw new Error(data.code);
            }

            const parsed = {
                temp: parseInt(data.now.temp, 10),
                desc: data.now.text,
                wind: parseFloat(data.now.windSpeed),
                humidity: parseInt(data.now.humidity, 10),
                code: data.now.icon,
            };

            setWeather({ loading: false, data: parsed });
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: parsed }));
        } catch {
            setWeather((previous) =>
                previous.data
                    ? { ...previous, loading: false, error: 'err' }
                    : {
                        loading: false,
                        error: 'err',
                        data: {
                            temp: 25,
                            desc: language === 'en-US' ? 'Sunny' : '晴',
                            wind: 10,
                            humidity: 50,
                            code: '100',
                        },
                    },
            );
        } finally {
            if (!background) {
                setWeatherRefreshing(false);
            }
        }
    }, [language]);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const raw = localStorage.getItem(WEATHER_CACHE_KEY);
        let hasCached = false;

        if (raw) {
            try {
                const cached = JSON.parse(raw);
                if (Date.now() - cached.ts < WEATHER_TTL) {
                    setWeather({ loading: false, data: cached.data });
                    hasCached = true;
                }
            } catch {
                // ignore malformed cache
            }
        }

        if (!hasCached) {
            void refreshWeather({ background: false });
        }

        const interval = setInterval(() => {
            void refreshWeather({ background: true });
        }, WEATHER_TTL);

        return () => clearInterval(interval);
    }, [refreshWeather]);

    useEffect(() => {
        if (previousLanguageRef.current !== language) {
            previousLanguageRef.current = language;
            void refreshWeather({ background: true });
        }
    }, [language, refreshWeather]);

    return {
        now,
        weather,
        weatherRefreshing,
        refreshWeather,
    };
}
