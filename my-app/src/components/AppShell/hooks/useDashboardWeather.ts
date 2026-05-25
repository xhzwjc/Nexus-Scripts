'use client';

import { useCallback, useEffect, useState } from 'react';

import { WEATHER_CACHE_KEY, WEATHER_TTL } from '@/lib/config';
import type { WeatherData, WeatherState } from '@/lib/types';

type DashboardWeatherLocation = {
    query: string;
    label: string;
    cacheKey: string;
};

type WeatherCachePayload = {
    ts: number;
    language: string;
    locationKey: string;
    data: WeatherData;
};

type LocationCachePayload = {
    ts: number;
    language: string;
    location: DashboardWeatherLocation;
};

type QWeatherNowPayload = {
    code?: string;
    now?: {
        temp?: string;
        text?: string;
        windSpeed?: string;
        humidity?: string;
        icon?: string;
    };
};

type QWeatherCityPayload = {
    code?: string;
    location?: Array<{
        id?: string;
        name?: string;
        adm1?: string;
        adm2?: string;
    }>;
};

const DEFAULT_WEATHER_LOCATION_ID = '101010100';
const WEATHER_LOCATION_CACHE_KEY = `${WEATHER_CACHE_KEY}:location`;
const LOCATION_TTL = 24 * 60 * 60 * 1000;

function getDefaultLocation(language: string): DashboardWeatherLocation {
    return {
        query: DEFAULT_WEATHER_LOCATION_ID,
        label: language === 'en-US' ? 'Beijing' : '北京',
        cacheKey: DEFAULT_WEATHER_LOCATION_ID,
    };
}

function readLocationCache(language: string): DashboardWeatherLocation | null {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(WEATHER_LOCATION_CACHE_KEY);
        if (!raw) {
            return null;
        }
        const cached = JSON.parse(raw) as Partial<LocationCachePayload>;
        const location = cached.location;
        if (
            typeof cached.ts === 'number'
            && cached.language === language
            && Date.now() - cached.ts < LOCATION_TTL
            && location
            && typeof location.query === 'string'
            && typeof location.label === 'string'
            && typeof location.cacheKey === 'string'
        ) {
            return location;
        }
    } catch {
        // Ignore malformed cache.
    }
    return null;
}

function writeLocationCache(language: string, location: DashboardWeatherLocation) {
    try {
        window.localStorage.setItem(
            WEATHER_LOCATION_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), language, location } satisfies LocationCachePayload),
        );
    } catch {
        // Ignore storage failures.
    }
}

function formatCoordinate(value: number) {
    return Number.isFinite(value) ? value.toFixed(2) : '';
}

async function getBrowserCoordinates(): Promise<GeolocationCoordinates | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return null;
    }
    try {
        if ('permissions' in navigator) {
            const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            if (permission.state === 'denied') {
                return null;
            }
        }
    } catch {
        // Some browsers do not expose geolocation through Permissions API.
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve(position.coords),
            () => resolve(null),
            {
                enableHighAccuracy: false,
                maximumAge: LOCATION_TTL,
                timeout: 4500,
            },
        );
    });
}

function buildWeatherUrl(apiHost: string, location: string, apiLang: string) {
    const url = new URL(`https://${apiHost}/v7/weather/now`);
    url.searchParams.set('location', location);
    url.searchParams.set('lang', apiLang);
    return url.toString();
}

function buildCityLookupUrl(apiHost: string, location: string, apiLang: string) {
    const url = new URL(`https://${apiHost}/geo/v2/city/lookup`);
    url.searchParams.set('location', location);
    url.searchParams.set('lang', apiLang);
    return url.toString();
}

async function resolveWeatherLocationFromBrowser(
    apiHost: string,
    apiKey: string,
    apiLang: string,
    language: string,
): Promise<DashboardWeatherLocation | null> {
    const coords = await getBrowserCoordinates();
    if (!coords) {
        return null;
    }
    const longitude = formatCoordinate(coords.longitude);
    const latitude = formatCoordinate(coords.latitude);
    if (!longitude || !latitude) {
        return null;
    }
    const coordinateQuery = `${longitude},${latitude}`;

    try {
        const response = await fetch(buildCityLookupUrl(apiHost, coordinateQuery, apiLang), {
            headers: { 'X-QW-Api-Key': apiKey },
        });
        const payload = (await response.json()) as QWeatherCityPayload;
        const city = payload.location?.[0];
        if (payload.code === '200' && city?.id && city.name) {
            return {
                query: city.id,
                label: city.name,
                cacheKey: city.id,
            };
        }
    } catch {
        // Coordinates can still be used directly by the weather endpoint.
    }

    return {
        query: coordinateQuery,
        label: language === 'en-US' ? 'Current location' : '当前位置',
        cacheKey: coordinateQuery,
    };
}

