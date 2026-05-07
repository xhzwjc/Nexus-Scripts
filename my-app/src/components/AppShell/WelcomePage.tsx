'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n';
import type { User, ViewType } from '@/lib/types';

interface WelcomePageProps {
    currentUser: User | null;
    onNavigate: (view: ViewType) => void;
}

export function WelcomePage({ currentUser, onNavigate }: WelcomePageProps) {
    return (
        <div className="size-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            <div className="text-center space-y-6 px-8 animate-[fadeIn_0.8s_ease-out]">
                <div className="space-y-3">
                    <h1 className="text-6xl tracking-tight text-slate-900 dark:text-slate-100">
                        欢迎
                    </h1>
                    <div className="h-0.5 w-16 bg-slate-400 dark:bg-slate-600 mx-auto"></div>
                </div>

                <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                    开启您的精彩旅程
                </p>

                <button
                    onClick={() => onNavigate('ai-recruitment')}
                    className="mt-8 px-8 py-3 bg-slate-900 dark:bg-slate-700 text-white rounded-full hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors duration-300"
                >
                    开始探索
                </button>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}

export function WelcomePageSkeleton() {
    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center animate-pulse">
            <div className="text-center space-y-6">
                <div className="h-4 bg-muted rounded-full w-32 mx-auto" />
                <div className="h-16 bg-muted rounded-lg w-80 mx-auto" />
                <div className="h-10 bg-muted rounded-full w-36 mx-auto" />
            </div>
        </div>
    );
}

export function WelcomePageUnauthorized({ message }: { message?: string }) {
    const { language } = useI18n();
    const isZh = language === 'zh-CN';

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
            <div className="text-center space-y-3">
                <h2 className="text-[22px] font-semibold text-foreground tracking-tight">
                    {message || (isZh ? '暂无权限' : 'No Permission')}
                </h2>
                <p className="text-[15px] text-muted-foreground font-normal">
                    {isZh ? '请联系管理员配置权限' : 'Please contact admin for permissions'}
                </p>
            </div>
        </div>
    );
}