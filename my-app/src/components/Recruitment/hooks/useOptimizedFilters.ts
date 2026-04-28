"use client";

import { useMemo, useRef, useCallback } from 'react';
import type { PositionSummary, CandidateSummary, AITaskLog } from '@/lib/recruitment-api';
import { resolveCandidateDisplayStatus, isToday, withinDays } from '../utils';

// 使用 Map 进行快速查找的状态索引
interface CandidateStatusIndex {
    [status: string]: Set<number>; // candidate id set
}

// 优化后的候选人筛选 Hook
export function useOptimizedCandidateFilters(
    candidates: CandidateSummary[],
    filters: {
        positionFilter: string;
        statusFilter: string;
        sourceFilter: string;
        timeFilter: string;
        matchFilter: string;
        query: string;
    }
) {
    const indexRef = useRef<{
        byPosition: Map<string | null, Set<number>>;
        byStatus: Map<string, Set<number>>;
        bySource: Map<string, Set<number>>;
        byTimeRange: {
            today: Set<number>;
            last7Days: Set<number>;
            last30Days: Set<number>;
        };
        byMatchRange: {
            above80: Set<number>;
            above60: Set<number>;
            above40: Set<number>;
        };
    } | null>(null);
    
    // 构建索引 (仅在候选人数据变化时重建)
    const indexedCandidates = useMemo(() => {
        const byPosition = new Map<string | null, Set<number>>();
        const byStatus = new Map<string, Set<number>>();
        const bySource = new Map<string, Set<number>>();
        const byTimeRange = {
            today: new Set<number>(),
            last7Days: new Set<number>(),
            last30Days: new Set<number>(),
        };
        const byMatchRange = {
            above80: new Set<number>(),
            above60: new Set<number>(),
            above40: new Set<number>(),
        };
        
        candidates.forEach(candidate => {
            // 按岗位索引
            const positionId = candidate.position_id?.toString() || null;
            if (!byPosition.has(positionId)) {
                byPosition.set(positionId, new Set());
            }
            byPosition.get(positionId)!.add(candidate.id);
            
            // 按状态索引
            const status = resolveCandidateDisplayStatus(candidate);
            if (!byStatus.has(status)) {
                byStatus.set(status, new Set());
            }
            byStatus.get(status)!.add(candidate.id);
            
            // 按来源索引
            const source = candidate.source || '未知来源';
            if (!bySource.has(source)) {
                bySource.set(source, new Set());
            }
            bySource.get(source)!.add(candidate.id);
            
            // 按时间索引
            if (isToday(candidate.created_at)) {
                byTimeRange.today.add(candidate.id);
            }
            if (withinDays(candidate.created_at, 7)) {
                byTimeRange.last7Days.add(candidate.id);
            }
            if (withinDays(candidate.created_at, 30)) {
                byTimeRange.last30Days.add(candidate.id);
            }
            
            // 按匹配度索引
            const match = candidate.match_percent ?? 0;
            if (match >= 80) {
                byMatchRange.above80.add(candidate.id);
            } else if (match >= 60) {
                byMatchRange.above60.add(candidate.id);
            } else if (match >= 40) {
                byMatchRange.above40.add(candidate.id);
            }
        });
        
        indexRef.current = {
            byPosition,
            byStatus,
            bySource,
            byTimeRange,
            byMatchRange,
        };
        
        return candidates;
    }, [candidates]);
    
    // 执行筛选
    const visibleCandidates = useMemo(() => {
        const {
            positionFilter,
            statusFilter,
            sourceFilter,
            timeFilter,
            matchFilter,
            query,
        } = filters;
        
        const normalizedQuery = query.trim().toLowerCase();
        const index = indexRef.current;
        
        // 快速路径：使用索引进行初步筛选
        let candidateIds: Set<number> | null = null;
        
        if (positionFilter !== 'all' && index?.byPosition.has(positionFilter)) {
            candidateIds = new Set(index.byPosition.get(positionFilter));
        }
        
        if (statusFilter !== 'all' && index?.byStatus.has(statusFilter)) {
            const statusIds = index.byStatus.get(statusFilter)!;
            candidateIds = candidateIds 
                ? new Set([...candidateIds].filter(id => statusIds.has(id)))
                : new Set(statusIds);
        }
        
        if (sourceFilter !== 'all' && index?.bySource.has(sourceFilter)) {
            const sourceIds = index.bySource.get(sourceFilter)!;
            candidateIds = candidateIds
                ? new Set([...candidateIds].filter(id => sourceIds.has(id)))
                : new Set(sourceIds);
        }
        
        if (timeFilter !== 'all' && index) {
            const timeIds = timeFilter === 'today' ? index.byTimeRange.today
                : timeFilter === '7d' ? index.byTimeRange.last7Days
                : timeFilter === '30d' ? index.byTimeRange.last30Days
                : null;
            if (timeIds) {
                candidateIds = candidateIds
                    ? new Set([...candidateIds].filter(id => timeIds.has(id)))
                    : new Set(timeIds);
            }
        }
        
        if (matchFilter !== 'all' && index) {
            const matchIds = matchFilter === '80+' ? index.byMatchRange.above80
                : matchFilter === '60+' ? index.byMatchRange.above60
                : matchFilter === '40+' ? index.byMatchRange.above40
                : null;
            if (matchIds) {
                candidateIds = candidateIds
                    ? new Set([...candidateIds].filter(id => matchIds.has(id)))
                    : new Set(matchIds);
            }
        }
        
        // 获取候选列表
        let result: CandidateSummary[];
        if (candidateIds) {
            result = candidates.filter(c => candidateIds!.has(c.id));
        } else {
            result = candidates;
        }
        
        // 关键词搜索 (无法使用索引)
        if (normalizedQuery) {
            result = result.filter(candidate => {
                return [
                    candidate.name,
                    candidate.phone,
                    candidate.email,
                    candidate.current_company,
                ].some(value => String(value || '').toLowerCase().includes(normalizedQuery));
            });
        }
        
        return result;
    }, [candidates, filters, indexRef.current]);
    
    return visibleCandidates;
}

