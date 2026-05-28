"use client";

import React, {useCallback, useEffect, useDeferredValue, useMemo, useRef, useState} from "react";
import {ChevronDown, GripVertical, Pencil, Plus, Sparkles, Square, Trash2, X} from "lucide-react";

import type {ScreeningSkillDimension, ScreeningSkillFormData, SkillTaskKind} from "../types";
import {
    emptyScreeningSkillForm,
    generateSkillContent,
    newDimension,
    normalizeDimensionScores,
    parseSkillContent,
    validateSkillDimensions,
} from "../utils";

import {cn} from "@/lib/utils";
import {useI18n} from "@/lib/i18n";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Separator} from "@/components/ui/separator";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Textarea} from "@/components/ui/textarea";

type StructuredSkillEditorProps = {
    initialData?: ScreeningSkillFormData;
    editingSkillId?: number | null;
    onSubmit: (data: ScreeningSkillFormData) => Promise<void>;
    onCancel: () => void;
    submitting: boolean;
    submitError: string | null;
    onGenerateAI?: (
        roleName: string,
        extraRequirements: string,
        positionJd: string | null,
        onDelta?: (delta: string) => void,
    ) => Promise<{ content: string; completed: boolean }>;
    onStopGeneration?: () => void;
    aiGenerating?: boolean;
    defaultTab?: "structured" | "advanced" | "ai";
    positionId?: number | null;
    positionJdContent?: string | null;
    onGeneratedDirtyChange?: (dirty: boolean) => void;
};

/* ── Debounced text input: local state for typing, syncs to parent on blur ── */
function DebouncedInput({
    value,
    onCommit,
    ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange"> & {onCommit: (v: string) => void}) {
    const [local, setLocal] = useState(String(value ?? ""));
    const committedRef = useRef(String(value ?? ""));

    useEffect(() => {
        const str = String(value ?? "");
        if (str !== committedRef.current) {
            committedRef.current = str;
            setLocal(str);
        }
    }, [value]);

    return (
        <Input
            {...props}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
                committedRef.current = local;
                onCommit(local);
            }}
        />
    );
}

function DebouncedTextarea({
    value,
    onCommit,
    ...props
}: Omit<React.ComponentProps<typeof Textarea>, "onChange"> & {onCommit: (v: string) => void}) {
    const [local, setLocal] = useState(String(value ?? ""));
    const committedRef = useRef(String(value ?? ""));

    useEffect(() => {
        const str = String(value ?? "");
        if (str !== committedRef.current) {
            committedRef.current = str;
            setLocal(str);
        }
    }, [value]);

    return (
        <Textarea
            {...props}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
                committedRef.current = local;
                onCommit(local);
            }}
        />
    );
}

