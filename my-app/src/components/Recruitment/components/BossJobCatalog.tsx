"use client";

import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ChevronDown, Search} from "lucide-react";

import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

import rawBossJobCatalog from "../data/zwlx.json";

export const BOSS_RECRUIT_TYPES = ["社招全职", "应届校园招聘", "实习生招聘", "兼职招聘"] as const;
export const BOSS_EXPERIENCE_OPTIONS = ["不限", "1年以内", "1-3年", "3-5年", "5-10年", "10年以上"] as const;
export const BOSS_EDUCATION_OPTIONS = ["不限", "初中及以下", "中专/中技", "高中", "大专", "本科", "硕士", "博士"] as const;
export const BOSS_SALARY_MONTH_OPTIONS = [
    "12个月",
    "13个月",
    "14个月",
    "15个月",
    "16个月",
    "17个月",
    "18个月",
    "19个月",
    "20个月",
    "21个月",
    "22个月",
    "23个月",
    "24个月",
] as const;
export const BOSS_SALARY_K_OPTIONS = Array.from({length: 250}, (_, index) => index + 1);

const BOSS_SALARY_MAX_K_OPTIONS = [...BOSS_SALARY_K_OPTIONS, 260];

export function getBossSalaryMaxKOptions(minK: number | null | undefined) {
    const normalizedMinK = Number(minK);
    if (!Number.isFinite(normalizedMinK)) {
        return [];
    }
    return BOSS_SALARY_MAX_K_OPTIONS
        .filter((value) => value > normalizedMinK)
        .slice(0, 5);
}

export function normalizeBossSalarySelection(minK: number | null | undefined, maxK: number | null | undefined) {
    const normalizedMinK = Number(minK);
    const salaryMinK = Number.isFinite(normalizedMinK) && BOSS_SALARY_K_OPTIONS.includes(normalizedMinK)
        ? normalizedMinK
        : null;
    const maxOptions = getBossSalaryMaxKOptions(salaryMinK);
    const normalizedMaxK = Number(maxK);
    const salaryMaxK = (() => {
        if (!maxOptions.length) {
            return null;
        }
        if (!Number.isFinite(normalizedMaxK)) {
            return maxOptions[0];
        }
        if (maxOptions.includes(normalizedMaxK)) {
            return normalizedMaxK;
        }
        return maxOptions.find((value) => value >= normalizedMaxK) ?? maxOptions[maxOptions.length - 1];
    })();

    return {
        minK: salaryMinK,
        maxK: salaryMaxK,
    };
}

const BOSS_JOB_META_TAG_PREFIX = "__boss_job_meta:";

export type BossJobPath = [string, string, string];

export type BossJobFlatItem = {
    first: string;
    second: string;
    third: string;
    path: BossJobPath;
};

export type BossPositionSalary = {
    minK: number | null;
    maxK: number | null;
    months: string;
};

export type BossPositionMeta = {
    jobType: string;
    jobTypePath: BossJobPath | [];
    experience: string;
    education: string;
    salary: BossPositionSalary;
    autoPublish: boolean;
};

export type BossRecommendedJob = {
    enabled: boolean;
    jobName: string;
    recruitType: string;
    jobDescription: string;
    jobType: string;
    jobTypePath: BossJobPath;
    experience: string;
    education: string;
    salary: {
        minK: number;
        maxK: number;
        months: string;
    };
    addressKeyword: string;
    autoPublish: boolean;
};

export type BossRecommendedJobsPayload = {
    jobs: BossRecommendedJob[];
};

type BossJobGroup = {
    name: string;
    jobs: string[];
};

type BossJobCategory = {
    name: string;
    groups: BossJobGroup[];
};

type BossJobCatalog = {
    categories: BossJobCategory[];
    flat: BossJobFlatItem[];
};

function normalizeText(value: unknown) {
    return String(value ?? "").trim();
}

export function normalizeBossJobPath(path: unknown): BossJobPath | [] {
    if (!Array.isArray(path)) {
        return [];
    }
    const parts = path.map(normalizeText).filter(Boolean);
    if (parts.length >= 3) {
        return [parts[0], parts[1], parts[2]];
    }
    if (parts.length === 2) {
        return [parts[0], parts[1], parts[1]];
    }
    return [];
}

