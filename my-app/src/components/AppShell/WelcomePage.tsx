'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n';
import type { User, ViewType } from '@/lib/types';

interface WelcomePageProps {
    currentUser: User | null;
    onNavigate: (view: ViewType) => void;
}

export function WelcomePage({ currentUser, onNavigate }: WelcomePageProps) {
    const { language } = useI18n();
    const isZh = language === 'zh-CN';

    const hour = new Date().getHours();
    let greeting = isZh ? '晚上好' : 'Good evening';
    if (hour < 6) greeting = isZh ? '夜深了' : 'Late night';
    else if (hour < 12) greeting = isZh ? '早上好' : 'Good morning';
    else if (hour < 14) greeting = isZh ? '中午好' : 'Good afternoon';
    else if (hour < 18) greeting = isZh ? '下午好' : 'Good afternoon';

    const features = [
        {
            title: isZh ? '智能初筛' : 'Smart Screening',
            desc: isZh
                ? 'AI 自动评估候选人，精准匹配岗位需求，节省大量筛选时间。'
                : 'AI evaluates candidates automatically, matching job requirements with precision.',
            icon: (
                <svg viewBox="0 0 36 36" fill="none" className="w-9 h-9">
                    <circle cx="18" cy="18" r="16" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 18c0-3.314 2.686-6 6-6s6 2.686 6 6-2.686 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="18" cy="18" r="2.5" fill="currentColor" />
                </svg>
            ),
        },
        {
            title: isZh ? '精准推荐' : 'Precise Matching',
            desc: isZh
                ? '基于多维画像的候选人推荐引擎，让合适的人出现在正确的岗位。'
                : 'Multi-dimensional candidate recommendation engine for the right fit every time.',
            icon: (
                <svg viewBox="0 0 36 36" fill="none" className="w-9 h-9">
                    <rect x="4" y="8" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 18h12M12 14h8M12 22h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            ),
        },
        {
            title: isZh ? '自然对话' : 'Natural Dialog',
            desc: isZh
                ? '用自然语言完成招聘全流程，无需培训，即刻上手。'
                : 'Complete the entire recruitment process with natural language. No training needed.',
            icon: (
                <svg viewBox="0 0 36 36" fill="none" className="w-9 h-9">
                    <path d="M6 26V14a2 2 0 012-2h20a2 2 0 012 2v8a2 2 0 01-2 2H14l-5 4v-2H8a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 19h12M12 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            ),
        },
    ];

    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col">
            {/* Hero */}
            <section className="flex flex-col items-center justify-center px-6 pt-24 pb-20 text-center">
                <p className="text-[13px] tracking-[0.08em] uppercase text-muted-foreground mb-4 font-normal">
                    {greeting}
                    {currentUser?.name ? (
                        <span className="text-foreground ml-1">{currentUser.name}</span>
                    ) : null}
                </p>

                <h1 className="text-[52px] md:text-[64px] font-semibold tracking-tight leading-[1.07] text-foreground mb-5 max-w-[560px]">
                    {isZh ? (
                        <>AI 驱动的<br />智能招聘</>
                    ) : (
                        <>AI-Powered<br />Recruitment</>
                    )}
                </h1>

                <p className="text-[17px] text-muted-foreground leading-relaxed max-w-[440px] mb-10 font-normal">
                    {isZh
                        ? '用人工智能重新定义招聘流程，让每一次人才决策更高效、更精准。'
                        : 'Redefine recruitment with AI. Make every talent decision faster and more precise.'}
                </p>

                <div className="flex items-center gap-5 flex-wrap justify-center">
                    <button
                        onClick={() => onNavigate('ai-recruitment')}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 text-[15px] font-normal transition-colors duration-200"
                    >
                        {isZh ? '开始使用' : 'Get Started'}
                    </button>
                    <button
                        onClick={() => onNavigate('ai-recruitment')}
                        className="text-blue-600 hover:text-blue-700 text-[15px] font-normal flex items-center gap-0.5 transition-colors duration-200"
                    >
                        {isZh ? '了解更多' : 'Learn more'}
                        <span className="text-[18px] leading-none ml-0.5">›</span>
                    </button>
                </div>
            </section>

            {/* Divider */}
            <div className="mx-6 h-px bg-border" />

            {/* Features */}
            <section className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
                {features.map((feature) => (
                    <div key={feature.title} className="flex flex-col gap-3 px-10 py-10">
                        <div className="text-blue-600 mb-1">{feature.icon}</div>
                        <h3 className="text-[17px] font-semibold text-foreground tracking-tight">
                            {feature.title}
                        </h3>
                        <p className="text-[13px] text-muted-foreground leading-[1.55] font-normal">
                            {feature.desc}
                        </p>
                    </div>
                ))}
            </section>

            {/* Divider */}
            <div className="mx-6 h-px bg-border" />

            {/* Footer hint */}
            <p className="text-center text-[12px] text-muted-foreground/60 py-6">
                {isZh ? '切换至标准首页可访问完整功能' : 'Switch to standard homepage for full features'}
            </p>
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