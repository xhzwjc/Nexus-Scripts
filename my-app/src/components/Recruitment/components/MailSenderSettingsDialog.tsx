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
import { ScrollArea } from "@/components/ui/scroll-area";

import type { RecruitmentMailSenderConfig } from "@/lib/recruitment-api";
import { recruitmentApi } from "@/lib/recruitment-api";
import { Field } from "./SharedComponents";

export const mailSenderFormSchema = z.object({
    name: z.string().min(1, "名称不能为空"),
    fromName: z.string().min(1, "发件人名称不能为空"),
    fromEmail: z.string().email("必须是有效的邮箱地址").min(1, "发件邮箱不能为空"),
    smtpHost: z.string().optional(),
    smtpPort: z.string().optional(),
    username: z.string().min(1, "登录账号不能为空"),
    password: z.string().optional(),
    useSsl: z.boolean(),
    useStarttls: z.boolean(),
    isDefault: z.boolean(),
    isEnabled: z.boolean(),
});

type MailSenderFormValues = z.infer<typeof mailSenderFormSchema>;

export interface MailSenderSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: RecruitmentMailSenderConfig | null;
    onSuccess: () => Promise<unknown> | void;
}

const mailSenderPresets: { key: string; label: string; host: string; port: number; ssl: boolean; starttls: boolean }[] = [
    { key: "163", label: "网易 163 邮箱", host: "smtp.163.com", port: 465, ssl: true, starttls: false },
    { key: "126", label: "网易 126 邮箱", host: "smtp.126.com", port: 465, ssl: true, starttls: false },
    { key: "qq", label: "QQ 邮箱", host: "smtp.qq.com", port: 465, ssl: true, starttls: false },
    { key: "exmail", label: "腾讯企业邮箱", host: "smtp.exmail.qq.com", port: 465, ssl: true, starttls: false },
    { key: "aliyun", label: "阿里云企业邮", host: "smtp.qiye.aliyun.com", port: 465, ssl: true, starttls: false },
    { key: "outlook", label: "Outlook / Hotmail", host: "smtp-mail.outlook.com", port: 587, ssl: false, starttls: true },
    { key: "gmail", label: "Gmail", host: "smtp.gmail.com", port: 465, ssl: true, starttls: false },
];