function normalizeBossCatalog(raw: unknown): BossJobCatalog {
    const source = raw as Partial<{categories: BossJobCategory[]; flat: Array<Partial<BossJobFlatItem>>}>;
    const categories = (Array.isArray(source.categories) ? source.categories : [])
        .map((category) => ({
            name: normalizeText(category?.name),
            groups: (Array.isArray(category?.groups) ? category.groups : [])
                .map((group) => ({
                    name: normalizeText(group?.name),
                    jobs: (Array.isArray(group?.jobs) ? group.jobs : [])
                        .map(normalizeText)
                        .filter(Boolean),
                }))
                .filter((group) => group.name && group.jobs.length),
        }))
        .filter((category) => category.name && category.groups.length);

    const generatedFlat = categories.flatMap((category) => (
        category.groups.flatMap((group) => (
            group.jobs.map((job) => ({
                first: category.name,
                second: group.name,
                third: job,
                path: [category.name, group.name, job] as BossJobPath,
            }))
        ))
    ));

    const flat = (Array.isArray(source.flat) ? source.flat : [])
        .map((item) => {
            const path = normalizeBossJobPath(item?.path);
            const first = normalizeText(item?.first || path[0]);
            const second = normalizeText(item?.second || path[1]);
            const third = normalizeText(item?.third || path[2]);
            if (!first || !second || !third) {
                return null;
            }
            return {
                first,
                second,
                third,
                path: [first, second, third] as BossJobPath,
            };
        })
        .filter((item): item is BossJobFlatItem => Boolean(item));

    return {
        categories,
        flat: flat.length ? flat : generatedFlat,
    };
}

export const bossJobCatalog = normalizeBossCatalog(rawBossJobCatalog);

export const bossJobTypeSet = new Set(bossJobCatalog.flat.map((item) => item.third));
export const bossJobPathSet = new Set(bossJobCatalog.flat.map((item) => item.path.join(" / ")));

export function findBossJobByThird(value: string) {
    const normalized = normalizeText(value);
    if (!normalized) {
        return null;
    }
    return bossJobCatalog.flat.find((item) => item.third === normalized)
        || bossJobCatalog.flat.find((item) => item.third.includes(normalized) || normalized.includes(item.third))
        || null;
}

export function findClosestBossJob(value: string) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) {
        return null;
    }
    return bossJobCatalog.flat.find((item) => item.third.toLowerCase() === normalized)
        || bossJobCatalog.flat.find((item) => normalized.includes(item.third.toLowerCase()))
        || bossJobCatalog.flat.find((item) => item.third.toLowerCase().includes(normalized))
        || null;
}

function resolveBossJobForPayload(jobType: string, jobName: string, jobTypePath: unknown) {
    const normalizedPath = normalizeBossJobPath(jobTypePath);
    if (normalizedPath.length && bossJobPathSet.has(normalizedPath.join(" / "))) {
        const pathMatched = bossJobCatalog.flat.find((item) => item.path.join(" / ") === normalizedPath.join(" / "));
        if (pathMatched) {
            return pathMatched;
        }
    }

    return findClosestBossJob(jobType) || findClosestBossJob(jobName);
}

export function formatBossSalaryRange(salary: BossPositionSalary) {
    if (!Number.isFinite(salary.minK) || !Number.isFinite(salary.maxK) || !salary.months) {
        return "";
    }
    return `${salary.minK}k-${salary.maxK}k · ${salary.months}`;
}

export function parseBossSalaryRange(value?: string | null): BossPositionSalary {
    const text = normalizeText(value);
    const match = text.match(/(\d+)\s*k?\s*[-~至]\s*(\d+)\s*k?.*?(\d{2}个月)/i);
    return {
        minK: match ? Number(match[1]) : null,
        maxK: match ? Number(match[2]) : null,
        months: match ? match[3] : "12个月",
    };
}

export function stripBossMetaTags(tags: string[]) {
    return tags.filter((tag) => !tag.startsWith(BOSS_JOB_META_TAG_PREFIX));
}

export function parseBossPositionMeta(tags?: string[] | null): Partial<BossPositionMeta> {
    const metaTag = (tags || []).find((tag) => tag.startsWith(BOSS_JOB_META_TAG_PREFIX));
    if (!metaTag) {
        return {};
    }
    try {
        const parsed = JSON.parse(metaTag.slice(BOSS_JOB_META_TAG_PREFIX.length)) as Partial<BossPositionMeta>;
        return {
            jobType: normalizeText(parsed.jobType),
            jobTypePath: normalizeBossJobPath(parsed.jobTypePath),
            experience: normalizeText(parsed.experience),
            education: normalizeText(parsed.education),
            salary: {
                minK: Number.isFinite(parsed.salary?.minK) ? Number(parsed.salary?.minK) : null,
                maxK: Number.isFinite(parsed.salary?.maxK) ? Number(parsed.salary?.maxK) : null,
                months: normalizeText(parsed.salary?.months) || "12个月",
            },
            autoPublish: Boolean(parsed.autoPublish),
        };
    } catch {
        return {};
    }
}