// 优化后的岗位筛选 Hook
export function useOptimizedPositionFilters(
    positions: PositionSummary[],
    filters: {
        statusFilter: string;
        query: string;
    }
) {
    const visiblePositions = useMemo(() => {
        const { statusFilter, query } = filters;
        const normalizedQuery = query.trim().toLowerCase();
        
        // 预分配结果数组，避免多次 push
        const result: PositionSummary[] = [];
        
        for (let i = 0; i < positions.length; i++) {
            const position = positions[i];
            
            // 状态筛选
            if (statusFilter !== 'all' && position.status !== statusFilter) {
                continue;
            }
            
            // 关键词筛选
            if (normalizedQuery) {
                const match = [
                    position.title,
                    position.department,
                    position.location,
                    position.summary,
                ].some(value => String(value || '').toLowerCase().includes(normalizedQuery));
                
                if (!match) {
                    continue;
                }
            }
            
            result.push(position);
        }
        
        return result;
    }, [positions, filters.statusFilter, filters.query]);
    
    return visiblePositions;
}

// 优化后的审计日志筛选 Hook
export function useOptimizedLogFilters(
    logs: AITaskLog[],
    filters: {
        taskTypeFilter: string;
        statusFilter: string;
    }
) {
    const visibleLogs = useMemo(() => {
        const { taskTypeFilter, statusFilter } = filters;
        
        if (taskTypeFilter === 'all' && statusFilter === 'all') {
            return logs;
        }
        
        return logs.filter(log => {
            if (taskTypeFilter !== 'all' && log.task_type !== taskTypeFilter) {
                return false;
            }
            if (statusFilter !== 'all' && log.status !== statusFilter) {
                return false;
            }
            return true;
        });
    }, [logs, filters.taskTypeFilter, filters.statusFilter]);
    
    return visibleLogs;
}

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
            
            switch (status) {
                case 'pending_screening':
                    pendingScreening++;
                    break;
                case 'pending_interview':
                    pendingInterview++;
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

// 防抖筛选 Hook
export function useDebouncedFilter<T>(
    items: T[],
    filterFn: (item: T) => boolean,
    debounceMs: number = 150
): T[] {
    const lastFilterTime = useRef(0);
    const cachedResult = useRef<T[]>(items);
    const pendingFilter = useRef<number | null>(null);
    
    const result = useMemo(() => {
        const now = Date.now();
        
        // 如果距离上次筛选时间太短，返回缓存结果
        if (now - lastFilterTime.current < debounceMs) {
            if (pendingFilter.current) {
                clearTimeout(pendingFilter.current);
            }
            pendingFilter.current = window.setTimeout(() => {
                cachedResult.current = items.filter(filterFn);
                lastFilterTime.current = Date.now();
            }, debounceMs);
            return cachedResult.current;
        }
        
        const filtered = items.filter(filterFn);
        cachedResult.current = filtered;
        lastFilterTime.current = now;
        return filtered;
    }, [items, filterFn, debounceMs]);
    
    return result;
}
