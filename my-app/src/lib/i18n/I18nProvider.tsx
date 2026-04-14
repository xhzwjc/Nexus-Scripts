'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Language, Translations } from './types';
import { zhCN } from './translations/zh-CN';
import { enUS } from './translations/en-US';

const LANGUAGE_STORAGE_KEY = 'i18n_language';
const DEFAULT_LANGUAGE: Language = 'zh-CN';
let currentLanguageRef: Language = DEFAULT_LANGUAGE;

// Translation map
const translations: Record<Language, Translations> = {
    'zh-CN': zhCN,
    'en-US': enUS,
};

// Context type
interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: Translations;
}

// Create context
const I18nContext = createContext<I18nContextType | null>(null);

// Provider component
interface I18nProviderProps {
    children: React.ReactNode;
    defaultLanguage?: Language;
}

export function I18nProvider({ children, defaultLanguage }: I18nProviderProps) {
    const [language, setLanguageState] = useState<Language>(defaultLanguage || DEFAULT_LANGUAGE);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize language from localStorage
    useEffect(() => {
        const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
        if (savedLanguage && (savedLanguage === 'zh-CN' || savedLanguage === 'en-US')) {
            setLanguageState(savedLanguage);
            currentLanguageRef = savedLanguage;
        } else {
            currentLanguageRef = defaultLanguage || DEFAULT_LANGUAGE;
        }
        setIsInitialized(true);
    }, [defaultLanguage]);

    // Set language and persist to localStorage
    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
        currentLanguageRef = lang;
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }, []);

    useEffect(() => {
        currentLanguageRef = language;
    }, [language]);

    // Get current translations
    const t = useMemo(() => translations[language], [language]);

    // Context value
    const value = useMemo(
        () => ({
            language,
            setLanguage,
            t,
        }),
        [language, setLanguage, t]
    );

    // Prevent flash of wrong language on initial load
    if (!isInitialized) {
        return null;
    }

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Custom hook
export function useI18n(): I18nContextType {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
}

export function getCurrentLanguage(): Language {
    return currentLanguageRef;
}

// Export types
export type { Language, Translations };
