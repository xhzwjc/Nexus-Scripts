"use client";

import { useMemo } from 'react';
import type { PositionSummary, CandidateSummary, AITaskLog } from '@/lib/recruitment-api';
import { resolveCandidateDisplayStatus, isToday } from '../utils';
import { INTERVIEW_TODO_STATUS_VALUES } from '../workflowStages';

const INTERVIEW_TODO_STATUS_SET = new Set<string>(INTERVIEW_TODO_STATUS_VALUES);

// 优化后的统计计算 Hook
export function useOptimizedStats(
    positions: PositionSummary[],
    candidates: CandidateSummary[],
    logs: AITaskLog[]
) {
    const stats = useMemo(() => {
        // 单次遍历完成所有统计
        let recruitingPositions = 0;
        let draftPositions = 0;
        let pendingScreening = 0;
        let pendingInterview = 0;
        let pendingOffer = 0;
        let screeningPassed = 0;
        let todayNewResumes = 0;
        let recentAiTasks = 0;

        const statusDistribution = new Map<string, number>();

        // 统计岗位
        for (const position of positions) {
            if (position.status === 'recruiting') {
                recruitingPositions++;
            } else if (position.status === 'draft') {
                draftPositions++;
            }
        }

        // 统计候选人
        for (const candidate of candidates) {
            const status = resolveCandidateDisplayStatus(candidate);
            statusDistribution.set(status, (statusDistribution.get(status) || 0) + 1);

            if (status === 'pending_interview' || INTERVIEW_TODO_STATUS_SET.has(status)) {
                pendingInterview++;
            }

            switch (status) {
                case 'pending_screening':
                    pendingScreening++;
                    break;
                case 'pending_offer':
                    pendingOffer++;
                    break;
                case 'screening_passed':
                case 'interview_passed':
                case 'offer_sent':
                case 'hired':
                    screeningPassed++;
                    break;
            }

            if (isToday(candidate.created_at)) {
                todayNewResumes++;
            }
        }

        // 统计 AI 任务
        for (const log of logs) {
            if (isToday(log.created_at)) {
                recentAiTasks++;
            }
        }

        return {
            cards: {
                positions_total: positions.length,
                positions_recruiting: recruitingPositions,
                candidates_total: candidates.length,
                pending_screening: pendingScreening,
                screening_passed: screeningPassed,
                recent_ai_tasks: recentAiTasks,
            },
            todo: {
                pendingPublish: draftPositions,
                pendingScreening,
                pendingInterview,
                pendingDecision: pendingOffer,
            },
            todayNewResumes,
            status_distribution: Array.from(statusDistribution.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([status, count]) => ({ status, count })),
        };
    }, [positions, candidates, logs]);

    return stats;
}
