"use client";

import React from "react";
import {Copy, Loader2, Plus, RefreshCw} from "lucide-react";

import type {RecruitmentLLMConfig} from "@/lib/recruitment-api";
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

import {EmptyState, InfoTile} from "../components/SharedComponents";
import {labelForProvider, labelForTaskType} from "../utils";

type ModelSettingsPageProps = {
    panelClass: string;
    llmConfigs: RecruitmentLLMConfig[];
    modelsLoading: boolean;
    canManageLLMConfig: boolean;
    assistantModelLabel: string;
    assistantActiveLLMConfig: RecruitmentLLMConfig | null;
    preferredLLMConfigIds: Set<number>;
    openLLMEditor: (config?: RecruitmentLLMConfig) => void;
    copyLLMEditor: (config: RecruitmentLLMConfig) => void;
    setPreferredLLMConfig: (config: RecruitmentLLMConfig) => Promise<void>;
    setLlmDeleteTarget: (config: RecruitmentLLMConfig) => void;
    refreshLLMConfigsWithFeedback: () => Promise<void>;
};

export function ModelSettingsPage({
    panelClass,
    llmConfigs,
    modelsLoading,
    canManageLLMConfig,
    assistantModelLabel,
    assistantActiveLLMConfig,
    preferredLLMConfigIds,
    openLLMEditor,
    copyLLMEditor,
    setPreferredLLMConfig,
    setLlmDeleteTarget,
    refreshLLMConfigsWithFeedback,
}: ModelSettingsPageProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";

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
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{isZh ? "模型配置中心" : "Model Configuration Center"}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{isZh ? "同一任务类型会按优先级数字从小到大生效。新增模型后，直接把它设为当前使用即可。" : "Within the same task type, lower priority numbers win. After adding a model, you can set it as the current one directly."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void refreshLLMConfigsWithFeedback()} disabled={modelsLoading}>
                            {modelsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                            {modelsLoading ? (isZh ? "刷新中..." : "Refreshing...") : (isZh ? "刷新模型" : "Refresh Models")}
                        </Button>
                        {canManageLLMConfig && (
                            <Button onClick={() => openLLMEditor()}>
                                <Plus className="h-4 w-4"/>
                                {isZh ? "新增模型" : "New Model"}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label={isZh ? "当前对话模型" : "Current Chat Model"} value={assistantModelLabel}/>
                <InfoTile label={isZh ? "当前对话来源" : "Current Chat Source"} value={assistantActiveLLMConfig?.resolved_source || (isZh ? "暂未识别" : "Unrecognized")}/>
                <InfoTile label={isZh ? "已启用模型数" : "Enabled Models"} value={String(llmConfigs.filter((item) => item.is_active).length)}/>
                <InfoTile label={isZh ? "模型总数" : "Total Models"} value={String(llmConfigs.length)}/>
            </div>

            {groupedConfigs.length ? groupedConfigs.map(([taskType, configs]) => (
                <Card key={taskType} className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{labelForTaskType(taskType)}</CardTitle>
                        <CardDescription>{isZh ? "当前任务会优先命中标记为“当前生效”的模型；若它被停用或删除，系统会自动回退到同任务下一个可用配置。" : "Each task prefers the model marked as current. If it is disabled or removed, the system falls back to the next available config for the same task."}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {configs.map((config) => {
                            const isCurrent = preferredLLMConfigIds.has(config.id);
                            const resolvedProvider = labelForProvider(config.resolved_provider || config.provider);
                            const resolvedModelName = config.resolved_model_name || config.model_name || "-";
                            return (
                                <div key={config.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-slate-900 dark:text-slate-100">{config.config_key}</p>
                                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{resolvedProvider} / {resolvedModelName}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {isCurrent ? <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{isZh ? "当前生效" : "Current"}</Badge> : null}
                                            <Badge
                                                className={cn("rounded-full border", config.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                                {config.is_active ? (isZh ? "已启用" : "Enabled") : (isZh ? "已停用" : "Disabled")}
                                            </Badge>
                                            <Badge variant="outline" className="rounded-full">{isZh ? `优先级 ${config.priority}` : `Priority ${config.priority}`}</Badge>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <InfoTile label="Provider" value={labelForProvider(config.provider)}/>
                                        <InfoTile label={isZh ? "模型名" : "Model Name"} value={config.model_name}/>
                                        <InfoTile label={isZh ? "解析后来源" : "Resolved Source"} value={config.resolved_source || "-"}/>
                                        <InfoTile label="Base URL" value={config.resolved_base_url || config.base_url || "-"}/>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant={isCurrent ? "default" : "outline"} onClick={() => void setPreferredLLMConfig(config)} disabled={isCurrent}>
                                                {isCurrent ? (isZh ? "当前使用中" : "Currently Active") : (isZh ? "设为当前使用" : "Set as Current")}
                                            </Button>
                                        )}
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant="outline" onClick={() => openLLMEditor(config)}>{isZh ? "编辑" : "Edit"}</Button>
                                        )}
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant="outline" onClick={() => copyLLMEditor(config)}><Copy className="h-4 w-4"/>{isZh ? "复制" : "Copy"}</Button>
                                        )}
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant="outline" onClick={() => setLlmDeleteTarget(config)}>{isZh ? "删除" : "Delete"}</Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )) : (
                <EmptyState title={isZh ? "暂无模型配置" : "No Model Configurations"} description={isZh ? "先新增至少一个模型配置，系统才会按任务类型进行路由。" : "Add at least one model configuration before the system can route by task type."}/>
            )}
        </div>
    );
}
