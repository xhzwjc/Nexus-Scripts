"use client";

import React from "react";
import { Loader2, Search } from "lucide-react";

import type { AITaskLog, CandidateSummary, PositionSummary, RecruitmentSkill } from "@/lib/recruitment-api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { panelClass } from "../types";
import { formatNavBadgeCount } from "../utils";

/* ═══════════════ HoverRevealText ═══════════════ */

export function HoverRevealText({
    text,
    className,
    tooltipClassName,
}: {
    text?: string | number | null;
    className?: string;
    tooltipClassName?: string;
}) {
    const value = String(text ?? "-").trim() || "-";

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className={cn("block min-w-0 truncate", className)}>{value}</span>
            </TooltipTrigger>
            <TooltipContent className={cn("max-w-md whitespace-pre-wrap break-all text-white", tooltipClassName)}>
                {value}
            </TooltipContent>
        </Tooltip>
    );
}

/* ═══════════════ SearchField ═══════════════ */

export function SearchField({
    value,
    onChange,
    placeholder,
    inputClassName,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    inputClassName?: string;
}) {
    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
                className={cn("pl-9", inputClassName)}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />
        </div>
    );
}

/* ═══════════════ NativeSelect ═══════════════ */

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={cn(
                "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]",
                props.className,
            )}
        />
    );
}

/* ═══════════════ Field ═══════════════ */

export function Field({
    label,
    children,
    className,
}: {
    label: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("min-w-0 space-y-2", className)}>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
            {children}
        </div>
    );
}

/* ═══════════════ MetricCard ═══════════════ */

export function MetricCard({
    title,
    value,
    description,
    icon: Icon,
}: {
    title: string;
    value: number | string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
}) {
    return (
        <Card className={cn(panelClass, "gap-4 px-0 py-0")}>
            <CardContent className="flex items-start justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                    <p className="break-words text-[13px] text-slate-500 dark:text-slate-400">{title}</p>
                    <p className="mt-2 text-[2rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
                    <p className="mt-1.5 break-words text-[11px] leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <div className="shrink-0 rounded-2xl bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <Icon className="h-4.5 w-4.5" />
                </div>
            </CardContent>
        </Card>
    );
}

/* ═══════════════ TodoCard ═══════════════ */

export function TodoCard({
    title,
    value,
    description,
}: {
    title: string;
    value: number;
    description: string;
}) {
    return (
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
            <p className="mt-2 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    );
}

/* ═══════════════ QuickActionCard ═══════════════ */

export function QuickActionCard({
    title,
    description,
    icon: Icon,
    onClick,
}: {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="break-words text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                    <p className="mt-1.5 break-words text-[13px] leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <div className="shrink-0 rounded-2xl bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <Icon className="h-4.5 w-4.5" />
                </div>
            </div>
        </button>
    );
}

/* ═══════════════ SectionNavButton ═══════════════ */

export function SectionNavButton({
    active,
    icon: Icon,
    title,
    description,
    count,
    collapsed = false,
    onClick,
}: {
    active: boolean;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    count?: number;
    collapsed?: boolean;
    onClick: () => void;
}) {
    const badgeCountText = formatNavBadgeCount(count);
    const buttonNode = (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
                "w-full rounded-[22px] border transition",
                collapsed ? "relative mx-auto flex h-11 w-11 items-center justify-center rounded-2xl p-0" : "px-3 py-3.5 text-left",
                active
                    ? "border-slate-900 bg-slate-900 text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.75)] dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:shadow-[0_14px_28px_-18px_rgba(255,255,255,0.25)]"
                    : "border-slate-200/80 bg-white/80 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/70",
            )}
        >
            {collapsed ? (
                <>
                    <Icon className="h-4.5 w-4.5" />
                    {badgeCountText ? (
                        <span
                            className={cn(
                                "absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold leading-4 text-slate-700 shadow-[0_6px_14px_-8px_rgba(15,23,42,0.45)] ring-2 ring-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-950",
                            )}
                        >
                            {badgeCountText}
                        </span>
                    ) : null}
                </>
            ) : (
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div
                            className={cn("rounded-2xl p-2", active ? "bg-white/10 dark:bg-slate-200" : "bg-slate-100 dark:bg-slate-900")}>
                            <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold">{title}</p>
                            <p className={cn("mt-1 text-xs leading-5", active ? "text-white/75 dark:text-slate-700" : "text-slate-500 dark:text-slate-400")}>
                                {description}
                            </p>
                        </div>
                    </div>
                    {badgeCountText ? (
                        <Badge
                            className={cn("rounded-full border", active ? "border-white/20 bg-white/10 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                            {badgeCountText}
                        </Badge>
                    ) : null}
                </div>
            )}
        </button>
    );

    if (!collapsed) {
        return buttonNode;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>{buttonNode}</TooltipTrigger>
            <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                {title}
            </TooltipContent>
        </Tooltip>
    );
}

/* ═══════════════ SettingsEntry ═══════════════ */

export function SettingsEntry({
    title,
    description,
    onClick,
}: {
    title: string;
    description: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="w-full rounded-2xl px-4 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
            onClick={onClick}
        >
            <p className="font-medium text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </button>
    );
}

/* ═══════════════ MiniStat ═══════════════ */

export function MiniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
        </div>
    );
}

/* ═══════════════ InfoTile ═══════════════ */

export function InfoTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-2 break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-200">{value}</p>
        </div>
    );
}

/* ═══════════════ LoadingCard ═══════════════ */

export function LoadingCard({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {label}
        </div>
    );
}

/* ═══════════════ LoadingPanel ═══════════════ */

export function LoadingPanel({ label }: { label: string }) {
    return (
        <div className="flex h-full min-h-[320px] items-center justify-center">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                {label}
            </div>
        </div>
    );
}

/* ═══════════════ EmptyState ═══════════════ */

export function EmptyState({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="rounded-[22px] border border-dashed border-slate-200 px-5 py-8 text-center dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    );
}

/* ═══════════════ buildLogObjectLabel ═══════════════ */

export function buildLogObjectLabel(
    log: AITaskLog,
    positionMap: Map<number, PositionSummary>,
    candidateMap: Map<number, CandidateSummary>,
    skillMap: Map<number, RecruitmentSkill>,
) {
    if (log.related_candidate_id) {
        return candidateMap.get(log.related_candidate_id)?.name || `候选人 #${log.related_candidate_id}`;
    }
    if (log.related_position_id) {
        return positionMap.get(log.related_position_id)?.title || `岗位 #${log.related_position_id}`;
    }
    if (log.related_skill_id) {
        return skillMap.get(log.related_skill_id)?.name || `Skill #${log.related_skill_id}`;
    }
    return "系统任务";
}
