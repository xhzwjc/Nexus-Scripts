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
    const { t, language } = useI18n();
    const isZh = language === "zh-CN";
    const hasMailData = mailSenderConfigs.length || mailRecipients.length || resumeMailDispatches.length;
    const selectedGlobalRecipientEmails = mailAutoPushGlobalConfig.global_default_recipient_ids
        .map((recipientId) => mailRecipientMap.get(recipientId)?.email || "")
        .filter(Boolean);

    if (mailSettingsLoading && !hasMailData) {
        return <LoadingPanel label={t.common.loadingMailCenter || "Loading mail center"}/>;
    }

    return (
        <div className="space-y-6">
            <Card className={panelClass}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
                    <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.common.mailConfigCenter || "Mail Configuration & Delivery Center"}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.common.mailConfigHint || "Manage senders, recipients, and delivery logs in one place, and send resumes directly from the current candidate context."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void refreshMailSettingsWithFeedback()} disabled={mailSettingsLoading}>
                            {mailSettingsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                            {mailSettingsLoading ? t.common.refreshing : t.recruitment.refreshMailSettings}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => openResumeMailDialog()}
                            disabled={!selectedCandidateIds.length && !selectedCandidateId}
                        >
                            <Send className="h-4 w-4"/>
                            {t.recruitment.sendCurrentCandidate}
                        </Button>
                        <Button variant="outline" onClick={() => openMailRecipientEditor()}>
                            <Plus className="h-4 w-4"/>
                            {t.recruitment.newRecipient}
                        </Button>
                        <Button onClick={() => openMailSenderEditor()}>
                            <Plus className="h-4 w-4"/>
                            {t.recruitment.newSender}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
                <Card className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{t.common.globalAutoSendDefaults || "Global Auto-Send Defaults"}</CardTitle>
                        <CardDescription>{t.common.globalAutoSendHint || "Provide a default recipient pool that positions can reuse. It only sends when a position explicitly enables auto-send and opts into global recipients."}</CardDescription>
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
                            {t.common.enableSystemAutoSend || "Enable system-wide auto-send"}
                        </label>
                        <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{t.common.globalDefaultRecipients || "Global Default Recipients"}</p>
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
                                }) : <p className="text-sm text-slate-500 dark:text-slate-400">{t.recruitment.noRecipientsAvailable}</p>}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200/80 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <span>{t.common.currentDefaultEmails || "Current default emails:"} {selectedGlobalRecipientEmails.length ? selectedGlobalRecipientEmails.join(isZh ? "、" : ", ") : (t.common.notSet || "Not set")}</span>
                            <Button
                                size="sm"
                                onClick={() => void saveMailAutoPushGlobalConfig(mailAutoPushGlobalConfig)}
                                disabled={!canManageMailConfig || mailAutoPushConfigSaving}
                            >
                                {mailAutoPushConfigSaving ? t.common.saving : t.common.saveDefaults || "Save Defaults"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{t.common.senders || "Senders"}</CardTitle>
                        <CardDescription>{t.common.sendersHint || "Supports personal mailboxes, 163, Outlook, and later corporate mail. The default sender is preferred when sending resumes."}</CardDescription>
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
                                        {sender.is_default ? <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{t.common.default || "Default"}</Badge> : null}
                                        <Badge
                                            className={cn("rounded-full border", sender.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                            {sender.is_enabled ? t.recruitment.enabled : t.recruitment.disabled}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <InfoTile label="SMTP" value={`${sender.smtp_host}:${sender.smtp_port}`}/>
                                    <InfoTile label={t.common.username || "Username"} value={sender.username}/>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openMailSenderEditor(sender)}>{t.common.edit}</Button>
                                    <Button size="sm" variant="outline" onClick={() => setMailSenderDeleteTarget(sender)}>{t.common.delete}</Button>
                                </div>
                            </div>
                        )) : <EmptyState title={t.common.noSenders || "No Senders"} description={t.common.noSendersHint || "Set up at least one sender before resumes can be sent to recruiters, interviewers, or hiring managers."}/>}
                    </CardContent>
                </Card>

                <Card className={panelClass}>
                    <CardHeader>
                        <CardTitle className="text-lg">{t.common.recipients || "Recipients"}</CardTitle>
                        <CardDescription>{t.common.recipientsHint || "Manage internal recipients in one place. Sending supports single-select, multi-select, and temporary external emails."}</CardDescription>
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
                                        {recipient.is_enabled ? t.recruitment.selectable : t.recruitment.disabled}
                                    </Badge>
                                </div>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                    {recipient.department || (t.common.noDepartment || "No department")} / {recipient.role_title || (t.common.noRole || "No role")}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {recipient.tags.map((tag) => (
                                        <Badge key={tag} variant="outline" className="rounded-full">{tag}</Badge>
                                    ))}
                                </div>
                                {recipient.notes ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{recipient.notes}</p> : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openMailRecipientEditor(recipient)}>{t.common.edit}</Button>
                                    <Button size="sm" variant="outline" onClick={() => setMailRecipientDeleteTarget(recipient)}>{t.common.delete}</Button>
                                </div>
                            </div>
                        )) : <EmptyState title={t.common.noRecipients || "No Recipients"} description={t.common.noRecipientsHint || "Maintain the internal recipient list here so you can multi-select them when sending resumes."}/>}
                    </CardContent>
                </Card>
            </div>

            <Card className={panelClass}>
                <CardHeader>
                    <CardTitle className="text-lg">{t.common.deliveryRecords || "Delivery Records"}</CardTitle>
                    <CardDescription>{t.common.deliveryRecordsHint || "Keep the sender, candidate, recipients, subject, and status for every resume delivery so you can trace what was sent."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {resumeMailDispatches.length ? resumeMailDispatches.map((dispatch) => {
                        const recipientSummary = [
                            ...dispatch.recipient_ids.map((recipientId) => mailRecipientMap.get(recipientId)?.name || `${t.common.recipient || "Recipient"} #${recipientId}`),
                            ...dispatch.recipient_emails,
                        ].join(isZh ? "、" : ", ");
                        const candidateSummary = dispatch.candidate_ids
                            .map((candidateId) => candidateMap.get(candidateId)?.name || `${t.common.candidate || "Candidate"} #${candidateId}`)
                            .join(isZh ? "、" : ", ");
                        const dispatchAction = `mail-dispatch-${dispatch.id}`;
                        const isDispatchActing = mailDispatchActionKey === dispatchAction;

                        return (
                            <div key={dispatch.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{dispatch.subject || (t.common.noCustomSubject || "No custom subject (system default subject will be used)")}</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                            {mailSenderMap.get(dispatch.sender_config_id || 0)?.name || dispatch.sender_name || (t.common.defaultSender || "Default sender")} / {formatLongDateTime(dispatch.sent_at || dispatch.created_at)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="outline" className="rounded-full">
                                            {dispatch.send_mode === "automatic" ? (t.common.automatic || "Automatic") : (t.common.manual || "Manual")}
                                        </Badge>
                                        {dispatch.trigger_type ? (
                                            <Badge variant="outline" className="rounded-full">
                                                {dispatch.trigger_type === "screening_completed" ? (t.common.triggerScreeningCompleted || "Trigger: screening completed") : dispatch.trigger_type}
                                            </Badge>
                                        ) : null}
                                        <Badge className={cn("rounded-full border", statusBadgeClass("task", dispatch.status === "sent" ? "success" : dispatch.status))}>
                                            {labelForResumeMailDispatchStatus(dispatch.status)}
                                        </Badge>
                                        {dispatch.status === "sent" ? <Badge variant="outline" className="rounded-full">{t.common.canResend || "Can Resend"}</Badge> : null}
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <InfoTile label={t.common.candidates || "Candidates"} value={shortText(candidateSummary || (t.common.unrecorded || "Unrecorded"), 120)}/>
                                    <InfoTile label={t.common.recipientsLabel || "Recipients"} value={shortText(recipientSummary || (t.common.unrecorded || "Unrecorded"), 120)}/>
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <InfoTile
                                        label={t.common.sourcePosition || "Source Position"}
                                        value={dispatch.position_id ? (positionMap.get(dispatch.position_id)?.title || `${t.common.position || "Position"} #${dispatch.position_id}`) : (t.common.noLinkedPosition || "No linked position")}
                                    />
                                    <InfoTile
                                        label={t.common.triggerStatus || "Trigger Status"}
                                        value={dispatch.candidate_status ? labelForCandidateStatus(dispatch.candidate_status) : (t.common.unrecorded || "Unrecorded")}
                                    />
                                </div>
                                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{shortText(dispatch.body_text || (t.common.defaultEmailBodyHint || "When the body is blank, the system uses the default email template."), 180)}</p>
                                {dispatch.error_message ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{dispatch.error_message}</p> : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {dispatch.status === "failed" ? (
                                        <Button size="sm" variant="outline" onClick={() => void retryResumeMailDispatch(dispatch)} disabled={isDispatchActing}>
                                            {isDispatchActing ? t.common.retrying : t.common.retryFailedSend}
                                        </Button>
                                    ) : null}
                                    <Button size="sm" variant="outline" onClick={() => openResumeMailReplayDialog(dispatch)}>
                                        {t.common.sendAgain || "Send Again"}
                                    </Button>
                                </div>
                            </div>
                        );
                    }) : <EmptyState title={t.common.noDeliveryRecords || "No Delivery Records"} description={t.common.noDeliveryRecordsHint || "After sending resumes from the candidate center, the full delivery audit trail will appear here."}/>}
                </CardContent>
            </Card>
        </div>
    );
}
