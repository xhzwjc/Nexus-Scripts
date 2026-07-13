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
import {Button} from "@/components/ui/button";

import {EmptyState, LoadingPanel} from "../components/SharedComponents";
import {
    formatLongDateTime,
    labelForCandidateStatus,
    labelForResumeMailDispatchStatus,
    shortText,
} from "../utils";

type MailSettingsPageProps = {
    mailSenderConfigs: RecruitmentMailSenderConfig[];
    mailRecipients: RecruitmentMailRecipient[];
    resumeMailDispatches: Array<RecruitmentResumeMailDispatch & {
        candidate_names?: string[];
        position_title?: string | null;
    }>;
    mailAutoPushGlobalConfig: RecruitmentMailAutoPushGlobalConfig;
    mailSettingsLoading: boolean;
    mailSendersLoading: boolean;
    mailRecipientsLoading: boolean;
    mailDispatchesLoading: boolean;
    mailAutoConfigLoading: boolean;
    mailAutoPushConfigSaving: boolean;
    mailRecipientMap: Map<number, RecruitmentMailRecipient>;
    mailSenderMap: Map<number, RecruitmentMailSenderConfig>;
    candidateMap: Map<number, CandidateSummary>;
    positionMap: Map<number, PositionSummary>;
    mailDispatchActionKey: string | null;
    mailDispatchDetailLoadingId: number | null;
    resumeMailDispatchTotal: number;
    resumeMailDispatchPageIndex: number;
    resumeMailDispatchPageSize: number;
    selectedCandidateIds: number[];
    selectedCandidateId: number | null;
    canViewMail: boolean;
    canManageMailSenders: boolean;
    canManageMailRecipients: boolean;
    canSendMail: boolean;
    openMailSenderEditor: (sender?: RecruitmentMailSenderConfig) => void;
    openMailRecipientEditor: (recipient?: RecruitmentMailRecipient) => void;
    openResumeMailDialog: () => void;
    openResumeMailReplayDialog: (dispatch: RecruitmentResumeMailDispatch) => Promise<void>;
    retryResumeMailDispatch: (dispatch: RecruitmentResumeMailDispatch) => Promise<void>;
    setMailSenderDeleteTarget: (sender: RecruitmentMailSenderConfig) => void;
    setMailRecipientDeleteTarget: (recipient: RecruitmentMailRecipient) => void;
    setMailAutoPushGlobalConfig: React.Dispatch<React.SetStateAction<RecruitmentMailAutoPushGlobalConfig>>;
    saveMailAutoPushGlobalConfig: (config: RecruitmentMailAutoPushGlobalConfig) => Promise<void>;
    refreshMailSettingsWithFeedback: () => Promise<void>;
    onResumeMailDispatchPageChange: (pageIndex: number) => void;
};

const enabledTone = "bg-[rgba(12,201,145,0.1)] text-[#0B9F75]";
const disabledTone = "bg-[#F2F3F5] text-[#86888F]";

