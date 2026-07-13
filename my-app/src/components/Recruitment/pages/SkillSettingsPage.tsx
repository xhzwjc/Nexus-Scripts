"use client";

import React from "react";
import {Loader2, Plus, Search, Sparkles} from "lucide-react";

import type {RecruitmentSkill} from "@/lib/recruitment-api";
import {useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";

import {EmptyState, LoadingPanel} from "../components/SharedComponents";
import {formatDateTime, shortText} from "../utils";
import type {SkillTaskKind} from "../types";

type SkillSettingsPageProps = {
    skillsLoading: boolean;
    skills: Array<RecruitmentSkill & {
        content_preview?: string | null;
        dimension_count?: number;
    }>;
    skillDetailLoadingId: number | null;
    query: string;
    taskFilter: "all" | SkillTaskKind;
    total: number;
    pageIndex: number;
    pageSize: number;
    canManageSkill: boolean;
    openSkillEditor: (skill?: RecruitmentSkill) => void;
    openSkillEditorByTaskKind: (taskKind: SkillTaskKind) => void;
    openSkillEditorWithAI: (boundPositionId?: number | null) => void;
    toggleSkill: (skillId: number, enabled: boolean) => Promise<void>;
    setSkillDeleteTarget: (skill: RecruitmentSkill) => void;
    onQueryChange: (query: string) => void;
    onTaskFilterChange: (taskFilter: "all" | SkillTaskKind) => void;
    onPageChange: (pageIndex: number) => void;
};

const taskTone: Record<string, string> = {
    screening: "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]",
    jd: "bg-[rgba(12,201,145,0.1)] text-[#0B9F75]",
    interview: "bg-[rgba(255,171,36,0.12)] text-[#D48806]",
};

export function SkillSettingsPage({
    skillsLoading,
    skills,
    skillDetailLoadingId,
    query,
    taskFilter,
    total,
    pageIndex,
    pageSize,
    canManageSkill,
    openSkillEditor,
    openSkillEditorByTaskKind,
    openSkillEditorWithAI,
    toggleSkill,
    setSkillDeleteTarget,
    onQueryChange,
    onTaskFilterChange,
    onPageChange,
}: SkillSettingsPageProps) {
    const {t, language} = useI18n();
    const isZh = language === "zh-CN";
    const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const taskTypeLabels = React.useMemo<Record<SkillTaskKind, string>>(() => ({
        screening: t.recruitment.taskTypeScreening,
        jd: t.recruitment.taskTypeJd,
        interview: t.recruitment.taskTypeInterview,
    }), [t.recruitment.taskTypeInterview, t.recruitment.taskTypeJd, t.recruitment.taskTypeScreening]);
    const filteredSkills = skills;
    const createOptions = React.useMemo(() => ([
        {kind: "screening" as const, title: isZh ? "初筛评估方案" : "Screening Assessment", description: isZh ? "用于简历初筛评分：维度、满分与硬性要求" : "Define scoring dimensions, weights, and hard requirements."},
        {kind: "jd" as const, title: isZh ? "JD 分析方案" : "JD Analysis", description: isZh ? "约束 JD 生成的结构、语气与必备栏目" : "Guide the structure and tone of generated job descriptions."},
        {kind: "interview" as const, title: isZh ? "面试题评估方案" : "Interview Question Plan", description: isZh ? "控制面试题模块划分与出题重点" : "Control interview question sections and evaluation focus."},
    ]), [isZh]);

    return (
        <section aria-labelledby="settings-skills-title">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h1 id="settings-skills-title" className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">
                        {isZh ? "评估方案管理" : "Assessment Plan Management"}
                    </h1>
                    <p className="text-[12px] leading-5 text-[#B0B2B8] dark:text-slate-400">
                        {isZh ? "管理员可以在这里维护招聘领域评估方案，供 AI 评估和题目生成使用。" : "Maintain reusable recruiting assessment plans for AI evaluation and question generation."}
                    </p>
                </div>
                <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                    <div className="relative w-full sm:w-[260px]">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]"/>
                        <Input
                            value={query}
                            placeholder={isZh ? "搜索方案名称、岗位或标签" : "Search name, position, or tag"}
                            className="h-9 rounded-[4px] border-[#E6E7EB] bg-white pl-9 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-[#1E3BFA]/15"
                            onChange={(event) => onQueryChange(event.target.value)}
                        />
                    </div>
                    <select
                        aria-label={isZh ? "按方案类型筛选" : "Filter by plan type"}
                        className="h-9 min-w-[140px] rounded-[4px] border border-[#E6E7EB] bg-white px-3 text-[12px] text-[#33353D] outline-none transition focus:border-[#1E3BFA] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        value={taskFilter}
                        onChange={(event) => onTaskFilterChange(event.target.value as "all" | SkillTaskKind)}
                    >
                        <option value="all">{isZh ? "全部类型" : "All types"}</option>
                        <option value="screening">{t.recruitment.taskTypeScreening}</option>
                        <option value="jd">{t.recruitment.taskTypeJd}</option>
                        <option value="interview">{t.recruitment.taskTypeInterview}</option>
                    </select>
                    {canManageSkill ? (
                        <>
                        <Button variant="outline" className="h-9 rounded-[6px] border-[#1E3BFA] bg-white px-4 text-[13px] font-normal text-[#0F23D9] shadow-none hover:bg-[rgba(30,59,250,0.05)]" onClick={() => openSkillEditorWithAI(null)}>
                            <Sparkles className="h-3.5 w-3.5"/>
                            {isZh ? "AI 生成" : "Generate with AI"}
                        </Button>
                        <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={() => setCreateDialogOpen(true)}>
                            <Plus className="h-3.5 w-3.5"/>
                            {t.recruitment.newSkill}
                        </Button>
                        </>
                    ) : null}
                </div>
            </div>

            {skillsLoading ? (
                <div className="rounded-[8px] border border-[#EBEEF5] px-6 py-16 dark:border-slate-800">
                    <LoadingPanel label={t.common.loading}/>
                </div>
            ) : filteredSkills.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                    {filteredSkills.map((skill) => {
                        const taskTypes = (skill.task_types || []) as SkillTaskKind[];
                        const meta = [
                            skill.dimension_count ? (isZh ? `维度 ${skill.dimension_count}` : `${skill.dimension_count} dimensions`) : null,
                            skill.bound_position_title ? (isZh ? `岗位：${skill.bound_position_title}` : `Position: ${skill.bound_position_title}`) : null,
                            `${isZh ? "更新于" : "Updated"} ${formatDateTime(skill.updated_at || skill.created_at)}`,
                            skill.updated_by || skill.created_by || null,
                        ].filter(Boolean).join(" · ");
                        return (
                            <article key={skill.id} className="flex min-h-[152px] flex-col rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-4 shadow-none transition-colors hover:border-[#D6D8DD] dark:border-slate-800 dark:bg-slate-950">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="truncate text-[14px] font-semibold leading-5 text-[#0E1114] dark:text-slate-100">{skill.name}</h2>
                                            {taskTypes.map((taskType) => (
                                                <span key={`${skill.id}-${taskType}`} className={cn("inline-flex h-[22px] items-center rounded-[4px] px-2 text-[11px]", taskTone[taskType] || "bg-[#F2F3F5] text-[#86888F]")}>{taskTypeLabels[taskType] || taskType}</span>
                                            ))}
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#86888F] dark:text-slate-400">{shortText(skill.description || skill.content_preview || skill.content, 150)}</p>
                                    </div>
                                    <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-[4px] px-2 text-[11px]", skill.is_enabled ? "bg-[rgba(12,201,145,0.1)] text-[#0B9F75]" : "bg-[#F2F3F5] text-[#86888F]")}>{skill.is_enabled ? t.recruitment.enabled : t.recruitment.disabled}</span>
                                </div>

                                {skill.tags.length ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {skill.tags.map((tag) => <span key={`${skill.id}-${tag}`} className="inline-flex h-[22px] items-center rounded-[4px] bg-[rgba(30,59,250,0.06)] px-2 text-[11px] text-[#0F23D9]">{tag}</span>)}
                                    </div>
                                ) : null}

                                <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-[#F2F3F5] pt-3">
                                    <p className="min-w-0 truncate text-[11px] leading-5 text-[#B0B2B8] dark:text-slate-500">{meta}</p>
                                    {canManageSkill ? (
                                        <div className="ml-auto flex shrink-0 items-center gap-4 text-[12px]">
                                            <button type="button" className="inline-flex items-center gap-1 text-[#0F23D9] hover:text-[#1E3BFA] disabled:opacity-50" onClick={() => openSkillEditor(skill)} disabled={skillDetailLoadingId === skill.id}>{skillDetailLoadingId === skill.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true"/> : null}{t.common.edit}</button>
                                            <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => void toggleSkill(skill.id, !skill.is_enabled)}>{skill.is_enabled ? t.recruitment.disable : t.recruitment.enable}</button>
                                            <button type="button" className="text-[#F53F3F] hover:text-[#D9363E]" onClick={() => setSkillDeleteTarget(skill)}>{t.common.delete}</button>
                                        </div>
                                    ) : null}
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-[8px] border border-[#EBEEF5] px-6 py-14 dark:border-slate-800">
                    <EmptyState title={t.common.noSkills || "No Assessment Plans Yet"} description={query || taskFilter !== "all" ? (isZh ? "没有符合当前筛选条件的评估方案。" : "No assessment plans match the current filters.") : (t.common.skillsEmptyHint || "Admins can maintain assessment plans here for AI screening and interview question generation.")}/>
                </div>
            )}

            {total > pageSize ? (
                <div className="mt-5 flex items-center justify-end gap-3 text-[12px] text-[#86888F]">
                    <Button variant="outline" size="sm" disabled={pageIndex <= 0 || skillsLoading} onClick={() => onPageChange(pageIndex - 1)}>{t.common.prev}</Button>
                    <span>{t.common.pagination.prefix} {pageIndex + 1} {t.common.pagination.separator} {pageCount} {t.common.pagination.suffix}</span>
                    <Button variant="outline" size="sm" disabled={pageIndex + 1 >= pageCount || skillsLoading} onClick={() => onPageChange(pageIndex + 1)}>{t.common.next}</Button>
                </div>
            ) : null}

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[560px] dark:border-[#EBEEF5] dark:bg-white dark:text-[#0E1114] [&_[data-slot=dialog-close]]:right-5 [&_[data-slot=dialog-close]]:top-[18px] [&_[data-slot=dialog-close]]:text-[#86888F]">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-6 pb-[14px] pr-14 pt-[18px] text-left">
                        <DialogTitle className="text-[16px] font-semibold leading-5 text-[#0E1114]">{isZh ? "选择评估方案类型" : "Choose Assessment Plan Type"}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{isZh ? "不同类型的方案会注入到对应 AI 任务的提示词中" : "Each plan type is applied to its corresponding AI workflow."}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 px-6 py-5">
                        {createOptions.map((option) => (
                            <button
                                key={option.kind}
                                type="button"
                                className="flex min-h-[64px] items-center gap-3 rounded-[6px] border border-[#E6E7EB] px-4 py-3 text-left transition hover:border-[#1E3BFA] hover:bg-[rgba(30,59,250,0.025)]"
                                onClick={() => {
                                    setCreateDialogOpen(false);
                                    openSkillEditorByTaskKind(option.kind);
                                }}
                            >
                                <span className={cn("inline-flex h-[24px] shrink-0 items-center rounded-[4px] px-2 text-[11px]", taskTone[option.kind])}>{taskTypeLabels[option.kind]}</span>
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-medium leading-5 text-[#0E1114]">{option.title}</span>
                                    <span className="mt-0.5 block text-[11px] leading-[18px] text-[#86888F]">{option.description}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    );
}
