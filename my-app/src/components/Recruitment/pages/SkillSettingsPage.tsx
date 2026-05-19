"use client";

import React from "react";
import {Plus, Sparkles} from "lucide-react";

import type {RecruitmentSkill} from "@/lib/recruitment-api";
import {useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
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
    panelClass: string;
    skillsLoading: boolean;
    skills: RecruitmentSkill[];
    canManageSkill: boolean;
    openSkillEditor: (skill?: RecruitmentSkill) => void;
    openSkillEditorByTaskKind: (taskKind: SkillTaskKind) => void;
    openSkillEditorWithAI: (boundPositionId?: number | null) => void;
    toggleSkill: (skillId: number, enabled: boolean) => Promise<void>;
    setSkillDeleteTarget: (skill: RecruitmentSkill) => void;
};

export function SkillSettingsPage({
    panelClass,
    skillsLoading,
    skills,
    canManageSkill,
    openSkillEditor,
    openSkillEditorByTaskKind,
    openSkillEditorWithAI,
    toggleSkill,
    setSkillDeleteTarget,
}: SkillSettingsPageProps) {
    const { t } = useI18n();
    const [query, setQuery] = React.useState("");
    const [taskFilter, setTaskFilter] = React.useState<"all" | "jd" | "screening" | "interview">("all");
    const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
    const taskTypeLabels = React.useMemo<Record<SkillTaskKind, string>>(() => ({
        screening: t.recruitment.taskTypeScreening,
        jd: t.recruitment.taskTypeJd,
        interview: t.recruitment.taskTypeInterview,
    }), [t.recruitment.taskTypeInterview, t.recruitment.taskTypeJd, t.recruitment.taskTypeScreening]);
    const filteredSkills = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return skills.filter((skill) => {
            const matchesTask = taskFilter === "all" || skill.task_types?.includes(taskFilter);
            const haystack = [
                skill.name,
                skill.description,
                skill.bound_position_title,
                ...(skill.tags || []),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
            return matchesTask && matchesQuery;
        }).sort((left, right) => {
            const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
            const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
            if (leftTime !== rightTime) {
                return rightTime - leftTime;
            }
            return right.id - left.id;
        });
    }, [query, skills, taskFilter]);
    const createOptions = React.useMemo(() => ([
        {
            kind: "screening" as const,
            title: t.recruitment.taskTypeScreening,
            description: "进入维度配置流程，适合做初筛评分规则。",
        },
        {
            kind: "jd" as const,
            title: t.recruitment.taskTypeJd,
            description: "使用轻量表单，快速维护 JD 分析方案。",
        },
        {
            kind: "interview" as const,
            title: t.recruitment.taskTypeInterview,
            description: "使用轻量表单，快速维护面试题评估方案。",
        },
    ]), [t.recruitment.taskTypeInterview, t.recruitment.taskTypeJd, t.recruitment.taskTypeScreening]);

    return (
        <div className="space-y-6">
            <Card className={panelClass}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
                    <div>
                        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{t.common.skillsBelongToAdminSettings || "Assessment plans belong to admin settings"}</p>
                        <p className="mt-1 text-base text-slate-500 dark:text-slate-400">{t.common.skillsSettingsHint || "This entry lives inside management settings so the main workspace stays focused."}</p>
                    </div>
                    <div className="flex gap-2">
                        {canManageSkill && (
                            <Button variant="outline" onClick={() => openSkillEditorWithAI(null)}>
                                <Sparkles className="h-4 w-4"/>
                                {`AI ${t.recruitment.taskTypeScreening}`}
                            </Button>
                        )}
                        {canManageSkill && (
                            <Button onClick={() => setCreateDialogOpen(true)}>
                                <Plus className="h-4 w-4"/>
                                {t.recruitment.newSkill}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className={panelClass}>
                <CardContent className="space-y-3 px-6 py-5">
                    <Input
                        value={query}
                        placeholder={t.common.search || "Search"}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        {([
                            ["all", "All"],
                            ["screening", t.recruitment.taskTypeScreening],
                            ["jd", t.recruitment.taskTypeJd],
                            ["interview", t.recruitment.taskTypeInterview],
                        ] as const).map(([value, label]) => (
                            <Button
                                key={`skill-filter-${value}`}
                                size="sm"
                                variant={taskFilter === value ? "default" : "outline"}
                                onClick={() => setTaskFilter(value)}
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className={panelClass}>
                <CardContent className="px-0 py-0">
                    {skillsLoading ? (
                        <div className="px-6 py-10">
                            <LoadingPanel label={t.common.loading}/>
                        </div>
                    ) : filteredSkills.length ? (
                        <div>
                            <div className="hidden grid-cols-[minmax(0,2.1fr)_0.9fr_1.1fr_0.9fr_1fr] gap-4 border-b border-slate-200/80 px-6 py-4 text-sm font-medium uppercase tracking-[0.18em] text-slate-500 dark:border-slate-800 dark:text-slate-400 lg:grid">
                                <div>评估方案</div>
                                <div>类型</div>
                                <div>关联岗位</div>
                                <div>创建时间</div>
                                <div>操作</div>
                            </div>
                            <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                                {filteredSkills.map((skill) => {
                                    const previewTags = skill.tags.slice(0, 2);
                                    const hiddenTagCount = Math.max(0, skill.tags.length - previewTags.length);
                                    return (
                                    <div key={skill.id} className="grid min-h-[116px] gap-4 px-6 py-5 lg:grid-cols-[minmax(0,2.1fr)_0.9fr_1.1fr_0.9fr_1fr] lg:items-center">
                                        <div className="min-w-0 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{skill.name}</p>
                                                <Badge
                                                    className={cn("rounded-full border", skill.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                                    {skill.is_enabled ? t.recruitment.enabled : t.recruitment.disabled}
                                                </Badge>
                                            </div>
                                            <p className="line-clamp-2 min-h-10 text-base leading-5 text-slate-600 dark:text-slate-300">{shortText(skill.description || skill.content, 140)}</p>
                                            {previewTags.length ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {previewTags.map((tag) => (
                                                        <Badge key={tag} variant="outline" className="rounded-full">{tag}</Badge>
                                                    ))}
                                                    {hiddenTagCount > 0 ? (
                                                        <span className="text-sm text-slate-400 dark:text-slate-500">{`+${hiddenTagCount}`}</span>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(skill.task_types || []).map((taskType) => (
                                                <Badge key={`${skill.id}-${taskType}`} variant="outline" className="rounded-full">
                                                    {taskTypeLabels[taskType as SkillTaskKind] || taskType}
                                                </Badge>
                                            ))}
                                        </div>
                                        <div className="truncate text-base text-slate-600 dark:text-slate-300">
                                            {skill.bound_position_title || "通用方案"}
                                        </div>
                                        <div className="text-base text-slate-500 dark:text-slate-400">
                                            {formatDateTime(skill.created_at)}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {canManageSkill && (
                                                <Button size="sm" variant="outline" onClick={() => openSkillEditor(skill)}>{t.common.edit}</Button>
                                            )}
                                            {canManageSkill && (
                                                <Button size="sm" variant="outline" onClick={() => void toggleSkill(skill.id, !skill.is_enabled)}>
                                                    {skill.is_enabled ? t.recruitment.disable : t.recruitment.enable}
                                                </Button>
                                            )}
                                            {canManageSkill && (
                                                <Button size="sm" variant="outline" onClick={() => setSkillDeleteTarget(skill)}>{t.common.delete}</Button>
                                            )}
                                        </div>
                                    </div>
                                )})}
                            </div>
                        </div>
                    ) : (
                        <div className="px-6 py-10">
                            <EmptyState title={t.common.noSkills || "No Assessment Plans Yet"} description={t.common.skillsEmptyHint || "Admins can maintain assessment plans here for AI screening and interview question generation."}/>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>选择评估方案类型</DialogTitle>
                        <DialogDescription>初筛方案继续使用维度配置流程，JD 和面试题方案使用轻量表单。</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                        {createOptions.map((option) => (
                            <button
                                key={option.kind}
                                type="button"
                                className="rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 dark:border-slate-800"
                                onClick={() => {
                                    setCreateDialogOpen(false);
                                    openSkillEditorByTaskKind(option.kind);
                                }}
                            >
                                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{option.title}</div>
                                <div className="mt-1 text-base text-slate-500 dark:text-slate-400">{option.description}</div>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
