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
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

import {EmptyState, LoadingPanel} from "../components/SharedComponents";
import {shortText} from "../utils";

type SkillSettingsPageProps = {
    panelClass: string;
    skillsLoading: boolean;
    skills: RecruitmentSkill[];
    canManageSkill: boolean;
    openSkillEditor: (skill?: RecruitmentSkill) => void;
    openSkillEditorWithAI: () => void;
    toggleSkill: (skillId: number, enabled: boolean) => Promise<void>;
    setSkillDeleteTarget: (skill: RecruitmentSkill) => void;
};

export function SkillSettingsPage({
    panelClass,
    skillsLoading,
    skills,
    canManageSkill,
    openSkillEditor,
    openSkillEditorWithAI,
    toggleSkill,
    setSkillDeleteTarget,
}: SkillSettingsPageProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";

    return (
        <div className="space-y-6">
            <Card className={panelClass}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
                    <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{isZh ? "Skills 属于管理员设置" : "Skills belong to admin settings"}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{isZh ? "入口已收进管理设置，避免主工作台被配置项干扰。" : "This entry lives inside management settings so the main workspace stays focused."}</p>
                    </div>
                    <div className="flex gap-2">
                        {canManageSkill && (
                            <Button variant="outline" onClick={openSkillEditorWithAI}>
                                <Sparkles className="h-4 w-4"/>
                                {isZh ? "AI 生成" : "AI Generate"}
                            </Button>
                        )}
                        {canManageSkill && (
                            <Button onClick={() => openSkillEditor()}>
                                <Plus className="h-4 w-4"/>
                                {isZh ? "新增 Skill" : "New Skill"}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                {skillsLoading ? <LoadingPanel label={isZh ? "正在加载 Skills" : "Loading skills"}/> : skills.length ? skills.map((skill) => (
                    <Card key={skill.id} className={panelClass}>
                        <CardHeader>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-lg">{skill.name}</CardTitle>
                                    <CardDescription className="mt-2">{skill.description || (isZh ? "未填写说明" : "No description provided")}</CardDescription>
                                </div>
                                <Badge
                                    className={cn("rounded-full border", skill.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                    {skill.is_enabled ? (isZh ? "启用中" : "Enabled") : (isZh ? "已停用" : "Disabled")}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{shortText(skill.content, 220)}</p>
                            <div className="flex flex-wrap gap-2">
                                {skill.tags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="rounded-full">{tag}</Badge>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {canManageSkill && (
                                    <Button size="sm" variant="outline" onClick={() => openSkillEditor(skill)}>{isZh ? "编辑" : "Edit"}</Button>
                                )}
                                {canManageSkill && (
                                    <Button size="sm" variant="outline" onClick={() => void toggleSkill(skill.id, !skill.is_enabled)}>
                                        {skill.is_enabled ? (isZh ? "停用" : "Disable") : (isZh ? "启用" : "Enable")}
                                    </Button>
                                )}
                                {canManageSkill && (
                                    <Button size="sm" variant="outline" onClick={() => setSkillDeleteTarget(skill)}>{isZh ? "删除" : "Delete"}</Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )) : <EmptyState title={isZh ? "暂无 Skills" : "No Skills Yet"} description={isZh ? "管理员可以在这里维护招聘领域 Skills，供 AI 评估和题目生成使用。" : "Admins can maintain recruiting skills here for AI screening and interview question generation."}/>}
            </div>
        </div>
    );
}
