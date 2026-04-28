'use client';

import React from 'react';
import {
    BriefcaseBusiness,
    Users,
    FileSearch,
    Calendar,
    Plus,
    Upload,
    ClipboardCheck,
    Sparkles,
    ArrowRight,
    Bot,
    Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { recruitmentApi } from '@/lib/recruitment-api';
import type { User, ViewType } from '@/lib/types';

interface WelcomePageStats {
    positions: number;
    recruitingPositions: number;
    candidates: number;
    pendingScreening: number;
    pendingInterview: number;
    todayNewResumes: number;
}

interface WelcomePageProps {
    currentUser: User | null;
    onNavigate: (view: ViewType) => void;
}

const EMPTY_STATS: WelcomePageStats = {
    positions: 0,
    recruitingPositions: 0,
    candidates: 0,
    pendingScreening: 0,
    pendingInterview: 0,
    todayNewResumes: 0,
};

export function WelcomePage({ currentUser, onNavigate }: WelcomePageProps) {
    const [stats, setStats] = React.useState<WelcomePageStats>(EMPTY_STATS);
    const [statsLoading, setStatsLoading] = React.useState(true);

    // 从招聘 API 获取统计数据
    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const data = await recruitmentApi<{ cards: Record<string, number>; todo?: { pendingInterview?: number }; todayNewResumes?: number }>('/dashboard');
                if (cancelled) return;
                const cards = data?.cards || {};
                setStats({
                    positions: cards.positions_total ?? 0,
                    recruitingPositions: cards.positions_recruiting ?? 0,
                    candidates: cards.candidates_total ?? 0,
                    pendingScreening: cards.pending_screening ?? 0,
                    pendingInterview: data?.todo?.pendingInterview ?? 0,
                    todayNewResumes: data?.todayNewResumes ?? 0,
                });
            } catch {
                // 静默失败，保持默认值
            } finally {
                if (!cancelled) setStatsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const { t, language } = useI18n();
    const isZh = language === 'zh-CN';

    // 时间问候语
    const hour = new Date().getHours();
    let greeting = isZh ? '晚上好' : 'Good evening';
    if (hour < 6) greeting = isZh ? '夜深了' : 'Late night';
    else if (hour < 12) greeting = isZh ? '早上好' : 'Good morning';
    else if (hour < 14) greeting = isZh ? '中午好' : 'Good afternoon';
    else if (hour < 18) greeting = isZh ? '下午好' : 'Good afternoon';

    // 计算待办总数
    const todoCount = stats.pendingScreening + stats.pendingInterview;

    const tr = React.useMemo(
        () => ({
            greeting: isZh ? `${greeting}，` : `${greeting}, `,
            welcome: isZh ? '欢迎使用 AI 招聘系统' : 'Welcome to AI Recruitment System',
            todoPrefix: isZh ? '您有' : 'You have ',
            todoSuffix: isZh ? '项待办事项' : ' todo items',
            positions: isZh ? '岗位管理' : 'Positions',
            positionsDesc: isZh ? '管理招聘岗位' : 'Manage job positions',
            candidates: isZh ? '候选人' : 'Candidates',
            candidatesDesc: isZh ? '管理候选人' : 'Manage candidates',
            pendingScreening: isZh ? '待初筛' : 'Pending Screening',
            pendingScreeningDesc: isZh ? '等待初筛评分' : 'Waiting for screening',
            pendingInterview: isZh ? '待面试' : 'Pending Interview',
            pendingInterviewDesc: isZh ? '等待安排面试' : 'Waiting for interview',
            quickActions: isZh ? '快捷操作' : 'Quick Actions',
            newPosition: isZh ? '新增岗位' : 'New Position',
            uploadResume: isZh ? '上传简历' : 'Upload Resume',
            batchScreen: isZh ? '批量初筛' : 'Batch Screen',
            openAssistant: isZh ? '打开 AI 助手' : 'Open AI Assistant',
            todayNew: isZh ? '今日新增' : 'Today',
            resumes: isZh ? '份简历' : ' resumes',
            viewAll: isZh ? '查看全部' : 'View All',
            noPermission: isZh ? '暂无权限访问招聘系统' : 'No permission to access recruitment system',
            contactAdmin: isZh ? '请联系管理员配置权限' : 'Please contact admin for permissions',
        }),
        [isZh, greeting]
    );

    // 数据卡片配置
    const statCards = [
        {
            key: 'positions',
            title: tr.positions,
            value: stats.recruitingPositions,
            total: stats.positions,
            icon: BriefcaseBusiness,
            color: 'text-blue-600',
            bgColor: 'bg-blue-50 dark:bg-blue-950/30',
            borderColor: 'border-blue-200 dark:border-blue-900',
            onClick: () => onNavigate('ai-recruitment'),
        },
        {
            key: 'candidates',
            title: tr.candidates,
            value: stats.candidates,
            icon: Users,
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
            borderColor: 'border-emerald-200 dark:border-emerald-900',
            onClick: () => onNavigate('ai-recruitment'),
        },
        {
            key: 'pendingScreening',
            title: tr.pendingScreening,
            value: stats.pendingScreening,
            icon: FileSearch,
            color: 'text-amber-600',
            bgColor: 'bg-amber-50 dark:bg-amber-950/30',
            borderColor: 'border-amber-200 dark:border-amber-900',
            badge: stats.pendingScreening > 0,
            onClick: () => onNavigate('ai-recruitment'),
        },
        {
            key: 'pendingInterview',
            title: tr.pendingInterview,
            value: stats.pendingInterview,
            icon: Calendar,
            color: 'text-purple-600',
            bgColor: 'bg-purple-50 dark:bg-purple-950/30',
            borderColor: 'border-purple-200 dark:border-purple-900',
            badge: stats.pendingInterview > 0,
            onClick: () => onNavigate('ai-recruitment'),
        },
    ];

    // 快捷操作配置
    const quickActions = [
        {
            key: 'newPosition',
            label: tr.newPosition,
            icon: Plus,
            onClick: () => onNavigate('ai-recruitment'),
            color: 'bg-blue-600 hover:bg-blue-700',
        },
        {
            key: 'uploadResume',
            label: tr.uploadResume,
            icon: Upload,
            onClick: () => onNavigate('ai-recruitment'),
            color: 'bg-emerald-600 hover:bg-emerald-700',
        },
        {
            key: 'batchScreen',
            label: tr.batchScreen,
            icon: ClipboardCheck,
            onClick: () => onNavigate('ai-recruitment'),
            color: 'bg-amber-600 hover:bg-amber-700',
        },
        {
            key: 'openAssistant',
            label: tr.openAssistant,
            icon: Bot,
            onClick: () => onNavigate('ai-recruitment'),
            color: 'bg-violet-600 hover:bg-violet-700',
        },
    ];

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            {/* 欢迎头部 */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground tracking-tight">
                    {tr.greeting}
                    {currentUser?.name || (isZh ? '访客' : 'Guest')}
                </h1>
                <p className="text-lg text-muted-foreground">{tr.welcome}</p>
                {todoCount > 0 && (
                    <div className="flex items-center gap-2 pt-2">
                        <Badge
                            variant="secondary"
                            className="text-base px-3 py-1 bg-amber-100 text-amber-700 border-amber-200"
                        >
                            {tr.todoPrefix}
                            {todoCount}
                            {tr.todoSuffix}
                        </Badge>
                    </div>
                )}
            </div>

            {/* 数据概览卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="animate-pulse">
                            <CardContent className="p-5">
                                <div className="space-y-3">
                                    <div className="h-4 bg-muted rounded w-1/3"></div>
                                    <div className="h-8 bg-muted rounded w-1/2"></div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    statCards.map((card) => (
                    <Card
                        key={card.key}
                        className={cn(
                            'cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
                            card.borderColor
                        )}
                        onClick={card.onClick}
                    >
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">{card.title}</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-bold">{card.value}</span>
                                        {card.total !== undefined && card.total > card.value && (
                                            <span className="text-sm text-muted-foreground">
                                                /{card.total}
                                            </span>
                                        )}
                                    </div>
                                    {card.key === 'positions' && stats.todayNewResumes > 0 && (
                                        <p className="text-xs text-emerald-600">
                                            +{stats.todayNewResumes} {tr.todayNew} {tr.resumes}
                                        </p>
                                    )}
                                </div>
                                <div
                                    className={cn(
                                        'p-3 rounded-xl',
                                        card.bgColor,
                                        card.color
                                    )}
                                >
                                    <card.icon className="w-6 h-6" />
                                </div>
                            </div>
                            {card.badge && (
                                <div className="mt-3 flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                    </span>
                                    <span className="text-xs text-red-600 font-medium">
                                        {isZh ? '需要处理' : 'Needs attention'}
                                    </span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))
                )}
            </div>

            {/* 快捷操作 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">{tr.quickActions}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {quickActions.map((action) => (
                            <Button
                                key={action.key}
                                onClick={action.onClick}
                                className={cn(
                                    'h-auto py-4 flex flex-col items-center gap-2 rounded-xl',
                                    action.color
                                )}
                            >
                                <action.icon className="w-6 h-6" />
                                <span className="text-sm font-medium">{action.label}</span>
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* AI 助手提示 */}
            <Card className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-violet-200 dark:border-violet-900">
                <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-violet-100 dark:bg-violet-900/50 rounded-xl">
                                <Sparkles className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground">
                                    {isZh ? 'AI 招聘助手' : 'AI Recruiting Assistant'}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {isZh
                                        ? '使用自然语言快速生成 JD、筛选候选人、安排面试'
                                        : 'Use natural language to generate JDs, screen candidates, schedule interviews'}
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={() => onNavigate('ai-recruitment')}
                            variant="outline"
                            className="shrink-0 border-violet-300 hover:bg-violet-100 dark:border-violet-800 dark:hover:bg-violet-900/50"
                        >
                            {isZh ? '立即体验' : 'Try Now'}
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 底部提示 */}
            <div className="text-center text-sm text-muted-foreground pt-4">
                {isZh
                    ? '如需访问更多功能，请切换到标准首页或联系管理员'
                    : 'To access more features, switch to standard homepage or contact admin'}
            </div>
        </div>
    );
}

// 加载状态
export function WelcomePageSkeleton() {
    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8 animate-pulse">
            <div className="space-y-2">
                <div className="h-9 bg-muted rounded w-1/3"></div>
                <div className="h-6 bg-muted rounded w-1/2"></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-32 bg-muted rounded-xl"></div>
                ))}
            </div>
            <div className="h-48 bg-muted rounded-xl"></div>
        </div>
    );
}

// 无权限状态
export function WelcomePageUnauthorized({ message }: { message?: string }) {
    const { language } = useI18n();
    const isZh = language === 'zh-CN';

    return (
        <div className="max-w-6xl mx-auto p-6 flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                    <BriefcaseBusiness className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">
                    {message || (isZh ? '暂无权限' : 'No Permission')}
                </h2>
                <p className="text-muted-foreground">
                    {isZh ? '请联系管理员配置权限' : 'Please contact admin for permissions'}
                </p>
            </div>
        </div>
    );
}