function parseWeatherPayload(payload: QWeatherNowPayload, language: string): WeatherData {
    return {
        temp: parseInt(payload.now?.temp || '', 10),
        desc: payload.now?.text || (language === 'en-US' ? 'Unknown' : '未知'),
        wind: parseFloat(payload.now?.windSpeed || '0'),
        humidity: parseInt(payload.now?.humidity || '0', 10),
        code: payload.now?.icon || '999',
    };
}

function readWeatherCache(language: string, locationKey: string): WeatherData | null {
    try {
        const raw = window.localStorage.getItem(WEATHER_CACHE_KEY);
        if (!raw) {
            return null;
        }
        const cached = JSON.parse(raw) as Partial<WeatherCachePayload>;
        if (
            typeof cached.ts === 'number'
            && cached.language === language
            && cached.locationKey === locationKey
            && Date.now() - cached.ts < WEATHER_TTL
            && cached.data
        ) {
            return cached.data;
        }
    } catch {
        // Ignore malformed cache.
    }
    return null;
}

function writeWeatherCache(language: string, locationKey: string, data: WeatherData) {
    try {
        window.localStorage.setItem(
            WEATHER_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), language, locationKey, data } satisfies WeatherCachePayload),
        );
    } catch {
        // Ignore storage failures.
    }
}

export function useDashboardWeather(language: string, isLocked: boolean) {
    const [now, setNow] = useState<Date>(new Date());
    const [weatherLocation, setWeatherLocation] = useState<DashboardWeatherLocation>(() => (
        readLocationCache(language) || getDefaultLocation(language)
    ));
    const [weather, setWeather] = useState<WeatherState>({ loading: true });
    const [weatherRefreshing, setWeatherRefreshing] = useState(false);

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
                buildWeatherUrl(apiHost, weatherLocation.query, apiLang),
                { headers: { 'X-QW-Api-Key': apiKey } },
            );
            const data = (await response.json()) as QWeatherNowPayload;
            if (data.code !== '200') {
                throw new Error(data.code);
            }

            const parsed = parseWeatherPayload(data, language);
            setWeather({ loading: false, data: parsed });
            writeWeatherCache(language, weatherLocation.cacheKey, parsed);
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
    }, [language, weatherLocation.cacheKey, weatherLocation.query]);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const cachedLocation = readLocationCache(language);
        setWeatherLocation(cachedLocation || getDefaultLocation(language));
    }, [language]);

    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_HEWEATHER_API_KEY;
        const apiHost = process.env.NEXT_PUBLIC_HEWEATHER_HOST;
        if (!apiKey || !apiHost) {
            return;
        }
        let cancelled = false;
        const apiLang = language === 'en-US' ? 'en' : 'zh';

        void resolveWeatherLocationFromBrowser(apiHost, apiKey, apiLang, language).then((location) => {
            if (cancelled || !location) {
                return;
            }
            writeLocationCache(language, location);
            setWeatherLocation((current) => (
                current.cacheKey === location.cacheKey && current.label === location.label ? current : location
            ));
        });

        return () => {
            cancelled = true;
        };
    }, [language]);

    useEffect(() => {
        const cached = readWeatherCache(language, weatherLocation.cacheKey);
        const hasCached = Boolean(cached);
        if (cached) {
            setWeather({ loading: false, data: cached });
        }

        if (!hasCached) {
            void refreshWeather({ background: false });
        }

        const interval = setInterval(() => {
            if (isLocked) return;
            void refreshWeather({ background: true });
        }, WEATHER_TTL);

        return () => clearInterval(interval);
    }, [refreshWeather, isLocked, language, weatherLocation.cacheKey]);

    return {
        now,
        weather,
        weatherRefreshing,
        weatherLocationLabel: weatherLocation.label,
        refreshWeather,
    };
}
