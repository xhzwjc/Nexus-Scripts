"use client";

import React from "react";
import {Loader2, Search} from "lucide-react";

import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge";
import {Card, CardContent} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";

import {panelClass} from "../types";
import {formatNavBadgeCount} from "../utils";

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
            <TooltipContent
                className={cn(
                    "max-w-md whitespace-pre-wrap break-all rounded-[6px] border border-[#EBEEF5] bg-[#0E1114] px-3 py-2 text-white shadow-[0_8px_24px_rgba(14,17,20,0.16)] dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900",
                    tooltipClassName,
                )}
            >
                {value}
            </TooltipContent>
        </Tooltip>
    );
}

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
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
            <Input className={cn("pl-9", inputClassName)} value={value} onChange={(event) => onChange(event.target.value)}
                   placeholder={placeholder}/>
        </div>
    );
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={cn(
                "flex h-[34px] w-full rounded-[6px] border border-[#D6D8DD] bg-white px-3 py-1 text-sm text-[#33353D] shadow-none outline-none transition-[border-color,box-shadow] focus-visible:border-[#1E3BFA] focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                props.className,
            )}
        />
    );
}

export function Field({
                          label,
                          children,
                          className,
                          error,
                          required = false,
                      }: {
    label: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    error?: string | null;
    required?: boolean;
}) {
    return (
        <div className={cn("min-w-0 space-y-2", className)}>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {label}
                {required ? <span className="ml-1 text-rose-500" aria-hidden="true">*</span> : null}
            </p>
            {children}
            {error ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            ) : null}
        </div>
    );
}

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
        <Card className={cn(panelClass, "gap-0 px-0 py-0")}>
            <CardContent className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                    <p className="break-words text-sm text-slate-500 dark:text-slate-400">{title}</p>
                    <p className="mt-1 text-[1.75rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <div
                    className="shrink-0 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <Icon className="h-4 w-4"/>
                </div>
            </CardContent>
        </Card>
    );
}

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
        <div
            className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
            <p className="mt-1.5 break-words text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    );
}

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
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-[#171717] hover:bg-[#F5F5F5] dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600 dark:hover:bg-slate-900"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="break-words text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                    <p className="mt-1 break-words text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <div
                    className="shrink-0 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <Icon className="h-4 w-4"/>
                </div>
            </div>
        </button>
    );
}

export function SectionNavButton({
                                     active,
                                     icon: Icon,
                                     title,
                                     description,
                                     count,
                                     collapsed = false,
                                     buttonRef,
                                     onClick,
                                 }: {
    active: boolean;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    count?: number;
    collapsed?: boolean;
    buttonRef?: React.Ref<HTMLButtonElement>;
    onClick: () => void;
}) {
    const badgeCountText = formatNavBadgeCount(count);
    const buttonNode = (
        <button
            type="button"
            ref={buttonRef}
            onClick={onClick}
            title={title}
            className={cn(
                "w-full rounded-md border transition",
                collapsed
                    ? "relative mx-auto flex h-10 w-10 items-center justify-center p-0"
                    : "flex min-h-[56px] items-center justify-center px-2 py-2 text-left",
                active
                    ? "border-[#D4D4D4] bg-[#F5F5F5] text-[#171717] shadow-none dark:border-neutral-800/60 dark:bg-neutral-900/30 dark:text-neutral-200"
                    : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:border-slate-800 dark:hover:bg-slate-900",
            )}
        >
            {collapsed ? (
                <>
                    <Icon className="h-4.5 w-4.5"/>
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
                <div className="flex w-full items-center justify-between gap-2.5 self-center">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div
                            className={cn("rounded-md p-2", active ? "bg-white text-[#171717] dark:bg-neutral-400/20 dark:text-neutral-200" : "bg-slate-100 dark:bg-slate-900")}>
                            <Icon className="h-4 w-4"/>
                        </div>
                        <div className="min-w-0 self-center">
                            <p className="text-sm font-medium">{title}</p>
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
            <TooltipContent side="right" className="rounded-[6px] px-3 py-2 text-xs">
                {title}
            </TooltipContent>
        </Tooltip>
    );
}

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
            className="w-full rounded-[8px] px-4 py-4 text-left transition hover:bg-[#F7F8FA] dark:hover:bg-slate-900"
            onClick={onClick}
        >
            <p className="font-medium text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </button>
    );
}

export function MiniStat({label, value}: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
        </div>
    );
}

export function InfoTile({label, value}: { label: string; value: string }) {
    return (
        <div
            className="min-w-0 overflow-hidden rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] font-normal text-[#86888F] dark:text-slate-400">{label}</p>
            <p className="mt-1.5 break-words text-[13px] leading-5 text-[#33353D] [overflow-wrap:anywhere] dark:text-slate-200">{value}</p>
        </div>
    );
}

export function LoadingCard({label}: { label: string }) {
    return (
        <div className="flex min-h-[320px] flex-1 items-center justify-center">
            <div
                className="flex items-center gap-2 rounded-[8px] border border-dashed border-[#D6D8DD] px-4 py-8 text-sm text-[#86888F] dark:border-slate-800 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin"/>
                {label}
            </div>
        </div>
    );
}

export function LoadingPanel({label}: { label: string }) {
    return (
        <div className="flex h-full min-h-[320px] items-center justify-center">
            <div
                className="flex items-center gap-2 rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-3 text-sm text-[#33353D] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin"/>
                {label}
            </div>
        </div>
    );
}

export function EmptyState({
                               title,
                               description,
                           }: {
    title: string;
    description: string;
}) {
    return (
        <div
            className="rounded-[8px] border border-dashed border-[#D6D8DD] bg-[#F7F8FA]/60 px-5 py-8 text-center dark:border-slate-800 dark:bg-slate-900/30">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    );
}