export function mergeBossMetaTag(tags: string[], meta: BossPositionMeta) {
    const payload = JSON.stringify(meta);
    return [...stripBossMetaTags(tags), `${BOSS_JOB_META_TAG_PREFIX}${payload}`];
}

export function validateBossRecommendedJobsPayload(input: unknown): {ok: true; value: BossRecommendedJobsPayload} | {ok: false; errors: string[]} {
    const errors: string[] = [];
    const record = input as Partial<BossRecommendedJobsPayload>;
    const jobs = Array.isArray(record?.jobs) ? record.jobs : [];

    if (!jobs.length) {
        errors.push("jobs 不能为空");
    }

    const normalizedJobs = jobs.map((rawJob, index) => {
        const job = rawJob as Partial<BossRecommendedJob>;
        const prefix = `jobs[${index}]`;
        const jobName = normalizeText(job.jobName);
        const recruitType = normalizeText(job.recruitType || "社招全职");
        const jobDescription = normalizeText(job.jobDescription);
        const selectedJob = resolveBossJobForPayload(normalizeText(job.jobType), jobName, job.jobTypePath);
        const jobType = selectedJob?.third || normalizeText(job.jobType);
        const jobTypePath = normalizeBossJobPath(selectedJob?.path || job.jobTypePath);
        const experience = normalizeText(job.experience);
        const education = normalizeText(job.education);
        const minK = Number(job.salary?.minK);
        const maxK = Number(job.salary?.maxK);
        const months = normalizeText(job.salary?.months);
        const addressKeyword = normalizeText(job.addressKeyword);

        if (!jobName) errors.push(`${prefix}.jobName 必填`);
        if (!BOSS_RECRUIT_TYPES.includes(recruitType as typeof BOSS_RECRUIT_TYPES[number])) errors.push(`${prefix}.recruitType 不合法`);
        if (!jobDescription) errors.push(`${prefix}.jobDescription 必填`);
        if (!jobType || !bossJobTypeSet.has(jobType)) errors.push(`${prefix}.jobType 必须来自职位库`);
        if (!jobTypePath.length || !bossJobPathSet.has(jobTypePath.join(" / "))) errors.push(`${prefix}.jobTypePath 必须来自职位库`);
        if (!BOSS_EXPERIENCE_OPTIONS.includes(experience as typeof BOSS_EXPERIENCE_OPTIONS[number])) errors.push(`${prefix}.experience 不合法`);
        if (!BOSS_EDUCATION_OPTIONS.includes(education as typeof BOSS_EDUCATION_OPTIONS[number])) errors.push(`${prefix}.education 不合法`);
        if (!Number.isFinite(minK)) errors.push(`${prefix}.salary.minK 必须是数字`);
        if (Number.isFinite(minK) && !BOSS_SALARY_K_OPTIONS.includes(minK)) errors.push(`${prefix}.salary.minK 必须在 1k-250k 范围内`);
        if (!Number.isFinite(maxK)) errors.push(`${prefix}.salary.maxK 必须是数字`);
        if (Number.isFinite(minK) && Number.isFinite(maxK) && !getBossSalaryMaxKOptions(minK).includes(maxK)) errors.push(`${prefix}.salary.maxK 必须在最低月薪后的可选范围内`);
        if (!BOSS_SALARY_MONTH_OPTIONS.includes(months as typeof BOSS_SALARY_MONTH_OPTIONS[number])) errors.push(`${prefix}.salary.months 不合法`);
        if (!addressKeyword) errors.push(`${prefix}.addressKeyword 必填`);

        return {
            enabled: job.enabled !== false,
            jobName,
            recruitType,
            jobDescription,
            jobType,
            jobTypePath: jobTypePath as BossJobPath,
            experience,
            education,
            salary: {minK, maxK, months},
            addressKeyword,
            autoPublish: Boolean(job.autoPublish),
        };
    });

    if (errors.length) {
        return {ok: false, errors};
    }

    return {ok: true, value: {jobs: normalizedJobs}};
}

