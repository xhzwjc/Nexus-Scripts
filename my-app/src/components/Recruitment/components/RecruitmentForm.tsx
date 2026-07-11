"use client";

import React from "react";

import {cn} from "@/lib/utils";

export const recruitmentFormInputClass =
    "h-[34px] rounded-[4px] border-[#E6E7EB] bg-white px-[12px] text-[13px] font-normal leading-[20px] text-[#0E1114] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:border-blue-400 dark:focus-visible:ring-blue-400/20";

export const recruitmentFormTextareaClass =
    "min-h-[168px] resize-y border-0 bg-transparent px-[16px] py-[12px] text-[13px] font-normal leading-[24px] text-[#0E1114] shadow-none placeholder:text-[#B0B2B8] focus-visible:ring-0 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500";

export const recruitmentFormControlClass = "w-full max-w-[500px]";

export const recruitmentFormShortControlClass = "w-full max-w-[150px]";

export function RecruitmentFormSection({
    id,
    index,
    title,
    description,
    children,
    className,
}: {
    id?: string;
    index: number;
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section id={id} className={cn("scroll-mt-6 rounded-[8px] border border-[#EBEEF5] bg-white p-5 shadow-[0_1px_2px_rgba(14,17,20,0.03)] dark:border-slate-800 dark:bg-slate-950 sm:p-6", className)}>
            <div className="mb-5 flex items-start gap-3 border-b border-[#F2F3F5] pb-4 dark:border-slate-800">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-[12px] font-semibold text-white">
                    {index}
                </div>
                <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold leading-6 text-[#0E1114] dark:text-slate-50">{title}</h3>
                    {description ? (
                        <p className="mt-0.5 text-[11px] leading-[18px] text-[#86888F] dark:text-slate-400">{description}</p>
                    ) : null}
                </div>
            </div>
            <div className="space-y-5">{children}</div>
        </section>
    );
}

export function RecruitmentFieldRow({
    label,
    children,
    className,
    error,
    hint,
    required = false,
}: {
    label: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    error?: string | null;
    hint?: React.ReactNode;
    required?: boolean;
}) {
    return (
        <div className={cn("grid min-w-0 gap-y-1.5 sm:grid-cols-[106px_minmax(0,1fr)] sm:items-start sm:gap-x-3", className)}>
            <div className="whitespace-nowrap pt-[7px] text-[12px] leading-[20px] text-[#33353D] dark:text-slate-400 sm:text-right">
                {required ? <span className="mr-0.5 text-[#ef4444]" aria-hidden="true">*</span> : null}
                {label}
            </div>
            <div className="min-w-0">
                {children}
                {hint ? <p className="mt-[6px] text-[11px] leading-[18px] text-[#86888F] dark:text-slate-500">{hint}</p> : null}
                {error ? <p data-recruitment-field-error className="mt-[6px] text-[12px] leading-[18px] text-[#e11d48] dark:text-rose-300">{error}</p> : null}
            </div>
        </div>
    );
}

export function RecruitmentSegmentedGroup({
    value,
    options,
    onChange,
    className,
    buttonClassName,
}: {
    value: string;
    options: Array<{value: string; label: string; disabled?: boolean}>;
    onChange: (value: string) => void;
    className?: string;
    buttonClassName?: string;
}) {
    return (
        <div className={cn("flex flex-wrap gap-[11px]", className)}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        disabled={option.disabled}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "h-[34px] min-w-[116px] rounded-[4px] border px-[18px] text-[12px] font-medium leading-[20px] transition disabled:cursor-not-allowed disabled:opacity-50",
                            active
                                ? "border-[#1E3BFA] bg-[#1E3BFA]/5 text-[#1E3BFA] dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
                                : "border-[#E6E7EB] bg-white text-[#33353D] hover:border-[#1E3BFA]/40 hover:bg-[#F7F8FA] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-slate-900",
                            buttonClassName,
                        )}
                    >
                        <span className="block truncate">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export function RecruitmentTextareaMeter({
    value,
    maxLength,
    children,
    helper,
    className,
}: {
    value: string;
    maxLength: number;
    children: React.ReactNode;
    helper?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("w-full max-w-[500px] rounded-[4px] border border-[#E6E7EB] bg-white focus-within:border-[#1E3BFA] focus-within:ring-2 focus-within:ring-[#1E3BFA]/10 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-blue-400 dark:focus-within:ring-blue-400/20", className)}>
            {children}
            <div className="flex min-h-[32px] items-center justify-between gap-3 px-[16px] pb-[8px] text-[11px] leading-[18px] text-[#86888F] dark:text-slate-500">
                <span className="min-w-0 truncate">{helper}</span>
                <span className={cn("shrink-0 tabular-nums", value.length >= maxLength ? "text-[#e11d48]" : "")}>
                    {value.length}/{maxLength}
                </span>
            </div>
        </div>
    );
}