/* ── Memoized dimension row: only re-renders when its own data changes ── */
const DimensionRow = React.memo(function DimensionRow({
    dim,
    index,
    isEditing,
    onStartEdit,
    onCancelEdit,
    onUpdate,
    onRemove,
    onMove,
    isFirst,
    priorityOptions,
    skillUnnamed,
    skillDimensionName,
    skillDimensionPlaceholder,
    skillMaxScore,
    skillPriority,
    skillEvaluationFocus,
    skillEvaluationPlaceholder,
    skillHardRequirement,
}: {
    dim: ScreeningSkillDimension;
    index: number;
    isEditing: boolean;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onUpdate: (patch: Partial<ScreeningSkillDimension>) => void;
    onRemove: () => void;
    onMove: (direction: -1 | 1) => void;
    isFirst: boolean;
    priorityOptions: readonly {value: string; label: string}[];
    skillUnnamed: string;
    skillDimensionName: string;
    skillDimensionPlaceholder: string;
    skillMaxScore: string;
    skillPriority: string;
    skillEvaluationFocus: string;
    skillEvaluationPlaceholder: string;
    skillHardRequirement: string;
}) {
    const [localName, setLocalName] = useState(dim.name);
    const [localDesc, setLocalDesc] = useState(dim.description);

    useEffect(() => {
        setLocalName(dim.name);
        setLocalDesc(dim.description);
    }, [dim.name, dim.description]);

    return (
        <React.Fragment>
            <tr className={cn("border-t", isEditing && "bg-slate-50 dark:bg-slate-900/50")}>
                <td className="px-2 py-2 text-center text-slate-400">{index + 1}</td>
                <td className="px-3 py-2 font-medium">{dim.name || <span className="text-slate-400 italic">{skillUnnamed}</span>}</td>
                <td className="px-3 py-2 text-center">{dim.maxScore}</td>
                <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className="rounded-full text-xs">{priorityOptions.find((p) => p.value === dim.priority)?.label}</Badge>
                </td>
                <td className="px-3 py-2 text-center">{dim.isHardRequirement ? "✓" : ""}</td>
                <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove(-1)} disabled={isFirst}>
                            <GripVertical className="h-3.5 w-3.5 rotate-180" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={isEditing ? onCancelEdit : onStartEdit}>
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={onRemove}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </td>
            </tr>
            {isEditing && (
                <tr className="border-t bg-slate-50/50 dark:bg-slate-900/30">
                    <td colSpan={6} className="p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs">{skillDimensionName}</Label>
                                <Input
                                    value={localName}
                                    onChange={(e) => setLocalName(e.target.value)}
                                    onBlur={() => { if (localName !== dim.name) onUpdate({name: localName}); }}
                                    placeholder={skillDimensionPlaceholder}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">{skillMaxScore}</Label>
                                    <Input type="number" step="0.1" min="0.1" max="5.0" value={dim.maxScore} onChange={(e) => onUpdate({maxScore: parseFloat(e.target.value) || 0})} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">{skillPriority}</Label>
                                    <Select value={dim.priority} onValueChange={(v) => onUpdate({priority: v as ScreeningSkillDimension["priority"]})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {priorityOptions.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                            <Label className="text-xs">{skillEvaluationFocus}</Label>
                            <Textarea
                                value={localDesc}
                                onChange={(e) => setLocalDesc(e.target.value)}
                                onBlur={() => { if (localDesc !== dim.description) onUpdate({description: localDesc}); }}
                                placeholder={skillEvaluationPlaceholder}
                                rows={3}
                            />
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <Checkbox checked={dim.isHardRequirement} onCheckedChange={(v) => onUpdate({isHardRequirement: !!v})} />
                            <Label className="text-xs cursor-pointer">{skillHardRequirement}</Label>
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
});

const AiGeneratedContentPreview = React.memo(function AiGeneratedContentPreview({
    content,
    aiGenerating,
    isZh,
}: {
    content: string;
    aiGenerating?: boolean;
    isZh: boolean;
}) {
    const contentRef = useRef<HTMLDivElement | null>(null);
    const shouldAutoFollowRef = useRef(true);
    const [autoFollowPaused, setAutoFollowPaused] = useState(false);

    const scrollToLatest = useCallback(() => {
        const element = contentRef.current;
        if (!element) {
            return;
        }
        element.scrollTop = element.scrollHeight;
        shouldAutoFollowRef.current = true;
        setAutoFollowPaused(false);
    }, []);

    const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
        const nextPaused = distanceToBottom > 32;
        shouldAutoFollowRef.current = !nextPaused;
        setAutoFollowPaused((current) => (current === nextPaused ? current : nextPaused));
    }, []);

    useEffect(() => {
        if (!content) {
            shouldAutoFollowRef.current = true;
            setAutoFollowPaused(false);
            return;
        }
        if (!shouldAutoFollowRef.current) {
            return;
        }
        const frameId = window.requestAnimationFrame(scrollToLatest);
        return () => window.cancelAnimationFrame(frameId);
    }, [content, scrollToLatest]);

    return (
        <div className="mt-4 rounded-xl border border-white/80 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className={cn(
                        "inline-flex h-2 w-2 rounded-full",
                        aiGenerating ? "animate-pulse bg-violet-500" : "bg-emerald-500",
                    )} />
                    <span>
                        {aiGenerating
                            ? (isZh ? "正在实时输出内容" : "Streaming content live")
                            : (isZh ? "已完成本次生成，可继续检查并保存内容" : "Generation finished. Review and save when ready.")}
                    </span>
                </div>
                {autoFollowPaused ? (
                    <button
                        type="button"
                        className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-violet-900 dark:bg-slate-900 dark:text-violet-300 dark:hover:border-violet-700"
                        onClick={scrollToLatest}
                    >
                        {isZh ? "回到最新" : "Jump to latest"}
                    </button>
                ) : null}
            </div>
            <div
                ref={contentRef}
                className="mt-3 max-h-[320px] min-h-[180px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50/80 px-3 py-3 text-base leading-relaxed text-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                onScroll={handleScroll}
            >
                {content || (isZh ? "请稍候，实时内容将在这里继续更新..." : "Please wait. Live content will continue updating here...")}
            </div>
        </div>
    );
});

