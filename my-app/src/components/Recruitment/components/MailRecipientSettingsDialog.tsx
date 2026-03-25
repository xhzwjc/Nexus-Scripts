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

import type { RecruitmentMailRecipient } from "@/lib/recruitment-api";
import { recruitmentApi } from "@/lib/recruitment-api";
import { Field } from "./SharedComponents";

function splitTags(text: string): string[] {
    return text.split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);
}

function joinTags(tags?: string[] | null): string {
    return Array.isArray(tags) ? tags.join(", ") : "";
}

export const mailRecipientFormSchema = z.object({
    name: z.string().min(1, "姓名不能为空"),
    email: z.string().email("必须是有效的邮箱地址").min(1, "邮箱不能为空"),
    department: z.string().optional(),
    roleTitle: z.string().optional(),
    tagsText: z.string().optional(),
    notes: z.string().optional(),
    isEnabled: z.boolean(),
});

type MailRecipientFormValues = z.infer<typeof mailRecipientFormSchema>;

export interface MailRecipientSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recipient: RecruitmentMailRecipient | null;
    onSuccess: () => Promise<unknown> | void;
}

export function MailRecipientSettingsDialog({ open, onOpenChange, recipient, onSuccess }: MailRecipientSettingsDialogProps) {
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<MailRecipientFormValues>({
        resolver: zodResolver(mailRecipientFormSchema),
        defaultValues: {
            name: "",
            email: "",
            department: "",
            roleTitle: "",
            tagsText: "",
            notes: "",
            isEnabled: true,
        },
    });

    useEffect(() => {
        if (open) {
            if (recipient) {
                form.reset({
                    name: recipient.name,
                    email: recipient.email,
                    department: recipient.department || "",
                    roleTitle: recipient.role_title || "",
                    tagsText: joinTags(recipient.tags),
                    notes: recipient.notes || "",
                    isEnabled: recipient.is_enabled !== false,
                });
            } else {
                form.reset({
                    name: "",
                    email: "",
                    department: "",
                    roleTitle: "",
                    tagsText: "",
                    notes: "",
                    isEnabled: true,
                });
            }
        }
    }, [open, recipient, form]);

    const onSubmit = async (values: MailRecipientFormValues) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const payload = {
                name: values.name.trim(),
                email: values.email.trim(),
                department: values.department?.trim() || null,
                role_title: values.roleTitle?.trim() || null,
                tags: splitTags(values.tagsText || ""),
                notes: values.notes?.trim() || null,
                is_enabled: values.isEnabled,
            };

            if (recipient) {
                await recruitmentApi(`/mail-recipients/${recipient.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("收件人已更新");
            } else {
                await recruitmentApi(`/mail-recipients`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("收件人已创建");
            }
            onOpenChange(false);
            await onSuccess();
        } catch (error) {
            toast.error(`保存收件人失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{recipient ? "编辑收件人" : "新增收件人"}</DialogTitle>
                    <DialogDescription>
                        可维护公司招聘团队、面试官、部门负责人等收件人，发送简历时支持多选和复用。
                    </DialogDescription>
                </DialogHeader>
                <form id="mail-recipient-form" onSubmit={form.handleSubmit(onSubmit)} className="min-h-0 flex-1 flex flex-col">
                    <ScrollArea className="flex-1 px-1">
                        <div className="space-y-4 py-2">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="姓名" error={form.formState.errors.name?.message}>
                                    <Input {...form.register("name")} />
                                </Field>
                                <Field label="邮箱" error={form.formState.errors.email?.message}>
                                    <Input {...form.register("email")} placeholder="name@example.com" />
                                </Field>
                                <Field label="部门" error={form.formState.errors.department?.message}>
                                    <Input {...form.register("department")} />
                                </Field>
                                <Field label="岗位" error={form.formState.errors.roleTitle?.message}>
                                    <Input {...form.register("roleTitle")} />
                                </Field>
                            </div>
                            <Field label="标签（用逗号分隔）" error={form.formState.errors.tagsText?.message}>
                                <Input {...form.register("tagsText")} placeholder="例如：前端负责人, 一面面试官" />
                            </Field>
                            <Field label="备注留言" error={form.formState.errors.notes?.message}>
                                <Textarea {...form.register("notes")} rows={3} placeholder="可选" />
                            </Field>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" {...form.register("isEnabled")} />
                                启用此收件人（停用后在发送列表里默认隐藏）
                            </label>
                        </div>
                    </ScrollArea>
                </form>
                <DialogFooter className="shrink-0 mt-4">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
                    <Button type="submit" form="mail-recipient-form" disabled={submitting}>
                        {submitting ? "保存中..." : "保存收件人"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
