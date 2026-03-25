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

import type { RecruitmentSkill } from "@/lib/recruitment-api";
import { recruitmentApi, splitTags, joinTags } from "@/lib/recruitment-api";
import { Field } from "./SharedComponents";

export const skillFormSchema = z.object({
    name: z.string().min(1, "名称不能为空").max(50, "名称最多 50 个字符"),
    sortOrder: z.string().optional(),
    description: z.string().optional(),
    tagsText: z.string().optional(),
    content: z.string().max(10000, "内容过长"),
    isEnabled: z.boolean(),
});

type SkillFormValues = z.infer<typeof skillFormSchema>;

export interface SkillSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    skill: RecruitmentSkill | null;
    onSuccess: () => Promise<unknown> | void;
}

export function SkillSettingsDialog({ open, onOpenChange, skill, onSuccess }: SkillSettingsDialogProps) {
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<SkillFormValues>({
        resolver: zodResolver(skillFormSchema),
        defaultValues: {
            name: "",
            sortOrder: "99",
            description: "",
            tagsText: "",
            content: "",
            isEnabled: true,
        },
    });

    useEffect(() => {
        if (open) {
            if (skill) {
                form.reset({
                    name: skill.name,
                    sortOrder: String(skill.sort_order ?? 99),
                    description: skill.description || "",
                    tagsText: joinTags(skill.tags),
                    content: skill.content,
                    isEnabled: skill.is_enabled,
                });
            } else {
                form.reset({
                    name: "",
                    sortOrder: "99",
                    description: "",
                    tagsText: "",
                    content: "",
                    isEnabled: true,
                });
            }
        }
    }, [open, skill, form]);

    const onSubmit = async (values: SkillFormValues) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const payload = {
                name: values.name.trim(),
                description: values.description?.trim() || null,
                content: values.content,
                tags: splitTags(values.tagsText || ""),
                sort_order: Number(values.sortOrder || "99"),
                is_enabled: values.isEnabled,
            };

            if (skill) {
                await recruitmentApi(`/skills/${skill.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("Skill 已更新");
            } else {
                await recruitmentApi(`/skills`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("Skill 已创建");
            }
            onOpenChange(false);
            await onSuccess();
        } catch (error) {
            toast.error(`保存 Skill 失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(88vh,840px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{skill ? "编辑 Skill" : "新增 Skill"}</DialogTitle>
                    <DialogDescription>
                        Skills 是管理员配置项，因此入口收在管理设置里，不占用主工作台主路径。
                    </DialogDescription>
                </DialogHeader>
                <form id="skill-form" onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-1 py-1 overflow-y-auto">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="名称" error={form.formState.errors.name?.message}>
                                <Input {...form.register("name")} />
                            </Field>
                            <Field label="排序" error={form.formState.errors.sortOrder?.message}>
                                <Input type="number" {...form.register("sortOrder")} />
                            </Field>
                        </div>
                        <Field label="描述" error={form.formState.errors.description?.message}>
                            <Input {...form.register("description")} />
                        </Field>
                        <Field label="标签" error={form.formState.errors.tagsText?.message}>
                            <Input {...form.register("tagsText")} placeholder="标签，使用英文逗号分隔" />
                        </Field>
                        <Field label="内容" className="flex min-h-0 flex-1 flex-col" error={form.formState.errors.content?.message}>
                            <Textarea
                                {...form.register("content")}
                                className="h-full min-h-[260px] flex-1 resize-none overflow-y-auto [field-sizing:fixed]"
                                rows={16}
                            />
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input type="checkbox" {...form.register("isEnabled")} />
                            保存后立即启用
                        </label>
                    </div>
                </form>
                <DialogFooter className="shrink-0 mt-4">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        取消
                    </Button>
                    <Button type="submit" form="skill-form" disabled={submitting}>
                        {submitting ? "保存中..." : "保存 Skill"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
