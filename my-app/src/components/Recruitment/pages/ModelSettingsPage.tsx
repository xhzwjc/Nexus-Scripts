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
    const { t } = useI18n();

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
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.common.modelConfigCenter}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.common.modelConfigHint}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void refreshLLMConfigsWithFeedback()} disabled={modelsLoading}>
                            {modelsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                            {modelsLoading ? t.common.refreshing : t.common.refreshModels}
                        </Button>
                        {canManageLLMConfig && (
                            <Button onClick={() => openLLMEditor()}>
                                <Plus className="h-4 w-4"/>
                                {t.recruitment.newModel}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label={t.common.currentChatModel} value={assistantModelLabel}/>
                <InfoTile label={t.common.currentChatSource} value={assistantActiveLLMConfig?.resolved_source || t.common.unrecognized}/>
                <InfoTile label={t.recruitment.enabledModels} value={String(llmConfigs.filter((item) => item.is_active).length)}/>
                <InfoTile label={t.common.totalModels} value={String(llmConfigs.length)}/>
            </div>

            {groupedConfigs.length ? groupedConfigs.map(([taskType, configs]) => (
                <Card key={taskType} className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{labelForTaskType(taskType)}</CardTitle>
                        <CardDescription>{t.common.modelFallbackHint}</CardDescription>
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
                                            {isCurrent ? <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{t.common.currentActive}</Badge> : null}
                                            <Badge
                                                className={cn("rounded-full border", config.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                                {config.is_active ? t.recruitment.enabled : t.recruitment.disabled}
                                            </Badge>
                                            <Badge variant="outline" className="rounded-full">{t.common.priorityLabel} {config.priority}</Badge>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <InfoTile label="Provider" value={labelForProvider(config.provider)}/>
                                        <InfoTile label={t.common.modelName} value={config.model_name}/>
                                        <InfoTile label={t.common.resolvedSource} value={config.resolved_source || "-"}/>
                                        <InfoTile label="Base URL" value={config.resolved_base_url || config.base_url || "-"}/>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant={isCurrent ? "default" : "outline"} onClick={() => void setPreferredLLMConfig(config)} disabled={isCurrent}>
                                                {isCurrent ? t.common.currentlyActive : t.common.setAsCurrent}
                                            </Button>
                                        )}
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant="outline" onClick={() => openLLMEditor(config)}>{t.common.edit}</Button>
                                        )}
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant="outline" onClick={() => copyLLMEditor(config)}><Copy className="h-4 w-4"/>{t.common.copy}</Button>
                                        )}
                                        {canManageLLMConfig && (
                                            <Button size="sm" variant="outline" onClick={() => setLlmDeleteTarget(config)}>{t.common.delete}</Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )) : (
                <EmptyState title={t.common.noModelConfigs} description={t.common.noModelConfigsHint}/>
            )}
        </div>
    );
}
