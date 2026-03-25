import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { RecruitmentLLMConfig } from "@/lib/recruitment-api";
import { recruitmentApi } from "@/lib/recruitment-api";
import { Field, NativeSelect } from "./SharedComponents";

export const llmFormSchema = z.object({
    configKey: z.string().min(1, "配置键不能为空"),
    taskType: z.string().min(1, "任务类型不能为空"),
    provider: z.string().min(1, "Provider 不能为空"),
    modelName: z.string().min(1, "模型名称不能为空"),
    baseUrl: z.string().optional(),
    apiKeyEnv: z.string().optional(),
    apiKeyValue: z.string().optional(),
    priority: z.string().optional(),
    isActive: z.boolean(),
    extraConfigText: z.string().optional().refine(val => {
        if (!val || !val.trim()) return true;
        try { 
            JSON.parse(val); 
            return true; 
        } catch { 
            return false; 
        }
    }, "必须是有效的 JSON 格式"),
});

type LLMFormValues = z.infer<typeof llmFormSchema>;

export interface LLMSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: RecruitmentLLMConfig | null;
    onSuccess: () => Promise<unknown> | void;
}

const providerLabels: Record<string, string> = {
    gemini: "Gemini",
    openai: "GPT / OpenAI",
    anthropic: "Claude",
    deepseek: "DeepSeek",
    kimi: "Kimi",
    glm: "GLM",
    "openai-compatible": "OpenAI Compatible",
};

export function LLMSettingsDialog({ open, onOpenChange, config, onSuccess }: LLMSettingsDialogProps) {
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<LLMFormValues>({
        resolver: zodResolver(llmFormSchema),
        defaultValues: {
            configKey: "",
            taskType: "default",
            provider: "gemini",
            modelName: "",
            baseUrl: "",
            apiKeyEnv: "",
            apiKeyValue: "",
            priority: "99",
            isActive: true,
            extraConfigText: "{}",
        },
    });

    useEffect(() => {
        if (open) {
            if (config) {
                form.reset({
                    configKey: config.config_key,
                    taskType: config.task_type,
                    provider: config.provider,
                    modelName: config.model_name,
                    baseUrl: config.base_url || "",
                    apiKeyEnv: config.api_key_env || "",
                    apiKeyValue: "",
                    priority: String(config.priority ?? 99),
                    isActive: config.is_active,
                    extraConfigText: JSON.stringify(config.extra_config || {}, null, 2),
                });
            } else {
                form.reset({
                    configKey: "",
                    taskType: "default",
                    provider: "gemini",
                    modelName: "",
                    baseUrl: "",
                    apiKeyEnv: "",
                    apiKeyValue: "",
                    priority: "99",
                    isActive: true,
                    extraConfigText: "{}",
                });
            }
        }
    }, [open, config, form]);

    const onSubmit = async (values: LLMFormValues) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const payload = {
                config_key: values.configKey.trim(),
                task_type: values.taskType.trim(),
                provider: values.provider.trim(),
                model_name: values.modelName.trim(),
                base_url: values.baseUrl?.trim() || null,
                api_key_env: values.apiKeyEnv?.trim() || null,
                api_key_value: values.apiKeyValue?.trim() || null,
                priority: Number(values.priority || "99"),
                is_active: values.isActive,
                extra_config: values.extraConfigText?.trim() ? JSON.parse(values.extraConfigText) : {},
            };

            if (config) {
                await recruitmentApi(`/llm-configs/${config.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("模型配置已更新");
            } else {
                await recruitmentApi(`/llm-configs`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("模型配置已创建");
            }
            onOpenChange(false);
            await onSuccess();
        } catch (error) {
            toast.error(`保存模型配置失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(85vh,840px)] max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{config ? "编辑模型配置" : "新增模型配置"}</DialogTitle>
                    <DialogDescription>
                        按任务类型维护 provider、model、API key 和运行时环境变量，支持随时切换供应商。
                    </DialogDescription>
                </DialogHeader>
                <form id="llm-form" onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                            <Field label="配置键" error={form.formState.errors.configKey?.message}>
                                <Input {...form.register("configKey")} />
                            </Field>
                            <Field label="任务类型" error={form.formState.errors.taskType?.message}>
                                <Input {...form.register("taskType")} />
                            </Field>
                            <Field label="Provider" error={form.formState.errors.provider?.message}>
                                <NativeSelect {...form.register("provider")}>
                                    {Object.entries(providerLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </NativeSelect>
                            </Field>
                            <Field label="模型名称" error={form.formState.errors.modelName?.message}>
                                <Input {...form.register("modelName")} />
                            </Field>
                            <Field label="Base URL" error={form.formState.errors.baseUrl?.message}>
                                <Input {...form.register("baseUrl")} />
                            </Field>
                            <Field label="API Key 环境变量" error={form.formState.errors.apiKeyEnv?.message}>
                                <Input {...form.register("apiKeyEnv")} />
                            </Field>
                            <Field label={config ? "API Key 值（留空则不修改）" : "API Key 值"} error={form.formState.errors.apiKeyValue?.message}>
                                <Input type="password" {...form.register("apiKeyValue")} />
                            </Field>
                            <Field label="优先级" error={form.formState.errors.priority?.message}>
                                <Input type="number" {...form.register("priority")} />
                            </Field>
                        </div>
                        <Field label="Extra Config" className="mt-4" error={form.formState.errors.extraConfigText?.message}>
                            <Textarea {...form.register("extraConfigText")} rows={10} />
                        </Field>
                        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input type="checkbox" {...form.register("isActive")} />
                            保存后立即启用
                        </label>
                    </ScrollArea>
                </form>
                <DialogFooter className="shrink-0 mt-4">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        取消
                    </Button>
                    <Button type="submit" form="llm-form" disabled={submitting}>
                        {submitting ? "保存中..." : "保存配置"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