function useOutsideDismiss(open: boolean, onClose: () => void) {
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const root = rootRef.current;
            if (root && event.target instanceof Node && !root.contains(event.target)) {
                onClose();
            }
        };
        const handleWheel = (event: WheelEvent) => {
            const root = rootRef.current;
            if (root && event.target instanceof Node && !root.contains(event.target)) {
                onClose();
            }
        };
        const handleScroll = (event: Event) => {
            const root = rootRef.current;
            if (root && event.target instanceof Node && !root.contains(event.target)) {
                onClose();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        window.addEventListener("wheel", handleWheel, true);
        window.addEventListener("scroll", handleScroll, true);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            window.removeEventListener("wheel", handleWheel, true);
            window.removeEventListener("scroll", handleScroll, true);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose, open]);

    return rootRef;
}

function useCascadeState(open: boolean) {
    const firstCategory = bossJobCatalog.categories[0];
    const [activeFirst, setActiveFirst] = useState(firstCategory?.name || "");
    const [activeSecond, setActiveSecond] = useState(firstCategory?.groups[0]?.name || "");

    const activeCategory = useMemo(() => (
        bossJobCatalog.categories.find((category) => category.name === activeFirst)
        || bossJobCatalog.categories[0]
    ), [activeFirst]);

    const activeGroup = useMemo(() => (
        activeCategory?.groups.find((group) => group.name === activeSecond)
        || activeCategory?.groups[0]
    ), [activeCategory, activeSecond]);

    useEffect(() => {
        if (!open || !activeCategory) {
            return;
        }
        if (!activeCategory.groups.some((group) => group.name === activeSecond)) {
            setActiveSecond(activeCategory.groups[0]?.name || "");
        }
    }, [activeCategory, activeSecond, open]);

    return {
        activeCategory,
        activeGroup,
        activeFirst,
        activeSecond,
        setActiveFirst,
        setActiveSecond,
    };
}

function searchBossJobs(query: string) {
    const normalized = normalizeText(query).toLowerCase();
    if (!normalized) {
        return [];
    }
    return bossJobCatalog.flat
        .filter((item) => (
            item.third.toLowerCase().includes(normalized)
            || item.second.toLowerCase().includes(normalized)
            || item.first.toLowerCase().includes(normalized)
        ))
        .slice(0, 24);
}

