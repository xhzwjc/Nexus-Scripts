"use client";

import React from "react";
import {Loader2, Plus, RefreshCw, Send} from "lucide-react";

import type {
    CandidateSummary,
    PositionSummary,
    RecruitmentMailAutoPushGlobalConfig,
    RecruitmentMailRecipient,
    RecruitmentMailSenderConfig,
    RecruitmentResumeMailDispatch,
} from "@/lib/recruitment-api";
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

import {EmptyState, InfoTile, LoadingPanel} from "../components/SharedComponents";
import {
    formatLongDateTime,
    labelForCandidateStatus,
    labelForResumeMailDispatchStatus,
    shortText,
    statusBadgeClass,
} from "../utils";

type MailSettingsPageProps = {
    panelClass: string;
    mailSenderConfigs: RecruitmentMailSenderConfig[];
    mailRecipients: RecruitmentMailRecipient[];
    resumeMailDispatches: RecruitmentResumeMailDispatch[];
    mailAutoPushGlobalConfig: RecruitmentMailAutoPushGlobalConfig;
    mailSettingsLoading: boolean;
    mailAutoPushConfigSaving: boolean;
    mailRecipientMap: Map<number, RecruitmentMailRecipient>;
    mailSenderMap: Map<number, RecruitmentMailSenderConfig>;
    candidateMap: Map<number, CandidateSummary>;
    positionMap: Map<number, PositionSummary>;
    mailDispatchActionKey: string | null;
    selectedCandidateIds: number[];
    selectedCandidateId: number | null;
    canManageMailConfig: boolean;
    openMailSenderEditor: (sender?: RecruitmentMailSenderConfig) => void;
    openMailRecipientEditor: (recipient?: RecruitmentMailRecipient) => void;
    openResumeMailDialog: () => void;
    openResumeMailReplayDialog: (dispatch: RecruitmentResumeMailDispatch) => void;
    retryResumeMailDispatch: (dispatch: RecruitmentResumeMailDispatch) => Promise<void>;
    setMailSenderDeleteTarget: (sender: RecruitmentMailSenderConfig) => void;
    setMailRecipientDeleteTarget: (recipient: RecruitmentMailRecipient) => void;
    setMailAutoPushGlobalConfig: React.Dispatch<React.SetStateAction<RecruitmentMailAutoPushGlobalConfig>>;
    saveMailAutoPushGlobalConfig: (config: RecruitmentMailAutoPushGlobalConfig) => Promise<void>;
    refreshMailSettingsWithFeedback: () => Promise<void>;
};