export function RecruitmentToggleRow({
    checked,
    disabled,
    title,
    description,
    onChange,
}: {
    checked: boolean;
    disabled?: boolean;
    title: React.ReactNode;
    description?: React.ReactNode;
    onChange: (checked: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                "flex w-full items-start justify-between gap-4 rounded-[6px] border border-[#E6E7EB] bg-white px-[14px] py-[10px] text-left transition dark:border-slate-700 dark:bg-slate-950",
                disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-[#1E3BFA]/40 hover:bg-[#F7F8FA] dark:hover:border-blue-700 dark:hover:bg-slate-900",
            )}
        >
            <span className="min-w-0">
                <span className="block text-[12px] font-medium leading-[20px] text-[#0E1114] dark:text-slate-100">{title}</span>
                {description ? (
                    <span className="mt-[4px] block text-[11px] leading-[18px] text-[#86888F] dark:text-slate-500">{description}</span>
                ) : null}
            </span>
            <span
                className={cn(
                    "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition",
                    checked ? "bg-[#1E3BFA]" : "bg-[#E6E7EB] dark:bg-slate-700",
                )}
            >
                <span
                    className={cn(
                        "h-4 w-4 rounded-full bg-white shadow-sm transition",
                        checked ? "translate-x-4" : "translate-x-0",
                    )}
                />
            </span>
        </button>
    );
}

export function RecruitmentFormAnchorRail({
    items,
    className,
}: {
    items: Array<{href: string; label: string}>;
    className?: string;
}) {
    const [activeHref, setActiveHref] = React.useState(() => items[0]?.href ?? "");

    const updateActiveHref = React.useCallback(() => {
        if (!items.length || typeof document === "undefined") {
            return;
        }

        const sections = items
            .map((item) => ({
                href: item.href,
                element: document.getElementById(item.href.replace(/^#/, "")),
            }))
            .filter((item): item is {href: string; element: HTMLElement} => Boolean(item.element));

        if (!sections.length) {
            return;
        }

        const anchorLine = 180;
        const containingAnchor = sections.find(({element}) => {
            const rect = element.getBoundingClientRect();
            return rect.top <= anchorLine && rect.bottom > anchorLine;
        });

        if (containingAnchor) {
            setActiveHref(containingAnchor.href);
            return;
        }

        const nearest = sections.reduce((best, item) => {
            const top = item.element.getBoundingClientRect().top;
            const score = top >= anchorLine ? top - anchorLine : Math.abs(top - anchorLine) + 10000;
            return score < best.score ? {href: item.href, score} : best;
        }, {href: sections[0].href, score: Number.POSITIVE_INFINITY});

        setActiveHref(nearest.href);
    }, [items]);

    React.useEffect(() => {
        setActiveHref((current) => (items.some((item) => item.href === current) ? current : items[0]?.href ?? ""));
    }, [items]);

    React.useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        let frameId = 0;
        const scheduleUpdate = () => {
            if (frameId) {
                return;
            }
            frameId = window.requestAnimationFrame(() => {
                frameId = 0;
                updateActiveHref();
            });
        };

        scheduleUpdate();
        window.addEventListener("scroll", scheduleUpdate, true);
        window.addEventListener("resize", scheduleUpdate);

        return () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
            window.removeEventListener("scroll", scheduleUpdate, true);
            window.removeEventListener("resize", scheduleUpdate);
        };
    }, [updateActiveHref]);

    return (
        <nav className={cn("sticky top-6 space-y-1 text-[14px] leading-[20px]", className)} aria-label="Position form sections">
            {items.map((item) => {
                const active = item.href === activeHref;
                return (
                    <button
                        key={item.href}
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                            setActiveHref(item.href);
                            const target = document.getElementById(item.href.replace(/^#/, ""));
                            target?.scrollIntoView({behavior: "smooth", block: "start"});
                            window.setTimeout(updateActiveHref, 260);
                        }}
                        className={cn(
                            "block w-full border-l-2 px-3 py-2 text-left transition",
                            active
                                ? "border-[#1E3BFA] text-[#1E3BFA] dark:text-blue-300"
                                : "border-transparent text-[#86888F] hover:border-[#1E3BFA]/40 hover:text-[#33353D] dark:text-slate-400 dark:hover:text-slate-200",
                        )}
                    >
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
}
