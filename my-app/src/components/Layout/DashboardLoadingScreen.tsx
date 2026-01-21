'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface DashboardLoadingScreenProps {
    onComplete?: () => void;
    minDisplayTime?: number; // 最小显示时间 (ms)
}

export const DashboardLoadingScreen: React.FC<DashboardLoadingScreenProps> = ({
    onComplete,
    minDisplayTime = 1500
}) => {
    const { t } = useI18n();
    const [progress, setProgress] = useState(0);
    const [loadingText, setLoadingText] = useState('');

    // 加载文本序列
    const loadingTexts = [
        t.common?.loading || '正在加载...',
        '加载系统配置...',
        '准备界面组件...',
        '即将完成...'
    ];

    useEffect(() => {
        const startTime = Date.now();
        let currentTextIndex = 0;

        // 进度动画
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                const elapsed = Date.now() - startTime;
                const targetProgress = Math.min((elapsed / minDisplayTime) * 100, 95);
                const step = (targetProgress - prev) * 0.1;
                return prev + Math.max(step, 0.5);
            });
        }, 50);

        // 文本切换
        const textInterval = setInterval(() => {
            currentTextIndex = (currentTextIndex + 1) % loadingTexts.length;
            setLoadingText(loadingTexts[currentTextIndex]);
        }, 600);

        setLoadingText(loadingTexts[0]);

        // 确保最小显示时间后立即完成
        const completeTimer = setTimeout(() => {
            setProgress(100);
            clearInterval(progressInterval);
            clearInterval(textInterval);
            onComplete?.(); // 立即触发，无额外延迟
        }, minDisplayTime);

        return () => {
            clearInterval(progressInterval);
            clearInterval(textInterval);
            clearTimeout(completeTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minDisplayTime, onComplete]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
            {/* Logo 区域 */}
            <div className="relative mb-8">
                {/* 光晕效果 */}
                <div className="absolute inset-0 blur-3xl bg-primary/20 rounded-full scale-150 animate-pulse" />

                {/* Logo 容器 */}
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-xl border border-primary/20 flex items-center justify-center shadow-2xl shadow-primary/10">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                </div>
            </div>

            {/* 品牌名称 */}
            <h1 className="text-2xl font-bold text-foreground mb-2 tracking-tight">
                ScriptHub
            </h1>

            {/* 加载进度条 */}
            <div className="w-64 h-1.5 bg-muted/50 rounded-full overflow-hidden mb-4 backdrop-blur-sm">
                <div
                    className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* 加载文本 */}
            <p className="text-sm text-muted-foreground animate-pulse min-h-[20px]">
                {loadingText}
            </p>

            {/* 底部装饰 */}
            <div className="absolute bottom-8 text-xs text-muted-foreground/50">
                v2.0
            </div>
        </div>
    );
};

export default DashboardLoadingScreen;
