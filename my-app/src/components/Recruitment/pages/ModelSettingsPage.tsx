"use client";

import React from "react";
import {Copy, Info, Loader2, Plus, RefreshCw} from "lucide-react";

import type {RecruitmentLLMConfig} from "@/lib/recruitment-api";
import {useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";

import {EmptyState} from "../components/SharedComponents";
import {labelForProvider, labelForTaskType} from "../utils";

type ModelSettingsPageProps = {
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
    const {t, language} = useI18n();
    const isZh = language === "zh-CN";
    const sortedConfigs = React.useMemo(() => [...llmConfigs].sort((left, right) => left.priority - right.priority || left.id - right.id), [llmConfigs]);
    const stats = [
        {label: isZh ? "当前对话模型" : "Current chat model", value: assistantModelLabel || "-", color: "var(--ats-primary)"},
        {label: isZh ? "当前对话来源" : "Current chat source", value: assistantActiveLLMConfig?.resolved_source || t.common.unrecognized, color: "#33A1FD"},
        {label: isZh ? "模型总数" : "Total models", value: String(llmConfigs.length), color: "#0CC991"},
        {label: isZh ? "已启用模型数" : "Enabled models", value: String(llmConfigs.filter((item) => item.is_active).length), color: "#FFAB24"},
    ];

    return (
        <section aria-labelledby="settings-models-title">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h1 id="settings-models-title" className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{isZh ? "模型配置中心" : "Model Configuration"}</h1>
                    <p className="text-[12px] leading-5 text-[#B0B2B8] dark:text-slate-400">{isZh ? "同一任务类型会按优先级数字从小到大生效。新增模型后，直接把它设为当前使用即可。" : "Models are resolved by ascending priority within each task type. Set a model as current after adding it."}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <Button variant="outline" className="h-9 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[13px] font-normal text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#0F23D9]" onClick={() => void refreshLLMConfigsWithFeedback()} disabled={modelsLoading}>
                        {modelsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
                        {modelsLoading ? t.common.refreshing : t.common.refreshModels}
                    </Button>
                    {canManageLLMConfig ? (
                        <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={() => openLLMEditor()}>
                            <Plus className="h-3.5 w-3.5"/>
                            {t.recruitment.newModel}
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                    <div key={stat.label} className="rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-4 shadow-none dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-center gap-2 text-[12px] text-[#86888F] dark:text-slate-400">
                            <span className="h-4 w-[3px] rounded-full" style={{backgroundColor: stat.color}}/>
                            {stat.label}
                        </div>
                        <p className="mt-2 truncate text-[20px] font-semibold leading-7 text-[#0E1114] dark:text-slate-100" title={stat.value}>{stat.value}</p>
                    </div>
                ))}
            </div>

            <div className="mb-4 flex items-center gap-2 bg-[#F7F8FA] px-4 py-3 text-[12px] leading-5 text-[#33353D] dark:bg-slate-900/60 dark:text-slate-300">
                <Info className="h-3.5 w-3.5 shrink-0 text-[#1E3BFA]"/>
                <span>{isZh ? "当前任务会优先命中标记为“当前生效”的模型；若它被停用或删除，系统会自动回退到同任务下一个可用配置。同一模型配置的并发和 QPS 是全局共享的。" : "Tasks prefer the model marked current. If it is disabled or deleted, the system falls back to the next available configuration. Concurrency and QPS limits are shared globally."}</span>
            </div>

            {sortedConfigs.length ? (
                <div className="overflow-x-auto rounded-[8px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
                    <table className="w-full min-w-[1080px] table-fixed text-left">
                        <colgroup>
                            <col style={{width: "6%"}}/>
                            <col style={{width: "15%"}}/>
                            <col style={{width: "12%"}}/>
                            <col style={{width: "18%"}}/>
                            <col style={{width: "8%"}}/>
                            <col style={{width: "7%"}}/>
                            <col style={{width: "8%"}}/>
                            <col style={{width: "12%"}}/>
                            <col style={{width: "14%"}}/>
                        </colgroup>
                        <thead className="border-b border-[#EBEEF5] text-[12px] font-normal text-[#86888F] dark:border-slate-800 dark:text-slate-400">
                            <tr className="h-11">
                                <th className="px-4 font-normal">{isZh ? "优先级" : "Priority"}</th>
                                <th className="px-4 font-normal">{isZh ? "模型配置" : "Model"}</th>
                                <th className="px-4 font-normal">{isZh ? "任务类型" : "Task type"}</th>
                                <th className="px-4 font-normal">{isZh ? "解析后来源" : "Resolved source"}</th>
                                <th className="px-4 font-normal">{isZh ? "最大并发" : "Concurrency"}</th>
                                <th className="px-4 font-normal">QPS</th>
                                <th className="px-4 font-normal">{isZh ? "状态" : "Status"}</th>
                                <th className="px-4 font-normal">{isZh ? "当前生效" : "Current"}</th>
                                <th className="px-4 font-normal">{isZh ? "操作" : "Actions"}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F2F3F5] dark:divide-slate-800">
                            {sortedConfigs.map((config) => {
                                const isCurrent = preferredLLMConfigIds.has(config.id);
                                const provider = labelForProvider(config.resolved_provider || config.provider);
                                const modelName = config.resolved_model_name || config.model_name || "-";
                                return (
                                    <tr key={config.id} className="h-[58px] text-[12px] text-[#33353D] transition-colors hover:bg-[#F8F8F9] dark:text-slate-300 dark:hover:bg-slate-900/50">
                                        <td className="px-4 text-[#0E1114] dark:text-slate-100">{config.priority}</td>
                                        <td className="px-4">
                                            <p className="truncate font-medium text-[#0E1114] dark:text-slate-100">{config.config_key}</p>
                                            <p className="mt-0.5 truncate text-[11px] text-[#B0B2B8]">{provider} · {modelName}</p>
                                        </td>
                                        <td className="px-4"><span className="line-clamp-2">{labelForTaskType(config.task_type)}</span></td>
                                        <td className="px-4">
                                            <p className="truncate text-[#86888F]" title={config.resolved_source || provider}>{config.resolved_source || provider}</p>
                                            <p className="mt-0.5 truncate text-[11px] text-[#B0B2B8]" title={config.resolved_base_url || config.base_url || ""}>{config.resolved_base_url || config.base_url || "-"}</p>
                                        </td>
                                        <td className="px-4 text-[#0E1114] dark:text-slate-100">{config.max_concurrent || 1}</td>
                                        <td className="px-4 text-[#0E1114] dark:text-slate-100">{config.max_qps > 0 ? config.max_qps : "-"}</td>
                                        <td className="px-4"><span className={cn("inline-flex h-[22px] items-center rounded-[4px] px-2 text-[11px]", config.is_active ? "bg-[rgba(12,201,145,0.1)] text-[#0B9F75]" : "bg-[#F2F3F5] text-[#86888F]")}>{config.is_active ? t.recruitment.enabled : t.recruitment.disabled}</span></td>
                                        <td className="px-4">
                                            {isCurrent ? <span className="inline-flex h-[22px] items-center rounded-[4px] bg-[rgba(30,59,250,0.08)] px-2 text-[11px] text-[#1E3BFA]">{t.common.currentActive}</span> : canManageLLMConfig ? <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => void setPreferredLLMConfig(config)}>{t.common.setAsCurrent}</button> : <span className="text-[#B0B2B8]">-</span>}
                                        </td>
                                        <td className="px-4">
                                            {canManageLLMConfig ? (
                                                <div className="flex items-center gap-3 whitespace-nowrap">
                                                    <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => openLLMEditor(config)}>{t.common.edit}</button>
                                                    <button type="button" className="inline-flex items-center gap-1 text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => copyLLMEditor(config)}><Copy className="h-3 w-3"/>{t.common.copy}</button>
                                                    <button type="button" className="text-[#F53F3F] hover:text-[#D9363E]" onClick={() => setLlmDeleteTarget(config)}>{t.common.delete}</button>
                                                </div>
                                            ) : <span className="text-[#B0B2B8]">-</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="rounded-[8px] border border-[#EBEEF5] px-6 py-16 dark:border-slate-800">
                    <EmptyState title={t.common.noModelConfigs} description={modelsLoading ? t.common.loading : t.common.noModelConfigsHint}/>
                </div>
            )}
        </section>
    );
}