export function MailSettingsPage({
    mailSenderConfigs,
    mailRecipients,
    resumeMailDispatches,
    mailAutoPushGlobalConfig,
    mailSettingsLoading,
    mailSendersLoading,
    mailRecipientsLoading,
    mailDispatchesLoading,
    mailAutoConfigLoading,
    mailAutoPushConfigSaving,
    mailRecipientMap,
    mailSenderMap,
    candidateMap,
    positionMap,
    mailDispatchActionKey,
    mailDispatchDetailLoadingId,
    resumeMailDispatchTotal,
    resumeMailDispatchPageIndex,
    resumeMailDispatchPageSize,
    selectedCandidateIds,
    selectedCandidateId,
    canViewMail,
    canManageMailSenders,
    canManageMailRecipients,
    canSendMail,
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
    onResumeMailDispatchPageChange,
}: MailSettingsPageProps) {
    const {t, language} = useI18n();
    const isZh = language === "zh-CN";
    const dispatchPageCount = Math.max(1, Math.ceil(resumeMailDispatchTotal / resumeMailDispatchPageSize));
    const selectedGlobalRecipientEmails = mailAutoPushGlobalConfig.global_default_recipient_ids
        .map((recipientId) => mailRecipientMap.get(recipientId)?.email || "")
        .filter(Boolean);

    return (
        <section aria-labelledby="settings-mail-title">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h1 id="settings-mail-title" className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{isZh ? "邮件配置与投递中心" : "Mail Configuration & Delivery"}</h1>
                    <p className="text-[12px] leading-5 text-[#B0B2B8] dark:text-slate-400">{isZh ? "统一维护发件箱、收件人和发送记录，并支持从当前候选人上下文直接发简历。" : "Manage senders, recipients, and delivery records, and send resumes from the active candidate context."}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                    <Button variant="outline" size="icon" title={t.recruitment.refreshMailSettings} aria-label={t.recruitment.refreshMailSettings} className="h-9 w-9 rounded-[6px] border-[#E6E7EB] bg-white text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#0F23D9]" onClick={() => void refreshMailSettingsWithFeedback()} disabled={mailSettingsLoading}>
                        {mailSettingsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
                    </Button>
                    {canManageMailSenders ? <Button variant="outline" className="h-9 rounded-[6px] border-[#1E3BFA] bg-white px-4 text-[13px] font-normal text-[#0F23D9] shadow-none hover:bg-[rgba(30,59,250,0.05)]" onClick={() => openMailSenderEditor()}><Plus className="h-3.5 w-3.5"/>{t.recruitment.newSender}</Button> : null}
                    {canManageMailRecipients ? <Button variant="outline" className="h-9 rounded-[6px] border-[#1E3BFA] bg-white px-4 text-[13px] font-normal text-[#0F23D9] shadow-none hover:bg-[rgba(30,59,250,0.05)]" onClick={() => openMailRecipientEditor()}><Plus className="h-3.5 w-3.5"/>{t.recruitment.newRecipient}</Button> : null}
                    {canSendMail ? (
                        <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={openResumeMailDialog} disabled={!selectedCandidateIds.length && !selectedCandidateId} title={!selectedCandidateIds.length && !selectedCandidateId ? (isZh ? "请先在候选人页面选择候选人" : "Select a candidate first") : undefined}>
                            <Send className="h-3.5 w-3.5"/>{t.recruitment.sendCurrentCandidate}
                        </Button>
                    ) : null}
                </div>
            </div>

            {canViewMail || canManageMailRecipients ? <div className="mb-5 rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-4 shadow-none dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-[14px] font-semibold leading-5 text-[#0E1114] dark:text-slate-100">{isZh ? "全局自动推送默认配置" : "Global Auto-send Defaults"}</h2>
                        <p className="mt-1 text-[12px] leading-5 text-[#B0B2B8] dark:text-slate-400">{isZh ? "提供岗位可选复用的默认收件池。只有岗位明确开启自动推送且勾选使用全局收件人时，才会实际发送。" : "Provide a default recipient pool for positions. Delivery only occurs when the position explicitly enables auto-send and uses global recipients."}</p>
                    </div>
                    {canManageMailRecipients ? (
                        <Button className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={() => void saveMailAutoPushGlobalConfig(mailAutoPushGlobalConfig)} disabled={mailAutoPushConfigSaving}>
                            {mailAutoPushConfigSaving ? t.common.saving : (isZh ? "保存默认配置" : "Save defaults")}
                        </Button>
                    ) : null}
                </div>
                {mailAutoConfigLoading || mailRecipientsLoading ? (
                    <div className="py-5"><LoadingPanel label={t.common.loading}/></div>
                ) : (
                    <>
                        <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={mailAutoPushGlobalConfig.global_auto_push_enabled}
                                disabled={!canManageMailRecipients || mailAutoPushConfigSaving}
                                className="inline-flex items-center gap-3 text-[12px] text-[#33353D] disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300"
                                onClick={() => setMailAutoPushGlobalConfig((current) => ({...current, global_auto_push_enabled: !current.global_auto_push_enabled}))}
                            >
                                <span className={cn("flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", mailAutoPushGlobalConfig.global_auto_push_enabled ? "bg-[#1E3BFA]" : "bg-[#D6D8DD]")}>
                                    <span className={cn("h-4 w-4 rounded-full bg-white shadow-sm transition-transform", mailAutoPushGlobalConfig.global_auto_push_enabled ? "translate-x-4" : "translate-x-0")}/>
                                </span>
                                {isZh ? "启用系统级自动推送能力" : "Enable system-wide auto-send"}
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12px] text-[#86888F]">{isZh ? "默认收件人：" : "Default recipients:"}</span>
                                {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => {
                                    const selected = mailAutoPushGlobalConfig.global_default_recipient_ids.includes(recipient.id);
                                    return (
                                        <button
                                            key={`global-mail-recipient-${recipient.id}`}
                                            type="button"
                                            disabled={!canManageMailRecipients || mailAutoPushConfigSaving}
                                            className={cn("h-[26px] rounded-[4px] border px-2.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60", selected ? "border-[rgba(30,59,250,0.18)] bg-[rgba(30,59,250,0.07)] text-[#0F23D9]" : "border-[#E6E7EB] bg-white text-[#86888F] hover:border-[#1E3BFA]")}
                                            onClick={() => setMailAutoPushGlobalConfig((current) => ({...current, global_default_recipient_ids: current.global_default_recipient_ids.includes(recipient.id) ? current.global_default_recipient_ids.filter((id) => id !== recipient.id) : [...current.global_default_recipient_ids, recipient.id]}))}
                                        >
                                            {recipient.name}
                                        </button>
                                    );
                                }) : <span className="text-[12px] text-[#B0B2B8]">{t.recruitment.noRecipientsAvailable}</span>}
                            </div>
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-[#B0B2B8]">{isZh ? "当前默认邮箱：" : "Current default emails: "}{selectedGlobalRecipientEmails.length ? selectedGlobalRecipientEmails.join(isZh ? "、" : ", ") : (t.common.notSet || "Not set")}</p>
                    </>
                )}
            </div> : null}

            <div className="mb-5 grid gap-5 xl:grid-cols-2">
                {canViewMail || canManageMailSenders ? <div className="rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-5 shadow-none dark:border-slate-800 dark:bg-slate-950 xl:min-h-[270px]">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="text-[14px] font-semibold text-[#0E1114] dark:text-slate-100">{isZh ? "发件箱" : "Senders"}</h2>
                        <p className="text-[11px] text-[#B0B2B8]">{isZh ? "支持个人邮箱、163、Outlook，默认发件箱会作为简历发送时的首选。" : "Supports personal, 163, and Outlook mailboxes. The default sender is preferred."}</p>
                        {mailSendersLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#B0B2B8]" aria-hidden="true"/> : null}
                    </div>
                    <div className="mt-3 space-y-3">
                        {mailSendersLoading && !mailSenderConfigs.length ? (
                            <LoadingPanel label={t.common.loading}/>
                        ) : mailSenderConfigs.length ? mailSenderConfigs.map((sender) => (
                            <div key={sender.id} className="flex min-h-[64px] items-center justify-between gap-4 rounded-[6px] bg-[#F7F8FA] px-4 py-3 dark:bg-slate-900/60">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{sender.from_email}</p>
                                        {sender.is_default ? <span className="inline-flex h-[20px] items-center rounded-[4px] bg-[rgba(30,59,250,0.08)] px-2 text-[10px] text-[#1E3BFA]">{t.common.default || "Default"}</span> : null}
                                        {!sender.is_enabled ? <span className={cn("inline-flex h-[20px] items-center rounded-[4px] px-2 text-[10px]", disabledTone)}>{t.recruitment.disabled}</span> : null}
                                    </div>
                                    <p className="mt-1 truncate text-[11px] text-[#B0B2B8]" title={`${sender.name} · ${sender.username} · ${sender.smtp_host}:${sender.smtp_port}`}>{sender.name} · {isZh ? "登录账号" : "Login"}：{sender.username} · SMTP {sender.smtp_host}:{sender.smtp_port}</p>
                                </div>
                                {canManageMailSenders ? <div className="flex shrink-0 items-center gap-3 text-[12px]"><button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => openMailSenderEditor(sender)}>{t.common.edit}</button><button type="button" className="text-[#F53F3F] hover:text-[#D9363E]" onClick={() => setMailSenderDeleteTarget(sender)}>{t.common.delete}</button></div> : null}
                            </div>
                        )) : <EmptyState title={t.common.noSenders || "No Senders"} description={t.common.noSendersHint || "Set up at least one sender before sending resumes."}/>}
                    </div>
                </div> : null}

                {canViewMail || canManageMailRecipients ? <div className="rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-5 shadow-none dark:border-slate-800 dark:bg-slate-950 xl:min-h-[270px]">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="text-[14px] font-semibold text-[#0E1114] dark:text-slate-100">{isZh ? "收件人" : "Recipients"}</h2>
                        <p className="text-[11px] text-[#B0B2B8]">{isZh ? "统一维护公司内部可选收件人，发送时支持单选、多选。" : "Maintain reusable internal recipients for single or multi-select sending."}</p>
                        {mailRecipientsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#B0B2B8]" aria-hidden="true"/> : null}
                    </div>
                    <div className="mt-3 space-y-3">
                        {mailRecipientsLoading && !mailRecipients.length ? (
                            <LoadingPanel label={t.common.loading}/>
                        ) : mailRecipients.length ? mailRecipients.map((recipient) => (
                            <div key={recipient.id} className="flex min-h-[64px] items-center justify-between gap-4 rounded-[6px] bg-[#F7F8FA] px-4 py-3 dark:bg-slate-900/60">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{recipient.name} · {recipient.email}</p>
                                        {!recipient.is_enabled ? <span className={cn("inline-flex h-[20px] items-center rounded-[4px] px-2 text-[10px]", disabledTone)}>{t.recruitment.disabled}</span> : null}
                                    </div>
                                    <p className="mt-1 truncate text-[11px] text-[#B0B2B8]" title={[recipient.department, recipient.role_title, ...recipient.tags].filter(Boolean).join(" · ")}>{recipient.department || (t.common.noDepartment || "No department")} · {recipient.role_title || (t.common.noRole || "No role")}{recipient.tags.length ? ` · ${recipient.tags.join(isZh ? "、" : ", ")}` : ""}</p>
                                </div>
                                {canManageMailRecipients ? <div className="flex shrink-0 items-center gap-3 text-[12px]"><button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => openMailRecipientEditor(recipient)}>{t.common.edit}</button><button type="button" className="text-[#F53F3F] hover:text-[#D9363E]" onClick={() => setMailRecipientDeleteTarget(recipient)}>{t.common.delete}</button></div> : null}
                            </div>
                        )) : <EmptyState title={t.common.noRecipients || "No Recipients"} description={t.common.noRecipientsHint || "Maintain internal recipients for resume delivery."}/>}
                    </div>
                </div> : null}
            </div>

            {canViewMail ? <div className="rounded-[8px] border border-[#EBEEF5] bg-white shadow-none dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-5">
                    <h2 className="text-[14px] font-semibold text-[#0E1114] dark:text-slate-100">{isZh ? "发送记录" : "Delivery Records"}</h2>
                    <p className="text-[11px] text-[#B0B2B8]">{isZh ? "保留每次简历发送的发件箱、候选人、收件人、主题和状态，便于追踪是否已送达。" : "Track the sender, candidates, recipients, subject, status, and delivery time for each send."}</p>
                    {mailDispatchesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#B0B2B8]" aria-hidden="true"/> : null}
                </div>
                {mailDispatchesLoading && !resumeMailDispatches.length ? (
                    <div className="px-6 py-14"><LoadingPanel label={t.common.loading}/></div>
                ) : resumeMailDispatches.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1120px] table-fixed text-left">
                            <thead className="border-y border-[#EBEEF5] text-[11px] font-normal text-[#86888F] dark:border-slate-800 dark:text-slate-400">
                                <tr className="h-10"><th className="w-[150px] px-5 font-normal">{isZh ? "发件箱" : "Sender"}</th><th className="w-[170px] px-4 font-normal">{isZh ? "候选人" : "Candidates"}</th><th className="w-[360px] px-4 font-normal">{isZh ? "收件人 / 主题" : "Recipients / Subject"}</th><th className="w-[160px] px-4 font-normal">{isZh ? "触发状态" : "Trigger"}</th><th className="w-[100px] px-4 font-normal">{isZh ? "状态" : "Status"}</th><th className="w-[150px] px-4 font-normal">{isZh ? "发送时间" : "Sent at"}</th><th className="px-4 font-normal">{isZh ? "操作" : "Actions"}</th></tr>
                            </thead>
                            <tbody className="divide-y divide-[#F2F3F5] dark:divide-slate-800">
                                {resumeMailDispatches.map((dispatch) => {
                                    const recipientSummary = [...dispatch.recipient_ids.map((recipientId) => mailRecipientMap.get(recipientId)?.name || `${t.common.recipient || "Recipient"} #${recipientId}`), ...dispatch.recipient_emails].join(isZh ? "、" : ", ");
                                    const candidateSummary = dispatch.candidate_ids.map((candidateId, index) => (
                                        dispatch.candidate_names?.[index]
                                        || candidateMap.get(candidateId)?.name
                                        || `${t.common.candidate || "Candidate"} #${candidateId}`
                                    )).join(isZh ? "、" : ", ");
                                    const dispatchAction = `mail-dispatch-${dispatch.id}`;
                                    const isDispatchActing = mailDispatchActionKey === dispatchAction;
                                    const isDispatchDetailLoading = mailDispatchDetailLoadingId === dispatch.id;
                                    const statusSuccess = dispatch.status === "sent";
                                    return (
                                        <tr key={dispatch.id} className="h-[62px] text-[12px] text-[#33353D] hover:bg-[#F8F8F9] dark:text-slate-300 dark:hover:bg-slate-900/50">
                                            <td className="px-5"><p className="truncate text-[#0E1114] dark:text-slate-100">{mailSenderMap.get(dispatch.sender_config_id || 0)?.from_email || dispatch.sender_name || (t.common.defaultSender || "Default sender")}</p></td>
                                            <td className="px-4"><p className="truncate font-medium text-[#0F23D9]" title={candidateSummary}>{candidateSummary || (t.common.unrecorded || "-")}</p><p className="mt-0.5 truncate text-[11px] text-[#B0B2B8]">{dispatch.position_id ? dispatch.position_title || positionMap.get(dispatch.position_id)?.title || `${t.common.position || "Position"} #${dispatch.position_id}` : (t.common.noLinkedPosition || "No linked position")}</p></td>
                                            <td className="px-4"><p className="truncate text-[#0E1114] dark:text-slate-100" title={recipientSummary}>{recipientSummary || (t.common.unrecorded || "-")}</p><p className="mt-0.5 truncate text-[11px] text-[#B0B2B8]" title={dispatch.subject || ""}>{shortText(dispatch.subject || (t.common.noCustomSubject || "System default subject"), 100)}</p></td>
                                            <td className="px-4"><p>{dispatch.trigger_type === "screening_completed" ? (t.common.triggerScreeningCompleted || "Trigger: screening completed") : dispatch.send_mode === "automatic" ? (t.common.automatic || "Automatic") : (t.common.manual || "Manual")}</p><p className="mt-0.5 truncate text-[11px] text-[#B0B2B8]">{dispatch.candidate_status ? labelForCandidateStatus(dispatch.candidate_status) : "-"}</p></td>
                                            <td className="px-4"><span className={cn("inline-flex h-[22px] items-center rounded-[4px] px-2 text-[11px]", statusSuccess ? enabledTone : "bg-[rgba(245,63,63,0.08)] text-[#F53F3F]")}>{labelForResumeMailDispatchStatus(dispatch.status)}</span></td>
                                            <td className="px-4 text-[#86888F]">{formatLongDateTime(dispatch.sent_at || dispatch.created_at)}</td>
                                            <td className="px-4"><div className="flex items-center gap-3 whitespace-nowrap">{canSendMail && dispatch.status === "failed" ? <button type="button" className="text-[#F53F3F] hover:text-[#D9363E] disabled:opacity-50" onClick={() => void retryResumeMailDispatch(dispatch)} disabled={isDispatchActing || isDispatchDetailLoading}>{isDispatchActing || isDispatchDetailLoading ? t.common.retrying : t.common.retryFailedSend}</button> : null}{canSendMail ? <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA] disabled:opacity-50" onClick={() => void openResumeMailReplayDialog(dispatch)} disabled={isDispatchDetailLoading}>{isDispatchDetailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true"/> : (t.common.sendAgain || "Send Again")}</button> : null}</div></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="px-6 py-14"><EmptyState title={t.common.noDeliveryRecords || "No Delivery Records"} description={t.common.noDeliveryRecordsHint || "Delivery records will appear here after a resume is sent."}/></div>}
                {resumeMailDispatchTotal > resumeMailDispatchPageSize ? (
                    <div className="flex items-center justify-end gap-3 border-t border-[#EBEEF5] px-5 py-3 text-[12px] text-[#86888F] dark:border-slate-800">
                        <Button variant="outline" size="sm" disabled={resumeMailDispatchPageIndex <= 0 || mailDispatchesLoading} onClick={() => onResumeMailDispatchPageChange(resumeMailDispatchPageIndex - 1)}>{t.common.prev}</Button>
                        <span>{t.common.pagination.prefix} {resumeMailDispatchPageIndex + 1} {t.common.pagination.separator} {dispatchPageCount} {t.common.pagination.suffix}</span>
                        <Button variant="outline" size="sm" disabled={resumeMailDispatchPageIndex + 1 >= dispatchPageCount || mailDispatchesLoading} onClick={() => onResumeMailDispatchPageChange(resumeMailDispatchPageIndex + 1)}>{t.common.next}</Button>
                    </div>
                ) : null}
            </div> : null}
        </section>
    );
}
