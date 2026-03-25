"use client";

import React from "react";

import {
    Loader2,
    Plus,
    RefreshCw,
    Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import type { RecruitmentLLMConfig } from "@/lib/recruitment-api";
import { cn } from "@/lib/utils";

import {
    labelForProvider,
    labelForTaskType,
} from "../utils";
import { EmptyState, InfoTile } from "../components/SharedComponents";

/* ─── Props ─── */

export interface ModelSettingsPageProps {
    llmConfigs: RecruitmentLLMConfig[];
    modelsLoading: boolean;
    panelClass: string;
    assistantModelLabel: string;
    assistantActiveLLMConfig: RecruitmentLLMConfig | null | undefined;
    preferredLLMConfigIds: Set<number>;
    existingGlmConfig: RecruitmentLLMConfig | null | undefined;
    glmTemplateCreating: boolean;

    openLLMEditor: (config?: RecruitmentLLMConfig) => void;
    setLlmDeleteTarget: (config: RecruitmentLLMConfig) => void;
    setPreferredLLMConfig: (config: RecruitmentLLMConfig) => Promise<void>;
    refreshLLMConfigsWithFeedback: () => Promise<void>;
    ensureGlmTemplateConfig: () => Promise<void>;
}

export function ModelSettingsPage({
    llmConfigs,
    modelsLoading,
    panelClass,
    assistantModelLabel,
    assistantActiveLLMConfig,
    preferredLLMConfigIds,
    existingGlmConfig,
    glmTemplateCreating,
    openLLMEditor,
    setLlmDeleteTarget,
    setPreferredLLMConfig,
    refreshLLMConfigsWithFeedback,
    ensureGlmTemplateConfig,
}: ModelSettingsPageProps) {
    const groupedConfigs = Array.from(
        llmConfigs.reduce((map, item) => {
            const current = map.get(item.task_type) || [];
            current.push(item);
            map.set(item.task_type, current);
            return map;
        }, new Map<string, RecruitmentLLMConfig[]>()).entries(),
    );

    return (
        <div className="space-y-6">
            <Card className={panelClass}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
                    <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">模型配置中心</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">同一任务类型会按优先级数字从小到大生效。新增
                            GLM、Gemini 或其他模型后，直接把它设为当前使用即可。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void refreshLLMConfigsWithFeedback()}
                                disabled={modelsLoading}>
                            {modelsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> :
                                <RefreshCw className="h-4 w-4"/>}
                            {modelsLoading ? "刷新中..." : "刷新模型"}
                        </Button>
                        <Button variant="outline" onClick={() => void ensureGlmTemplateConfig()}
                                disabled={glmTemplateCreating}>
                            {glmTemplateCreating ? <Loader2 className="h-4 w-4 animate-spin"/> :
                                <Sparkles className="h-4 w-4"/>}
                            {existingGlmConfig ? "编辑 GLM 模板" : "新增 GLM 模板"}
                        </Button>
                        <Button onClick={() => openLLMEditor()}>
                            <Plus className="h-4 w-4"/>
                            新增模型
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="当前对话模型" value={assistantModelLabel}/>
                <InfoTile label="当前对话来源" value={assistantActiveLLMConfig?.resolved_source || "暂未识别"}/>
                <InfoTile label="已启用模型数" value={String(llmConfigs.filter((item) => item.is_active).length)}/>
                <InfoTile label="模型总数" value={String(llmConfigs.length)}/>
            </div>

            {groupedConfigs.length ? groupedConfigs.map(([taskType, configs]) => (
                <Card key={taskType} className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{labelForTaskType(taskType)}</CardTitle>
                        <CardDescription>{"当前任务会优先命中标记为\"当前生效\"的模型；若它被停用或删除，系统会自动回退到同任务下一个可用配置。"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {configs.map((config) => {
                            const isCurrent = preferredLLMConfigIds.has(config.id);
                            const resolvedProvider = labelForProvider(config.resolved_provider || config.provider);
                            const resolvedModelName = config.resolved_model_name || config.model_name || "-";
                            return (
                                <div key={config.id}
                                     className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-slate-900 dark:text-slate-100">{config.config_key}</p>
                                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{resolvedProvider} / {resolvedModelName}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {isCurrent ? <Badge
                                                className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">当前生效</Badge> : null}
                                            <Badge
                                                className={cn("rounded-full border", config.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                                {config.is_active ? "已启用" : "已停用"}
                                            </Badge>
                                            <Badge variant="outline"
                                                   className="rounded-full">优先级 {config.priority}</Badge>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <InfoTile label="Provider" value={labelForProvider(config.provider)}/>
                                        <InfoTile label="模型名" value={config.model_name}/>
                                        <InfoTile label="解析后来源" value={config.resolved_source || "-"}/>
                                        <InfoTile label="Base URL"
                                                  value={config.resolved_base_url || config.base_url || "-"}/>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button size="sm" variant={isCurrent ? "default" : "outline"}
                                                onClick={() => void setPreferredLLMConfig(config)}
                                                disabled={isCurrent}>
                                            {isCurrent ? "当前使用中" : "设为当前使用"}
                                        </Button>
                                        <Button size="sm" variant="outline"
                                                onClick={() => openLLMEditor(config)}>编辑</Button>
                                        <Button size="sm" variant="outline"
                                                onClick={() => setLlmDeleteTarget(config)}>删除</Button>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )) : (
                <EmptyState title="暂无模型配置" description="先新增至少一个模型配置，系统才会按任务类型进行路由。"/>
            )}
        </div>
    );
}
