'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { Button } from './button';
import { useI18n, type Language } from '@/lib/i18n';

interface LanguageSwitcherProps {
    variant?: 'default' | 'compact';
    className?: string;
}

export function LanguageSwitcher({ variant = 'default', className = '' }: LanguageSwitcherProps) {
    const { language, setLanguage, t } = useI18n();

    const toggleLanguage = () => {
        const newLang: Language = language === 'zh-CN' ? 'en-US' : 'zh-CN';
        setLanguage(newLang);
    };

    if (variant === 'compact') {
        return (
            <Button
                variant="ghost"
                size="icon"
                onClick={toggleLanguage}
                className={`text-slate-500 hover:text-blue-600 hover:bg-blue-50 ${className}`}
                title={t.language.switchTo}
            >
                <Languages className="w-5 h-5" />
            </Button>
        );
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={toggleLanguage}
            className={`text-slate-500 hover:text-blue-600 hover:bg-blue-50 gap-2 ${className}`}
            title={t.language.switchTo}
        >
            <Languages className="w-4 h-4" />
            <span className="font-medium text-xs">
                {language === 'zh-CN' ? '中 / En' : 'En / 中'}
            </span>
        </Button>
    );
}