export function StructuredSkillEditor({
    initialData,
    editingSkillId,
    onSubmit,
    onCancel,
    submitting,
    submitError,
    onGenerateAI,
    onStopGeneration,
    aiGenerating,
    defaultTab = "structured",
    positionId,
    positionJdContent,
    onGeneratedDirtyChange,
}: StructuredSkillEditorProps) {
    const { t, language } = useI18n();
    const isZh = language === "zh-CN";

    const priorityOptions = [
        {value: "core", label: t.recruitment.skillPriorityCore},
        {value: "secondary", label: t.recruitment.skillPrioritySecondary},
        {value: "auxiliary", label: t.recruitment.skillPriorityAuxiliary},
        {value: "bonus", label: t.recruitment.skillPriorityBonus},
    ] as const;

    const [tab, setTab] = useState<string>(defaultTab);
    const [form, setForm] = useState<ScreeningSkillFormData>(initialData || emptyScreeningSkillForm());
    const [advancedContent, setAdvancedContent] = useState("");
    const [editingDimId, setEditingDimId] = useState<string | null>(null);
    const [aiRoleName, setAiRoleName] = useState("");
    const [aiExtraRequirements, setAiExtraRequirements] = useState("");
    const [aiGeneratedContent, setAiGeneratedContent] = useState("");
    const [aiAppliedNotice, setAiAppliedNotice] = useState<string | null>(null);
    const [aiSettingsExpanded, setAiSettingsExpanded] = useState(true);
    const [hasReceivedFirstAiToken, setHasReceivedFirstAiToken] = useState(false);
    const [streamProgressVisible, setStreamProgressVisible] = useState(false);
    const [streamProgressPercent, setStreamProgressPercent] = useState(0);
    const [streamEstimatedTotalChars, setStreamEstimatedTotalChars] = useState(0);
    const [streamCompleted, setStreamCompleted] = useState(false);
    const firstTokenReceivedRef = useRef(false);
    const progressHideTimerRef = useRef<number | null>(null);
    const aiLoadingMessages = useMemo(() => (
        isZh
            ? [
                "正在分析岗位要求...",
                "正在设计评估维度...",
                "正在生成评分标准...",
                "即将完成，请稍候...",
            ]
            : [
                "Analyzing position requirements...",
                "Designing evaluation dimensions...",
                "Generating scoring criteria...",
                "Almost done, please wait...",
            ]
    ), [isZh]);
    const [aiLoadingIndex, setAiLoadingIndex] = useState(0);

    useEffect(() => {
        if (initialData) {
            setForm(initialData);
            setAdvancedContent(generateSkillContent(initialData));
            onGeneratedDirtyChange?.(false);
            if (initialData.roleName) {
                setAiRoleName(initialData.roleName);
            }
        }
    }, [initialData, onGeneratedDirtyChange]);

    useEffect(() => {
        if (!aiGenerating || hasReceivedFirstAiToken) {
            setAiLoadingIndex(0);
            return;
        }
        const timer = window.setInterval(() => {
            setAiLoadingIndex((current) => (current + 1) % aiLoadingMessages.length);
        }, 3600);
        return () => window.clearInterval(timer);
    }, [aiGenerating, aiLoadingMessages.length, hasReceivedFirstAiToken]);

    useEffect(() => {
        return () => {
            if (progressHideTimerRef.current) {
                window.clearTimeout(progressHideTimerRef.current);
            }
        };
    }, []);

    const dimValidation = useMemo(() => validateSkillDimensions(form.dimensions), [form.dimensions]);
    const deferredDimValidation = useDeferredValue(dimValidation);

    const updateForm = useCallback(<K extends keyof ScreeningSkillFormData>(key: K, value: ScreeningSkillFormData[K]) => {
        setForm((prev) => ({...prev, [key]: value}));
    }, []);

    const addDimension = useCallback(() => {
        const dim = newDimension();
        setForm((prev) => ({...prev, dimensions: [...prev.dimensions, dim]}));
        setEditingDimId(dim.id);
    }, []);

    const updateDimension = useCallback((id: string, patch: Partial<ScreeningSkillDimension>) => {
        setForm((prev) => ({
            ...prev,
            dimensions: prev.dimensions.map((d) => d.id === id ? {...d, ...patch} : d),
        }));
    }, []);

    const removeDimension = useCallback((id: string) => {
        setForm((prev) => ({
            ...prev,
            dimensions: prev.dimensions.filter((d) => d.id !== id),
        }));
        setEditingDimId((prev) => prev === id ? null : prev);
    }, []);

    const moveDimension = useCallback((id: string, direction: -1 | 1) => {
        setForm((prev) => {
            const idx = prev.dimensions.findIndex((d) => d.id === id);
            if (idx < 0) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.dimensions.length) return prev;
            const next = [...prev.dimensions];
            [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
            return {...prev, dimensions: next};
        });
    }, []);

    const handleSwitchToStructured = useCallback(() => {
        if (advancedContent.trim()) {
            const parsed = parseSkillContent(advancedContent);
            if (parsed.dimensions) {
                parsed.dimensions = normalizeDimensionScores(parsed.dimensions);
            }
            setForm((prev) => ({
                ...prev,
                ...parsed,
                name: prev.name || parsed.name || "",
                description: prev.description || parsed.description || "",
                tagsText: prev.tagsText || parsed.tagsText || "",
                sortOrder: prev.sortOrder || parsed.sortOrder || "99",
                isEnabled: prev.isEnabled ?? parsed.isEnabled ?? true,
            }));
        }
    }, [advancedContent]);

    const handleSwitchToAdvanced = useCallback(() => {
        setAdvancedContent(generateSkillContent(form));
    }, [form]);

    const applyAIResult = useCallback((content: string, { announce }: { announce: boolean }) => {
        const normalizedContent = content.trim();
        if (!normalizedContent) return;
        const parsed = parseSkillContent(normalizedContent);
        if (parsed.dimensions) {
            parsed.dimensions = normalizeDimensionScores(parsed.dimensions);
        }
        setForm((prev) => ({
            ...prev,
            ...parsed,
            roleName: parsed.roleName || aiRoleName.trim() || prev.roleName,
            name: parsed.name || aiRoleName.trim() || prev.name,
            description: prev.description || parsed.description || "",
            tagsText: prev.tagsText || parsed.tagsText || "",
            taskTypes: ["screening"],
            sortOrder: prev.sortOrder || parsed.sortOrder || "99",
            isEnabled: prev.isEnabled ?? parsed.isEnabled ?? true,
        }));
        setAdvancedContent(normalizedContent);
        setAiAppliedNotice("已代入结构化编辑和高级模式，请检查后保存。");
        onGeneratedDirtyChange?.(true);
    }, [aiRoleName, onGeneratedDirtyChange]);

    const handleGenerate = useCallback(async () => {
        if (!onGenerateAI || !aiRoleName.trim()) return;
        if (progressHideTimerRef.current) {
            window.clearTimeout(progressHideTimerRef.current);
            progressHideTimerRef.current = null;
        }
        setAiGeneratedContent("");
        setAiAppliedNotice(null);
        onGeneratedDirtyChange?.(false);
        setAiLoadingIndex(0);
        setHasReceivedFirstAiToken(false);
        setStreamProgressVisible(false);
        setStreamProgressPercent(0);
        setStreamEstimatedTotalChars(0);
        setStreamCompleted(false);
        setAiSettingsExpanded(false);
        firstTokenReceivedRef.current = false;
        const result = await onGenerateAI(
            aiRoleName.trim(),
            aiExtraRequirements.trim(),
            positionJdContent || null,
            (delta) => {
                if (delta.length > 0 && !firstTokenReceivedRef.current) {
                    firstTokenReceivedRef.current = true;
                    setHasReceivedFirstAiToken(true);
                    onGeneratedDirtyChange?.(true);
                    setStreamProgressVisible(true);
                    setStreamProgressPercent(0);
                    setStreamEstimatedTotalChars(Math.max(220, delta.length + 140));
                }
                setAiGeneratedContent((prev) => prev + delta);
            },
        );
        setAiGeneratedContent(result.content);
        setStreamCompleted(result.completed);
        if (result.completed && result.content.trim()) {
            applyAIResult(result.content, { announce: true });
        }
    }, [onGenerateAI, aiRoleName, aiExtraRequirements, positionJdContent, applyAIResult, onGeneratedDirtyChange]);

    const handleSubmit = useCallback(async () => {
        if (tab === "advanced") {
            const parsed = parseSkillContent(advancedContent);
            await onSubmit({
                ...form,
                ...parsed,
                name: form.name,
                description: form.description,
                tagsText: form.tagsText,
                sortOrder: form.sortOrder,
                isEnabled: form.isEnabled,
            });
        } else {
            await onSubmit(form);
        }
        onGeneratedDirtyChange?.(false);
    }, [tab, form, advancedContent, onSubmit, onGeneratedDirtyChange]);

    const canSave = form.taskTypes.length > 0 && (tab === "advanced" || deferredDimValidation.valid);
    const showAiWaitingPhase = aiGenerating && !hasReceivedFirstAiToken;
    const showAiStreamingPhase = hasReceivedFirstAiToken || Boolean(aiGeneratedContent);

    useEffect(() => {
        if (!showAiStreamingPhase || !streamProgressVisible) {
            return;
        }
        if (progressHideTimerRef.current) {
            window.clearTimeout(progressHideTimerRef.current);
            progressHideTimerRef.current = null;
        }
        if (!aiGenerating) {
            if (streamCompleted) {
                setStreamProgressPercent(100);
                progressHideTimerRef.current = window.setTimeout(() => {
                    setStreamProgressVisible(false);
                    progressHideTimerRef.current = null;
                }, 1000);
            } else {
                setStreamProgressVisible(false);
            }
            return;
        }

        const currentChars = aiGeneratedContent.length;
        if (currentChars <= 0) {
            return;
        }
        const nextEstimate = Math.max(
            streamEstimatedTotalChars,
            220,
            currentChars + 120,
            Math.ceil(currentChars * 1.18),
        );
        if (nextEstimate !== streamEstimatedTotalChars) {
            setStreamEstimatedTotalChars(nextEstimate);
        }
        const nextPercent = Math.min(96, Math.floor((currentChars / nextEstimate) * 100));
        setStreamProgressPercent((previous) => Math.max(previous, nextPercent));
    }, [
        aiGeneratedContent.length,
        aiGenerating,
        showAiStreamingPhase,
        streamCompleted,
        streamEstimatedTotalChars,
        streamProgressVisible,
    ]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <Tabs value={tab} onValueChange={(v) => {
                if (v === "structured" && tab === "advanced") handleSwitchToStructured();
                if (v === "advanced" && tab === "structured") handleSwitchToAdvanced();
                setTab(v);
            }} className="flex flex-col flex-1 min-h-0">
                {aiAppliedNotice ? (
                    <div className="mb-2 flex items-center justify-between gap-3 rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                        <p className="truncate">{aiAppliedNotice}</p>
                        <button
                            type="button"
                            className="shrink-0 rounded-full p-0.5 text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                            onClick={() => setAiAppliedNotice(null)}
                            aria-label="Dismiss AI success notice"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : null}
                <TabsList className="w-full justify-start shrink-0">
                    <TabsTrigger value="structured">{t.recruitment.skillTabsStructured}</TabsTrigger>
                    <TabsTrigger value="advanced">{t.recruitment.skillTabsAdvanced}</TabsTrigger>
                    <TabsTrigger value="ai">{t.recruitment.skillTabsAi}</TabsTrigger>
                </TabsList>

                <TabsContent value="structured" className="flex-1 min-h-0 overflow-y-auto pr-1 mt-3 space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>{t.recruitment.skillRoleName} {t.recruitment.required}</Label>
                            <DebouncedInput value={form.roleName} onCommit={(v) => updateForm("roleName", v)} placeholder={t.recruitment.placeholderRoleName} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t.recruitment.skillName} {t.recruitment.required}</Label>
                            <DebouncedInput value={form.name} onCommit={(v) => updateForm("name", v)} placeholder={t.recruitment.placeholderSkillName} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t.recruitment.skillRoleBackground}</Label>
                        <DebouncedTextarea value={form.roleBackground} onCommit={(v) => updateForm("roleBackground", v)} placeholder={t.recruitment.placeholderRoleBackground} rows={2} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t.recruitment.skillDimensions}</Label>
                        <div className="flex flex-wrap gap-2">
                            {([["jd", t.recruitment.taskTypeJd], ["screening", t.recruitment.taskTypeScreening], ["interview", t.recruitment.taskTypeInterview]] as const).map(([kind, label]) => (
                                <button
                                    key={kind}
                                    type="button"
                                    className={cn(
                                        "rounded-full border px-3 py-1.5 text-xs transition",
                                        form.taskTypes.includes(kind)
                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                    )}
                                    onClick={() => updateForm("taskTypes", form.taskTypes.includes(kind) ? [] : [kind])}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-400">{t.recruitment.taskTypeHint}</p>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Label className="text-base font-semibold">{t.recruitment.skillDimensions}</Label>
                                <span className="text-sm text-slate-500">{t.recruitment.skillDimensionsCount.replace('{count}', String(form.dimensions.length))}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant={deferredDimValidation.valid ? "default" : "destructive"} className="rounded-full">
                                    {t.recruitment.totalScore} {deferredDimValidation.total.toFixed(1)} / 10.0
                                </Badge>
                                {!deferredDimValidation.valid && (
                                    <span className="text-xs text-red-500">{deferredDimValidation.message}</span>
                                )}
                            </div>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900">
                                    <tr>
                                        <th className="w-8 px-2 py-2 text-center">{t.recruitment.skillDimensionIndex}</th>
                                        <th className="px-3 py-2 text-left">{t.recruitment.skillDimensionName}</th>
                                        <th className="w-20 px-3 py-2 text-center">{t.recruitment.skillDimensionFullScore}</th>
                                        <th className="w-20 px-3 py-2 text-center">{t.recruitment.skillDimensionPriority}</th>
                                        <th className="w-14 px-3 py-2 text-center">{t.recruitment.skillDimensionHard}</th>
                                        <th className="w-24 px-3 py-2 text-center">{t.recruitment.skillDimensionActions}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.dimensions.map((dim, i) => (
                                        <DimensionRow
                                            key={dim.id}
                                            dim={dim}
                                            index={i}
                                            isEditing={editingDimId === dim.id}
                                            onStartEdit={() => setEditingDimId(dim.id)}
                                            onCancelEdit={() => setEditingDimId(null)}
                                            onUpdate={(patch) => updateDimension(dim.id, patch)}
                                            onRemove={() => removeDimension(dim.id)}
                                            onMove={(dir) => moveDimension(dim.id, dir)}
                                            isFirst={i === 0}
                                            priorityOptions={priorityOptions}
                                            skillUnnamed={t.recruitment.skillUnnamed}
                                            skillDimensionName={t.recruitment.skillDimensionName}
                                            skillDimensionPlaceholder={t.recruitment.skillDimensionPlaceholder}
                                            skillMaxScore={t.recruitment.skillMaxScore}
                                            skillPriority={t.recruitment.skillPriority}
                                            skillEvaluationFocus={t.recruitment.skillEvaluationFocus}
                                            skillEvaluationPlaceholder={t.recruitment.skillEvaluationPlaceholder}
                                            skillHardRequirement={t.recruitment.skillHardRequirement}
                                        />
                                    ))}
                                    {form.dimensions.length === 0 && (
                                        <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">{t.recruitment.skillDimensionsEmpty}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Button variant="outline" size="sm" onClick={addDimension}>
                            <Plus className="h-4 w-4 mr-1" /> {t.recruitment.skillDimensionsAdd}
                        </Button>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                        <Label>{t.recruitment.skillHardRules}</Label>
                        <DebouncedTextarea value={form.hardRules} onCommit={(v) => updateForm("hardRules", v)} placeholder={t.recruitment.skillHardRulesPlaceholder} rows={3} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t.recruitment.skillJudgmentRules}</Label>
                        <DebouncedTextarea value={form.judgmentRules} onCommit={(v) => updateForm("judgmentRules", v)} placeholder={t.recruitment.skillJudgmentRulesPlaceholder} rows={2} />
                    </div>

                    <Separator />

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>{t.recruitment.skillDescription}</Label>
                            <DebouncedInput value={form.description} onCommit={(v) => updateForm("description", v)} placeholder={t.recruitment.placeholderDescription} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t.recruitment.skillTags}</Label>
                            <DebouncedInput value={form.tagsText} onCommit={(v) => updateForm("tagsText", v)} placeholder={t.recruitment.placeholderTags} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t.common.sortOrder}</Label>
                            <DebouncedInput type="number" value={form.sortOrder} onCommit={(v) => updateForm("sortOrder", v)} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={form.isEnabled} onCheckedChange={(v) => updateForm("isEnabled", !!v)} />
                        <Label className="cursor-pointer">{t.recruitment.enabled}</Label>
                    </div>
                </TabsContent>

                <TabsContent value="advanced" className="flex-1 min-h-0 overflow-y-auto pr-1 mt-3 space-y-4">
                    <p className="text-sm text-slate-500">{t.recruitment.skillAdvancedHint}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>{t.recruitment.skillName} {t.recruitment.required}</Label>
                            <DebouncedInput value={form.name} onCommit={(v) => updateForm("name", v)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t.recruitment.skillDescription}</Label>
                            <DebouncedInput value={form.description} onCommit={(v) => updateForm("description", v)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t.recruitment.skillDimensions}</Label>
                        <div className="flex flex-wrap gap-2">
                            {([["jd", t.recruitment.taskTypeJd], ["screening", t.recruitment.taskTypeScreening], ["interview", t.recruitment.taskTypeInterview]] as const).map(([kind, label]) => (
                                <button
                                    key={kind}
                                    type="button"
                                    className={cn(
                                        "rounded-full border px-3 py-1.5 text-xs transition",
                                        form.taskTypes.includes(kind)
                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                    )}
                                    onClick={() => updateForm("taskTypes", form.taskTypes.includes(kind) ? [] : [kind])}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t.recruitment.skillContent} {t.recruitment.required}</Label>
                        <Textarea value={advancedContent} onChange={(e) => setAdvancedContent(e.target.value)} className="min-h-[400px] font-mono text-xs" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>{t.recruitment.skillTags}</Label>
                            <DebouncedInput value={form.tagsText} onCommit={(v) => updateForm("tagsText", v)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t.common.sortOrder}</Label>
                            <DebouncedInput type="number" value={form.sortOrder} onCommit={(v) => updateForm("sortOrder", v)} />
                        </div>
                        <div className="flex items-end gap-2 pb-1.5">
                            <Checkbox checked={form.isEnabled} onCheckedChange={(v) => updateForm("isEnabled", !!v)} />
                            <Label className="cursor-pointer">{t.recruitment.enabled}</Label>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="ai" className="flex-1 min-h-0 overflow-y-auto pr-1 mt-3 space-y-4">
                    {showAiStreamingPhase && (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        {isZh ? "AI 生成结果" : "AI generated result"}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {aiGenerating
                                            ? (isZh ? "内容正在实时输出，可随时停止生成。" : "Streaming content live. You can stop generation at any time.")
                                            : (isZh ? "内容已自动代入结构化编辑和高级模式，请检查后保存。" : "The content has been applied to structured and advanced modes. Review and save when ready.")}
                                    </p>
                                </div>
                                {streamProgressVisible ? (
                                    <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-300">
                                        {streamProgressPercent}%
                                    </div>
                                ) : null}
                            </div>
                            {streamProgressVisible ? (
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/80">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-emerald-400 transition-all duration-500"
                                        style={{ width: `${streamProgressPercent}%` }}
                                    />
                                </div>
                            ) : null}
                            <AiGeneratedContentPreview
                                content={aiGeneratedContent}
                                aiGenerating={aiGenerating}
                                isZh={isZh}
                            />
                        </div>
                    )}
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                        <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 text-left"
                            onClick={() => setAiSettingsExpanded((current) => !current)}
                        >
                            <span>
                                <span className="block text-base font-semibold text-slate-900 dark:text-slate-100">
                                    {showAiStreamingPhase ? (isZh ? "重新生成设置" : "Regeneration settings") : (isZh ? "AI 生成设置" : "AI generation settings")}
                                </span>
                                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                                    {aiSettingsExpanded
                                        ? (isZh ? "填写岗位名称和补充要求。" : "Edit role name and extra requirements.")
                                        : (isZh ? "已收起，展开后可修改要求或重新生成。" : "Collapsed. Expand to edit requirements or regenerate.")}
                                </span>
                            </span>
                            <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", aiSettingsExpanded && "rotate-180")} />
                        </button>
                        {aiSettingsExpanded ? (
                            <div className="mt-4 space-y-3">
                                <div className="space-y-1.5">
                                    <Label>{t.recruitment.skillRoleName} {t.recruitment.required}</Label>
                                    <Input value={aiRoleName} onChange={(e) => setAiRoleName(e.target.value)} placeholder={t.recruitment.placeholderRoleName} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>{t.recruitment.aiGenerationNotes}</Label>
                                    <Textarea
                                        rows={showAiStreamingPhase ? 2 : 4}
                                        value={aiExtraRequirements}
                                        onChange={(e) => setAiExtraRequirements(e.target.value)}
                                        placeholder={
                                            positionId && positionJdContent
                                                ? t.recruitment.aiGenerationNotesWithJD
                                                : positionId
                                                    ? t.recruitment.aiGenerationNotesNoJD
                                                    : t.recruitment.aiGenerationNotesNoPosition
                                        }
                                    />
                                </div>
                                <div className="flex gap-2">
                                    {aiGenerating ? (
                                        <Button
                                            variant="outline"
                                            className="border-rose-300 bg-rose-50 text-rose-700 shadow-sm hover:bg-rose-100 hover:text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/50"
                                            onClick={() => onStopGeneration?.()}
                                        >
                                            <Square className="h-4 w-4 mr-1" />
                                            {isZh ? "停止生成" : "Stop"}
                                        </Button>
                                    ) : (
                                        <Button onClick={() => void handleGenerate()} disabled={!aiRoleName.trim()}>
                                            <Sparkles className="h-4 w-4 ml-1" />
                                            {showAiStreamingPhase ? (isZh ? "重新生成" : "Regenerate") : t.recruitment.aiGenerate}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    {showAiWaitingPhase && (
                        <div className="overflow-hidden rounded-2xl border border-violet-200 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.18),_transparent_45%),linear-gradient(135deg,rgba(248,250,252,0.98),rgba(245,245,245,0.92))] p-4 dark:border-violet-900 dark:bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.18),_transparent_45%),linear-gradient(135deg,rgba(2,6,23,0.95),rgba(15,23,42,0.92))]">
                            <div className="flex items-start gap-4">
                                <div className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/85 shadow-sm dark:bg-slate-900/75">
                                    <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/25 dark:bg-violet-500/20" />
                                    <span className="absolute inset-1 animate-pulse rounded-full border border-violet-200/80 dark:border-violet-700/70" />
                                    <Sparkles className="relative h-5 w-5 text-violet-600 dark:text-violet-300" />
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.recruitment.aiGenerate}</p>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{aiLoadingMessages[aiLoadingIndex]}</p>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div className="h-2.5 rounded-full bg-violet-200/80 animate-pulse dark:bg-violet-800/70" />
                                        <div className="h-2.5 rounded-full bg-purple-100/90 animate-pulse dark:bg-slate-800/80" />
                                        <div className="h-2.5 rounded-full bg-emerald-100/80 animate-pulse dark:bg-slate-800/80" />
                                        <div className="h-2.5 rounded-full bg-slate-200/80 animate-pulse dark:bg-slate-800/80" />
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {isZh ? "正在等待模型开始输出内容，生成开始后会立即在下方实时展示。" : "Waiting for the model to begin streaming. Live content will appear below as soon as the first token arrives."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    {!aiGeneratedContent && !aiGenerating && (
                        <div className="rounded-lg border border-dashed p-8 text-center text-slate-400">
                            {t.recruitment.skillAiEmptyHint}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {submitError && (
                <div className="mt-2 rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">{submitError}</div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t mt-3 shrink-0">
                <Button variant="outline" onClick={onCancel} disabled={submitting}>{t.common.cancel}</Button>
                <Button onClick={() => void handleSubmit()} disabled={submitting || !canSave}>
                    {submitting ? t.common.saving : editingSkillId ? t.recruitment.skillUpdate : t.recruitment.skillCreate}
                </Button>
            </div>
        </div>
    );
}