export function MailSettingsPage({
    panelClass,
    mailSenderConfigs,
    mailRecipients,
    resumeMailDispatches,
    mailAutoPushGlobalConfig,
    mailSettingsLoading,
    mailAutoPushConfigSaving,
    mailRecipientMap,
    mailSenderMap,
    candidateMap,
    positionMap,
    mailDispatchActionKey,
    selectedCandidateIds,
    selectedCandidateId,
    canManageMailConfig,
    openMailSenderEditor,
    openMailRecipientEditor,
    openResumeMailDialog,
    openResumeMailReplayDialog,
    retryResumeMailDispatch,
    setMailSenderDeleteTarget,
    setMailRecipientDeleteTarget,
    setMailAutoPushGlobalConfig,
    saveMailAutoPushGlobalConfig,
    refreshMailSettingsWithFeedback,
}: MailSettingsPageProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";
    const hasMailData = mailSenderConfigs.length || mailRecipients.length || resumeMailDispatches.length;
    const selectedGlobalRecipientEmails = mailAutoPushGlobalConfig.global_default_recipient_ids
        .map((recipientId) => mailRecipientMap.get(recipientId)?.email || "")
        .filter(Boolean);

    if (mailSettingsLoading && !hasMailData) {
        return <LoadingPanel label={isZh ? "正在加载邮件中心" : "Loading mail center"}/>;
    }

    return (
        <div className="space-y-6">
            <Card className={panelClass}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
                    <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{isZh ? "邮件配置与投递中心" : "Mail Configuration & Delivery Center"}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{isZh ? "统一维护发件箱、收件人和发送记录，并支持从当前候选人上下文直接发简历。" : "Manage senders, recipients, and delivery logs in one place, and send resumes directly from the current candidate context."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void refreshMailSettingsWithFeedback()} disabled={mailSettingsLoading}>
                            {mailSettingsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                            {mailSettingsLoading ? (isZh ? "刷新中..." : "Refreshing...") : (isZh ? "刷新邮件配置" : "Refresh Mail Settings")}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => openResumeMailDialog()}
                            disabled={!selectedCandidateIds.length && !selectedCandidateId}
                        >
                            <Send className="h-4 w-4"/>
                            {isZh ? "发送当前候选人" : "Send Current Candidate"}
                        </Button>
                        <Button variant="outline" onClick={() => openMailRecipientEditor()}>
                            <Plus className="h-4 w-4"/>
                            {isZh ? "新增收件人" : "New Recipient"}
                        </Button>
                        <Button onClick={() => openMailSenderEditor()}>
                            <Plus className="h-4 w-4"/>
                            {isZh ? "新增发件箱" : "New Sender"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
                <Card className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{isZh ? "全局自动推送默认配置" : "Global Auto-Send Defaults"}</CardTitle>
                        <CardDescription>{isZh ? "提供岗位可选复用的默认收件池。只有岗位明确开启自动推送且勾选使用全局收件人时，才会实际发送。" : "Provide a default recipient pool that positions can reuse. It only sends when a position explicitly enables auto-send and opts into global recipients."}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input
                                type="checkbox"
                                checked={mailAutoPushGlobalConfig.global_auto_push_enabled}
                                disabled={!canManageMailConfig || mailAutoPushConfigSaving}
                                onChange={(event) => setMailAutoPushGlobalConfig((current) => ({
                                    ...current,
                                    global_auto_push_enabled: event.target.checked,
                                }))}
                            />
                            {isZh ? "启用系统级自动推送能力" : "Enable system-wide auto-send"}
                        </label>
                        <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{isZh ? "全局默认收件人" : "Global Default Recipients"}</p>
                            <div className="flex flex-wrap gap-2">
                                {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => {
                                    const selected = mailAutoPushGlobalConfig.global_default_recipient_ids.includes(recipient.id);
                                    return (
                                        <button
                                            key={`global-mail-recipient-${recipient.id}`}
                                            type="button"
                                            disabled={!canManageMailConfig || mailAutoPushConfigSaving}
                                            className={cn(
                                                "rounded-full border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-60",
                                                selected
                                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                            )}
                                            onClick={() => setMailAutoPushGlobalConfig((current) => ({
                                                ...current,
                                                global_default_recipient_ids: current.global_default_recipient_ids.includes(recipient.id)
                                                    ? current.global_default_recipient_ids.filter((id) => id !== recipient.id)
                                                    : [...current.global_default_recipient_ids, recipient.id],
                                            }))}
                                        >
                                            {recipient.name}
                                        </button>
                                    );
                                }) : <p className="text-sm text-slate-500 dark:text-slate-400">{isZh ? "暂无可用收件人，请先新增收件人。" : "No recipients available yet. Add recipients first."}</p>}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200/80 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <span>{isZh ? "当前默认邮箱：" : "Current default emails: "}{selectedGlobalRecipientEmails.length ? selectedGlobalRecipientEmails.join(isZh ? "、" : ", ") : (isZh ? "未设置" : "Not set")}</span>
                            <Button
                                size="sm"
                                onClick={() => void saveMailAutoPushGlobalConfig(mailAutoPushGlobalConfig)}
                                disabled={!canManageMailConfig || mailAutoPushConfigSaving}
                            >
                                {mailAutoPushConfigSaving ? (isZh ? "保存中..." : "Saving...") : (isZh ? "保存默认配置" : "Save Defaults")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{isZh ? "发件箱" : "Senders"}</CardTitle>
                        <CardDescription>{isZh ? "支持个人邮箱、163、Outlook 和后续企业邮箱。默认发件箱会作为简历发送时的首选。" : "Supports personal mailboxes, 163, Outlook, and later corporate mail. The default sender is preferred when sending resumes."}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {mailSenderConfigs.length ? mailSenderConfigs.map((sender) => (
                            <div key={sender.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{sender.name}</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sender.from_name || sender.name} &lt;{sender.from_email}&gt;</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {sender.is_default ? <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{isZh ? "默认" : "Default"}</Badge> : null}
                                        <Badge
                                            className={cn("rounded-full border", sender.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                            {sender.is_enabled ? (isZh ? "启用中" : "Enabled") : (isZh ? "已停用" : "Disabled")}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <InfoTile label="SMTP" value={`${sender.smtp_host}:${sender.smtp_port}`}/>
                                    <InfoTile label={isZh ? "登录账号" : "Username"} value={sender.username}/>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openMailSenderEditor(sender)}>{isZh ? "编辑" : "Edit"}</Button>
                                    <Button size="sm" variant="outline" onClick={() => setMailSenderDeleteTarget(sender)}>{isZh ? "删除" : "Delete"}</Button>
                                </div>
                            </div>
                        )) : <EmptyState title={isZh ? "暂无发件箱" : "No Senders"} description={isZh ? "先配置至少一个发件箱，后续才能把简历发送给招聘团队、面试官或业务负责人。" : "Set up at least one sender before resumes can be sent to recruiters, interviewers, or hiring managers."}/>}
                    </CardContent>
                </Card>

                <Card className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{isZh ? "收件人" : "Recipients"}</CardTitle>
                        <CardDescription>{isZh ? "统一维护公司内部可选收件人，发送时支持单选、多选，并允许临时补充外部邮箱。" : "Manage internal recipients in one place. Sending supports single-select, multi-select, and temporary external emails."}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {mailRecipients.length ? mailRecipients.map((recipient) => (
                            <div key={recipient.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{recipient.name}</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{recipient.email}</p>
                                    </div>
                                    <Badge
                                        className={cn("rounded-full border", recipient.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                        {recipient.is_enabled ? (isZh ? "可选择" : "Selectable") : (isZh ? "已停用" : "Disabled")}
                                    </Badge>
                                </div>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                    {recipient.department || (isZh ? "未设置部门" : "No department")} / {recipient.role_title || (isZh ? "未设置岗位" : "No role")}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {recipient.tags.map((tag) => (
                                        <Badge key={tag} variant="outline" className="rounded-full">{tag}</Badge>
                                    ))}
                                </div>
                                {recipient.notes ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{recipient.notes}</p> : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openMailRecipientEditor(recipient)}>{isZh ? "编辑" : "Edit"}</Button>
                                    <Button size="sm" variant="outline" onClick={() => setMailRecipientDeleteTarget(recipient)}>{isZh ? "删除" : "Delete"}</Button>
                                </div>
                            </div>
                        )) : <EmptyState title={isZh ? "暂无收件人" : "No Recipients"} description={isZh ? "先维护公司内部收件人名单，发送简历时就能直接多选。" : "Maintain the internal recipient list here so you can multi-select them when sending resumes."}/>}
                    </CardContent>
                </Card>
            </div>

            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle className="text-lg">{isZh ? "发送记录" : "Delivery Records"}</CardTitle>
                    <CardDescription>{isZh ? "保留每次简历发送的发件箱、候选人、收件人、主题和状态，便于追踪是否已送达。" : "Keep the sender, candidate, recipients, subject, and status for every resume delivery so you can trace what was sent."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {resumeMailDispatches.length ? resumeMailDispatches.map((dispatch) => {
                        const recipientSummary = [
                            ...dispatch.recipient_ids.map((recipientId) => mailRecipientMap.get(recipientId)?.name || (isZh ? `收件人 #${recipientId}` : `Recipient #${recipientId}`)),
                            ...dispatch.recipient_emails,
                        ].join(isZh ? "、" : ", ");
                        const candidateSummary = dispatch.candidate_ids
                            .map((candidateId) => candidateMap.get(candidateId)?.name || (isZh ? `候选人 #${candidateId}` : `Candidate #${candidateId}`))
                            .join(isZh ? "、" : ", ");
                        const dispatchAction = `mail-dispatch-${dispatch.id}`;
                        const isDispatchActing = mailDispatchActionKey === dispatchAction;

                        return (
                            <div key={dispatch.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{dispatch.subject || (isZh ? "未自定义标题（将使用系统默认标题）" : "No custom subject (system default subject will be used)")}</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                            {mailSenderMap.get(dispatch.sender_config_id || 0)?.name || dispatch.sender_name || (isZh ? "默认发件箱" : "Default sender")} / {formatLongDateTime(dispatch.sent_at || dispatch.created_at)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="outline" className="rounded-full">
                                            {dispatch.send_mode === "automatic" ? (isZh ? "自动发送" : "Automatic") : (isZh ? "手动发送" : "Manual")}
                                        </Badge>
                                        {dispatch.trigger_type ? (
                                            <Badge variant="outline" className="rounded-full">
                                                {dispatch.trigger_type === "screening_completed" ? (isZh ? "触发：初筛完成" : "Trigger: screening completed") : dispatch.trigger_type}
                                            </Badge>
                                        ) : null}
                                        <Badge className={cn("rounded-full border", statusBadgeClass("task", dispatch.status === "sent" ? "success" : dispatch.status))}>
                                            {labelForResumeMailDispatchStatus(dispatch.status)}
                                        </Badge>
                                        {dispatch.status === "sent" ? <Badge variant="outline" className="rounded-full">{isZh ? "可再次发送" : "Can Resend"}</Badge> : null}
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <InfoTile label={isZh ? "候选人" : "Candidates"} value={shortText(candidateSummary || (isZh ? "未记录" : "Unrecorded"), 120)}/>
                                    <InfoTile label={isZh ? "收件人" : "Recipients"} value={shortText(recipientSummary || (isZh ? "未记录" : "Unrecorded"), 120)}/>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <InfoTile
                                        label={isZh ? "来源岗位" : "Source Position"}
                                        value={dispatch.position_id ? (positionMap.get(dispatch.position_id)?.title || (isZh ? `岗位 #${dispatch.position_id}` : `Position #${dispatch.position_id}`)) : (isZh ? "未关联岗位" : "No linked position")}
                                    />
                                    <InfoTile
                                        label={isZh ? "触发状态" : "Trigger Status"}
                                        value={dispatch.candidate_status ? labelForCandidateStatus(dispatch.candidate_status) : (isZh ? "未记录" : "Unrecorded")}
                                    />
                                </div>
                                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{shortText(dispatch.body_text || (isZh ? "正文留空时，系统会使用默认邮件正文模板。" : "When the body is blank, the system uses the default email template."), 180)}</p>
                                {dispatch.error_message ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{dispatch.error_message}</p> : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {dispatch.status === "failed" ? (
                                        <Button size="sm" variant="outline" onClick={() => void retryResumeMailDispatch(dispatch)} disabled={isDispatchActing}>
                                            {isDispatchActing ? (isZh ? "重试中..." : "Retrying...") : (isZh ? "失败重试" : "Retry Failed Send")}
                                        </Button>
                                    ) : null}
                                    <Button size="sm" variant="outline" onClick={() => openResumeMailReplayDialog(dispatch)}>
                                        {isZh ? "再次发送" : "Send Again"}
                                    </Button>
                                </div>
                            </div>
                        );
                    }) : <EmptyState title={isZh ? "暂无发送记录" : "No Delivery Records"} description={isZh ? "从候选人中心发送简历后，这里会沉淀完整的发送审计记录。" : "After sending resumes from the candidate center, the full delivery audit trail will appear here."}/>}
                </CardContent>
            </Card>
        </div>
    );
}