function BossJobDropdown({
    query,
    onSelect,
    className,
}: {
    query: string;
    onSelect: (item: BossJobFlatItem) => void;
    className?: string;
}) {
    const [localQuery, setLocalQuery] = useState("");
    const displayQuery = localQuery || query;
    const searchResults = useMemo(() => searchBossJobs(displayQuery), [displayQuery]);
    const {
        activeCategory,
        activeGroup,
        activeFirst,
        activeSecond,
        setActiveFirst,
        setActiveSecond,
    } = useCascadeState(true);

    return (
        <div className={cn("absolute left-0 top-full z-50 mt-[6px] w-[660px] overflow-hidden rounded-[4px] border border-[#d5dee9] bg-white shadow-[0_18px_45px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-950", className)}>
            <div className="border-b border-[#eef2f6] p-[10px] dark:border-slate-800">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-[10px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa6b2]"/>
                    <Input
                        value={localQuery}
                        onChange={(event) => setLocalQuery(event.target.value)}
                        placeholder="搜索职位名称"
                        className="h-[32px] rounded-[4px] border-[#d5dee9] pl-[32px] text-[13px] shadow-none focus-visible:ring-[#11aaa5]/15"
                    />
                </div>
            </div>
            {displayQuery.trim() ? (
                <div className="max-h-[300px] overflow-y-auto py-[6px]">
                    {searchResults.length ? searchResults.map((item) => (
                        <button
                            key={`${item.first}-${item.second}-${item.third}`}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-[14px] py-[8px] text-left text-[14px] leading-[20px] text-[#253040] hover:bg-[#f3fbfb]"
                            onClick={() => onSelect(item)}
                        >
                            <span className="font-medium">{item.third}</span>
                            <span className="truncate text-[12px] text-[#8793a3]">{item.path.join(" / ")}</span>
                        </button>
                    )) : (
                        <div className="px-[14px] py-[18px] text-center text-[13px] text-[#8793a3]">未找到匹配职位</div>
                    )}
                </div>
            ) : (
                <div className="grid max-h-[360px] grid-cols-[180px_220px_1fr] overflow-hidden text-[14px] leading-[20px]">
                    <div className="max-h-[360px] overflow-y-auto border-r border-[#eef2f6] py-[6px] dark:border-slate-800">
                        {bossJobCatalog.categories.map((category) => (
                            <button
                                key={category.name}
                                type="button"
                                onMouseEnter={() => setActiveFirst(category.name)}
                                onClick={() => setActiveFirst(category.name)}
                                className={cn(
                                    "block w-full px-[14px] py-[8px] text-left transition",
                                    activeFirst === category.name ? "bg-[#e7f8f6] text-[#08918d]" : "text-[#253040] hover:bg-[#f7fbfb]",
                                )}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                    <div className="max-h-[360px] overflow-y-auto border-r border-[#eef2f6] py-[6px] dark:border-slate-800">
                        {(activeCategory?.groups || []).map((group) => (
                            <button
                                key={group.name}
                                type="button"
                                onMouseEnter={() => setActiveSecond(group.name)}
                                onClick={() => setActiveSecond(group.name)}
                                className={cn(
                                    "block w-full px-[14px] py-[8px] text-left transition",
                                    activeSecond === group.name ? "bg-[#e7f8f6] text-[#08918d]" : "text-[#253040] hover:bg-[#f7fbfb]",
                                )}
                            >
                                {group.name}
                            </button>
                        ))}
                    </div>
                    <div className="max-h-[360px] overflow-y-auto py-[6px]">
                        {(activeGroup?.jobs || []).map((job) => (
                            <button
                                key={job}
                                type="button"
                                className="block w-full px-[14px] py-[8px] text-left text-[#253040] transition hover:bg-[#f3fbfb] hover:text-[#08918d]"
                                onClick={() => {
                                    if (!activeCategory || !activeGroup) {
                                        return;
                                    }
                                    onSelect({
                                        first: activeCategory.name,
                                        second: activeGroup.name,
                                        third: job,
                                        path: [activeCategory.name, activeGroup.name, job],
                                    });
                                }}
                            >
                                {job}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function BossJobNameCascader({
    value,
    onChange,
    onSelect,
    placeholder,
    error,
    className,
    inputRef,
}: {
    value: string;
    onChange: (value: string) => void;
    onSelect: (item: BossJobFlatItem) => void;
    placeholder: string;
    error?: string | null;
    className?: string;
    inputRef?: React.Ref<HTMLInputElement>;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useOutsideDismiss(open, () => setOpen(false));

    const handleSelect = useCallback((item: BossJobFlatItem) => {
        onChange(item.third);
        onSelect(item);
        setOpen(false);
    }, [onChange, onSelect]);

    return (
        <div ref={rootRef} className={cn("relative", className)}>
            <Input
                ref={inputRef}
                value={value}
                onChange={(event) => {
                    onChange(event.target.value.slice(0, 200));
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                className={cn("h-[34px] rounded-[4px] border-[#d5dee9] px-[12px] text-[14px] font-normal leading-[20px] text-[#303846] shadow-none placeholder:text-[#c2cad4] focus-visible:border-[#11aaa5] focus-visible:ring-2 focus-visible:ring-[#11aaa5]/15", error && "border-[#ef4444] focus-visible:border-[#ef4444] focus-visible:ring-[#ef4444]/15")}
            />
            {open ? <BossJobDropdown query={value} onSelect={handleSelect}/> : null}
        </div>
    );
}

export function BossJobTypeSelector({
    value,
    onSelect,
    placeholder,
    error,
    className,
}: {
    value: string;
    onSelect: (item: BossJobFlatItem) => void;
    placeholder: string;
    error?: string | null;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useOutsideDismiss(open, () => setOpen(false));

    const handleSelect = useCallback((item: BossJobFlatItem) => {
        onSelect(item);
        setOpen(false);
    }, [onSelect]);

    return (
        <div ref={rootRef} className={cn("relative", className)}>
            <button
                type="button"
                className={cn(
                    "flex h-[34px] w-full items-center justify-between gap-2 rounded-[4px] border border-[#d5dee9] bg-white px-[12px] text-left text-[14px] leading-[20px] text-[#303846] transition hover:border-[#11aaa5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#11aaa5]/15",
                    !value && "text-[#c2cad4]",
                    error && "border-[#ef4444] focus-visible:ring-[#ef4444]/15",
                )}
                onClick={() => setOpen((current) => !current)}
            >
                <span className="truncate">{value || placeholder}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#9aa6b2]"/>
            </button>
            {open ? <BossJobDropdown query="" onSelect={handleSelect}/> : null}
        </div>
    );
}