export function MailSenderSettingsDialog({ open, onOpenChange, config, onSuccess }: MailSenderSettingsDialogProps) {
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<MailSenderFormValues>({
        resolver: zodResolver(mailSenderFormSchema),
        defaultValues: {
            name: "",
            fromName: "",
            fromEmail: "",
            smtpHost: "",
            smtpPort: "465",
            username: "",
            password: "",
            useSsl: true,
            useStarttls: false,
            isDefault: false,
            isEnabled: true,
        },
    });

    useEffect(() => {
        if (open) {
            if (config) {
                form.reset({
                    name: config.name,
                    fromName: config.from_name || "",
                    fromEmail: config.from_email,
                    smtpHost: config.smtp_host,
                    smtpPort: String(config.smtp_port),
                    username: config.username,
                    password: "",
                    useSsl: config.use_ssl,
                    useStarttls: config.use_starttls,
                    isDefault: config.is_default,
                    isEnabled: config.is_enabled !== false,
                });
            } else {
                form.reset({
                    name: "",
                    fromName: "",
                    fromEmail: "",
                    smtpHost: "",
                    smtpPort: "465",
                    username: "",
                    password: "",
                    useSsl: true,
                    useStarttls: false,
                    isDefault: false,
                    isEnabled: true,
                });
            }
        }
    }, [open, config, form]);

    const applyMailSenderPreset = (key: string) => {
        const preset = mailSenderPresets.find((item) => item.key === key);
        if (!preset) return;
        form.setValue("smtpHost", preset.host, { shouldValidate: true });
        form.setValue("smtpPort", String(preset.port), { shouldValidate: true });
        form.setValue("useSsl", preset.ssl);
        form.setValue("useStarttls", preset.starttls);
        
        const currentEmail = form.getValues("fromEmail");
        if (currentEmail && !form.getValues("username")) {
            form.setValue("username", currentEmail, { shouldValidate: true });
        }
    };

    const onSubmit = async (values: MailSenderFormValues) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const payload = {
                name: values.name.trim(),
                from_name: values.fromName.trim(),
                from_email: values.fromEmail.trim(),
                smtp_host: values.smtpHost?.trim() || "",
                smtp_port: parseInt(values.smtpPort || "465", 10) || 465,
                username: values.username.trim(),
                password: values.password || undefined,
                use_ssl: values.useSsl,
                use_starttls: values.useStarttls,
                is_default: values.isDefault,
                is_enabled: values.isEnabled,
            };

            if (config) {
                await recruitmentApi(`/mail-senders/${config.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("发件箱已更新");
            } else {
                await recruitmentApi(`/mail-senders`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("发件箱已创建");
            }
            onOpenChange(false);
            await onSuccess();
        } catch (error) {
            toast.error(`保存发件箱失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{config ? "编辑发件箱" : "新增发件箱"}</DialogTitle>
                    <DialogDescription>
                        支持配置 163、Outlook、企业邮箱等 SMTP 发件箱。编辑已有发件箱时，密码可留空以继续使用当前密码。
                    </DialogDescription>
                </DialogHeader>
                <form id="mail-sender-form" onSubmit={form.handleSubmit(onSubmit)}>
                    <ScrollArea className="max-h-[65vh]">
                        <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                            <Field label="名称" error={form.formState.errors.name?.message}>
                                <Input {...form.register("name")} />
                            </Field>
                            <Field label="发件人名称" error={form.formState.errors.fromName?.message}>
                                <Input {...form.register("fromName")} placeholder="例如：某某科技招聘中心" />
                            </Field>
                            <Field label="发件邮箱" error={form.formState.errors.fromEmail?.message}>
                                <Input {...form.register("fromEmail")} placeholder="name@example.com" />
                            </Field>
                            <Field label="登录账号" error={form.formState.errors.username?.message}>
                                <Input {...form.register("username")} />
                            </Field>
                            <Field label="SMTP Host" error={form.formState.errors.smtpHost?.message}>
                                <Input {...form.register("smtpHost")} placeholder="smtp.163.com" />
                            </Field>
                            <Field label="SMTP Port" error={form.formState.errors.smtpPort?.message}>
                                <Input type="number" {...form.register("smtpPort")} />
                            </Field>
                            
                            <div className="md:col-span-2 flex flex-wrap gap-2 px-1 py-1">
                                {mailSenderPresets.map((preset) => (
                                    <Button key={preset.key} type="button" size="sm" variant="outline"
                                            onClick={() => applyMailSenderPreset(preset.key)}>
                                        {preset.label}
                                    </Button>
                                ))}
                                <p className="self-center text-xs text-slate-500 dark:text-slate-400">
                                    如果 SMTP Host 留空，系统会尝试根据发件邮箱自动识别 163 / Outlook 默认配置。
                                </p>
                            </div>
                            
                            <Field label={config ? "密码（留空则不修改）" : "密码"} error={form.formState.errors.password?.message}>
                                <Input type="password" {...form.register("password")} />
                            </Field>
                        </div>
                        <div className="mt-4 grid gap-3 px-1 py-1 md:grid-cols-2">
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" {...form.register("useSsl")} />
                                使用 SSL
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" {...form.register("useStarttls")} />
                                使用 STARTTLS
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" {...form.register("isDefault")} />
                                设为默认发件箱
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" {...form.register("isEnabled")} />
                                启用此发件箱
                            </label>
                        </div>
                    </ScrollArea>
                </form>
                <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
                    <Button type="submit" form="mail-sender-form" disabled={submitting}>
                        {submitting ? "保存中..." : "保存发件箱"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
