"use client";

import React, {useCallback, useEffect, useDeferredValue, useMemo, useRef, useState} from "react";
import {GripVertical, Pencil, Plus, Sparkles, Square, Trash2, X} from "lucide-react";

import type {ScreeningSkillDimension, ScreeningSkillFormData, SkillTaskKind} from "../types";
import {
    emptyScreeningSkillForm,
    generateSkillContent,
    newDimension,
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
    onGenerateAI?: (roleName: string, extraRequirements: string, positionJd: string | null, onDelta?: (delta: string) => void) => Promise<string>;
    onStopGeneration?: () => void;
    aiGenerating?: boolean;
    defaultTab?: "structured" | "advanced" | "ai";
    positionId?: number | null;
    positionJdContent?: string | null;
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
    skillRubricTitle,
    skillRubricScoreRange,
    skillRubricScoreRangePlaceholder,
    skillRubricCriteria,
    skillRubricCriteriaPlaceholder,
    skillRubricAdd,
    skillRubricRemove,
    skillRubricEmpty,
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
    skillRubricTitle: string;
    skillRubricScoreRange: string;
    skillRubricScoreRangePlaceholder: string;
    skillRubricCriteria: string;
    skillRubricCriteriaPlaceholder: string;
    skillRubricAdd: string;
    skillRubricRemove: string;
    skillRubricEmpty: string;
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
                        <div className="mt-4 space-y-2">
                            <Label className="text-xs font-semibold">{skillRubricTitle}</Label>
                            {dim.scoringRubric.length > 0 ? (
                                <div className="space-y-2">
                                    {dim.scoringRubric.map((level, levelIdx) => (
                                        <div key={levelIdx} className="flex items-start gap-2">
                                            <Input
                                                className="w-28 shrink-0 text-xs"
                                                value={level.scoreRange}
                                                onChange={(e) => {
                                                    const next = [...dim.scoringRubric];
                                                    next[levelIdx] = {...next[levelIdx], scoreRange: e.target.value};
                                                    onUpdate({scoringRubric: next});
                                                }}
                                                placeholder={skillRubricScoreRangePlaceholder}
                                            />
                                            <Input
                                                className="flex-1 text-xs"
                                                value={level.criteria}
                                                onChange={(e) => {
                                                    const next = [...dim.scoringRubric];
                                                    next[levelIdx] = {...next[levelIdx], criteria: e.target.value};
                                                    onUpdate({scoringRubric: next});
                                                }}
                                                placeholder={skillRubricCriteriaPlaceholder}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                                                onClick={() => {
                                                    const next = dim.scoringRubric.filter((_, j) => j !== levelIdx);
                                                    onUpdate({scoringRubric: next});
                                                }}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400">{skillRubricEmpty}</p>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-1"
                                onClick={() => {
                                    onUpdate({scoringRubric: [...dim.scoringRubric, {scoreRange: "", criteria: ""}]});
                                }}
                            >
                                <Plus className="h-3.5 w-3.5 mr-1" /> {skillRubricAdd}
                            </Button>
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
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
}: StructuredSkillEditorProps) {
    const { t } = useI18n();

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

    useEffect(() => {
        if (initialData) {
            setForm(initialData);
            setAdvancedContent(generateSkillContent(initialData));
            if (initialData.roleName) {
                setAiRoleName(initialData.roleName);
            }
        }
    }, [initialData]);

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

    const handleUseAIResult = useCallback(() => {
        if (!aiGeneratedContent.trim()) return;
        const parsed = parseSkillContent(aiGeneratedContent);
        setForm((prev) => ({
            ...prev,
            ...parsed,
            name: prev.name || parsed.name || "",
            description: prev.description || parsed.description || "",
            tagsText: prev.tagsText || parsed.tagsText || "",
            sortOrder: prev.sortOrder || parsed.sortOrder || "99",
            isEnabled: prev.isEnabled ?? parsed.isEnabled ?? true,
        }));
        setTab("structured");
    }, [aiGeneratedContent]);

    const handleGenerate = useCallback(async () => {
        if (!onGenerateAI || !aiRoleName.trim()) return;
        setAiGeneratedContent("");
        const content = await onGenerateAI(
            aiRoleName.trim(),
            aiExtraRequirements.trim(),
            positionJdContent || null,
            (delta) => setAiGeneratedContent((prev) => prev + delta),
        );
        setAiGeneratedContent(content);
    }, [onGenerateAI, aiRoleName, aiExtraRequirements, positionJdContent]);

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
    }, [tab, form, advancedContent, onSubmit]);

    const canSave = form.taskTypes.length > 0 && (tab === "advanced" || deferredDimValidation.valid);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <Tabs value={tab} onValueChange={(v) => {
                if (v === "structured" && tab === "advanced") handleSwitchToStructured();
                if (v === "advanced" && tab === "structured") handleSwitchToAdvanced();
                setTab(v);
            }} className="flex flex-col flex-1 min-h-0">
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
                                            skillRubricTitle={t.recruitment.skillRubricTitle}
                                            skillRubricScoreRange={t.recruitment.skillRubricScoreRange}
                                            skillRubricScoreRangePlaceholder={t.recruitment.skillRubricScoreRangePlaceholder}
                                            skillRubricCriteria={t.recruitment.skillRubricCriteria}
                                            skillRubricCriteriaPlaceholder={t.recruitment.skillRubricCriteriaPlaceholder}
                                            skillRubricAdd={t.recruitment.skillRubricAdd}
                                            skillRubricRemove={t.recruitment.skillRubricRemove}
                                            skillRubricEmpty={t.recruitment.skillRubricEmpty}
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
                    <div className="space-y-1.5">
                        <Label>{t.recruitment.skillRoleName} {t.recruitment.required}</Label>
                        <Input value={aiRoleName} onChange={(e) => setAiRoleName(e.target.value)} placeholder={t.recruitment.placeholderRoleName} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t.recruitment.aiGenerationNotes}</Label>
                        <Textarea
                            rows={4}
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
                            <Button variant="outline" onClick={() => onStopGeneration?.()}>
                                <Square className="h-4 w-4 mr-1" />
                                {t.common.cancel}
                            </Button>
                        ) : (
                            <Button onClick={() => void handleGenerate()} disabled={!aiRoleName.trim()}>
                                <Sparkles className="h-4 w-4 ml-1" />
                                {t.recruitment.aiGenerate}
                            </Button>
                        )}
                        {aiGeneratedContent && (
                            <Button variant="outline" onClick={handleUseAIResult}>
                                {t.common.edit}
                            </Button>
                        )}
                    </div>
                    {aiGeneratedContent && (
                        <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-4">
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{aiGeneratedContent}</pre>
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
