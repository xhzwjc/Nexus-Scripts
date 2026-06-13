"use client";

import React from "react";

import {cn} from "@/lib/utils";

export const recruitmentFormInputClass =
    "h-[34px] rounded-[4px] border-[#d5dee9] bg-white px-[12px] text-[14px] font-normal leading-[20px] text-[#303846] shadow-none placeholder:text-[#c2cad4] focus-visible:border-[#11aaa5] focus-visible:ring-2 focus-visible:ring-[#11aaa5]/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20";

export const recruitmentFormTextareaClass =
    "min-h-[168px] resize-y border-0 bg-transparent px-[16px] py-[12px] text-[14px] font-normal leading-[26px] text-[#303846] shadow-none placeholder:text-[#c2cad4] focus-visible:ring-0 dark:bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500";

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
        <section id={id} className={cn("scroll-mt-6", className)}>
            <div className="mb-[24px] flex items-start gap-[10px]">
                <div className="w-[20px] shrink-0 text-right text-[32px] font-medium leading-[34px] text-[#0fa7a2] dark:text-teal-300">
                    {index}
                </div>
                <div className="min-w-0 pt-[1px]">
                    <h3 className="text-[20px] font-semibold leading-[26px] text-[#1f2937] dark:text-slate-50">{title}</h3>
                    {description ? (
                        <p className="mt-[3px] text-[12px] leading-[18px] text-[#8b98a8] dark:text-slate-400">{description}</p>
                    ) : null}
                </div>
            </div>
            <div className="space-y-[24px] pl-0 sm:pl-[35px]">{children}</div>
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
        <div className={cn("grid min-w-0 gap-y-[6px] sm:grid-cols-[84px_minmax(0,1fr)] sm:items-start sm:gap-x-[10px]", className)}>
            <div className="whitespace-nowrap pt-[7px] text-[14px] leading-[20px] text-[#8793a3] dark:text-slate-400 sm:text-right">
                {required ? <span className="mr-0.5 text-[#ef4444]" aria-hidden="true">*</span> : null}
                {label}
            </div>
            <div className="min-w-0">
                {children}
                {hint ? <p className="mt-[6px] text-[12px] leading-[18px] text-[#8b98a8] dark:text-slate-500">{hint}</p> : null}
                {error ? <p className="mt-[6px] text-[12px] leading-[18px] text-[#e11d48] dark:text-rose-300">{error}</p> : null}
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
                            "h-[34px] min-w-[116px] rounded-[4px] border px-[18px] text-[14px] font-medium leading-[20px] transition disabled:cursor-not-allowed disabled:opacity-50",
                            active
                                ? "border-[#c6f0ed] bg-[#e7f8f6] text-[#08918d] dark:border-teal-700/70 dark:bg-teal-950/40 dark:text-teal-200"
                                : "border-[#d8e1ea] bg-white text-[#1f2937] hover:border-[#b8deda] hover:bg-[#f5fbfa] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-700/70 dark:hover:bg-slate-900",
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
        <div className={cn("w-full max-w-[500px] rounded-[4px] border border-[#d5dee9] bg-white focus-within:border-[#11aaa5] focus-within:ring-2 focus-within:ring-[#11aaa5]/15 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-teal-400 dark:focus-within:ring-teal-400/20", className)}>
            {children}
            <div className="flex min-h-[32px] items-center justify-between gap-3 px-[16px] pb-[8px] text-[12px] leading-[18px] text-[#8b98a8] dark:text-slate-500">
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
                "flex w-full items-start justify-between gap-4 rounded-[4px] border border-[#d8e1ea] bg-white px-[14px] py-[10px] text-left transition dark:border-slate-700 dark:bg-slate-950",
                disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-[#b8deda] hover:bg-[#f7fbfb] dark:hover:border-teal-700/70 dark:hover:bg-slate-900",
            )}
        >
            <span className="min-w-0">
                <span className="block text-[14px] font-medium leading-[20px] text-[#1f2937] dark:text-slate-100">{title}</span>
                {description ? (
                    <span className="mt-[4px] block text-[12px] leading-[18px] text-[#8b98a8] dark:text-slate-500">{description}</span>
                ) : null}
            </span>
            <span
                className={cn(
                    "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition",
                    checked ? "bg-[#0fa7a2]" : "bg-[#d8e1ea] dark:bg-slate-700",
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
                                ? "border-[#0fa7a2] text-[#0fa7a2] dark:text-teal-300"
                                : "border-transparent text-[#7b8794] hover:border-[#b8deda] hover:text-[#1f2937] dark:text-slate-400 dark:hover:text-slate-200",
                        )}
                    >
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
}
