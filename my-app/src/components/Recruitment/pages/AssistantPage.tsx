"use client";

import React from "react";

import {
    Bot,
    Paperclip,
    Send,
    Square,
    X,
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
    ChatContext,
    PositionSummary,
    RecruitmentLLMConfig,
    RecruitmentSkill,
} from "@/lib/recruitment-api";
import { cn } from "@/lib/utils";

import type { AssistantDisplayMode, ChatMessage, RecruitmentPage } from "../types";
import {
    formatDateTime,
    labelForMemorySource,
    labelForProvider,
} from "../utils";
import { Field, NativeSelect } from "../components/SharedComponents";

/* ─── Props ─── */

export interface AssistantPageProps {
    /* 核心数据 */
    chatMessages: ChatMessage[];
    chatInput: string;
    setChatInput: (value: string) => void;
    chatSending: boolean;
    chatContext: ChatContext;
    positions: PositionSummary[];
    skills: RecruitmentSkill[];
    llmConfigs: RecruitmentLLMConfig[];

    /* 附件 */
    attachedFiles: File[];
    addAttachedFiles: (files: FileList | File[]) => void;
    removeAttachedFile: (index: number) => void;

    /* 任务状态 */
    activeChatTaskId: number | null;
    isCurrentChatTaskCancelling: boolean;

    /* 模式 */
    assistantDisplayMode: AssistantDisplayMode;
    assistantOpen: boolean;
    activePage: RecruitmentPage;

    /* Refs */
    assistantScrollAreaRef: React.RefObject<HTMLDivElement | null>;
    assistantScrollAnchorRef: React.RefObject<HTMLDivElement | null>;
    assistantInputRef: React.RefObject<HTMLTextAreaElement | null>;

    /* 派生值 */
    assistantModelLabel: string;
    chatContextCandidateLabel: string;
    effectiveLLMConfigs: Map<string, RecruitmentLLMConfig>;

    /* 动作 */
    sendChatMessage: () => void;
    saveChatContext: (positionId: number | null, skillIds: number[], candidateId?: number | null, options?: { quiet?: boolean }) => void;
    toggleSkillInAssistant: (skillId: number) => void;
    openAssistantMode: (mode: AssistantDisplayMode) => void;
    applyAssistantPrompt: (prompt: string) => void;
    queueAssistantInputFocus: (moveCursorToEnd?: boolean) => void;
    openTaskLogDetail: (logId?: number | null) => void;
    setActivePage: (page: RecruitmentPage) => void;
}

function preventAssistantActionFocusLoss(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PseudoStreamingMarkdown({ content, isLatest }: { content: string, isLatest: boolean }) {
    const [displayedCount, setDisplayedCount] = React.useState(isLatest ? 0 : content.length);

    React.useEffect(() => {
        if (!isLatest) {
            setDisplayedCount(content.length);
            return;
        }
        
        // If content changes, reset
        setDisplayedCount(0);

        let animationFrameId: number;
        let currentCount = 0;
        const charsPerFrame = Math.max(1, Math.floor(content.length / 60)); // Animate over ~60 frames (1s)

        const animate = () => {
            currentCount += charsPerFrame;
            if (currentCount >= content.length) {
                setDisplayedCount(content.length);
            } else {
                setDisplayedCount(currentCount);
                animationFrameId = requestAnimationFrame(animate);
            }
        };
        animationFrameId = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationFrameId);
    }, [content, isLatest]);

    const displayedContent = content.slice(0, displayedCount);
    // 增加闪烁的光标效果补充 UI 体验
    const isTyping = displayedCount < content.length;

    return (
        <div className="prose prose-slate dark:prose-invert prose-sm max-w-none break-words">
            <ReactMarkdown>{displayedContent + (isTyping ? " ▍" : "")}</ReactMarkdown>
        </div>
    );
}

export function AssistantPage({
    chatMessages,
    chatInput,
    setChatInput,
    chatSending,
    chatContext,
    positions,
    skills,
    activeChatTaskId,
    isCurrentChatTaskCancelling,
    assistantDisplayMode,
    assistantOpen,
    activePage,
    assistantScrollAreaRef,
    assistantScrollAnchorRef,
    assistantInputRef,
    assistantModelLabel,
    chatContextCandidateLabel,
    sendChatMessage,
    saveChatContext,
    toggleSkillInAssistant,
    openAssistantMode,
    applyAssistantPrompt,
    queueAssistantInputFocus,
    openTaskLogDetail,
    attachedFiles,
    addAttachedFiles,
    removeAttachedFile,
}: AssistantPageProps) {
    const isPage = assistantDisplayMode === "page";
    const isFullscreen = assistantDisplayMode === "fullscreen";

    const suggestionPrompts = [
        "生成当前岗位 JD",
        "查看当前岗位候选人",
        "重新对当前候选人初筛，硬性要求加强硬件测试",
        "给当前候选人生成面试题",
        "说明这次对话用了哪些 Skills",
        "当前使用什么模型",
    ];

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelect = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            addAttachedFiles(event.target.files);
            event.target.value = "";
        }
    };

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        if (event.dataTransfer.files.length > 0) {
            addAttachedFiles(event.dataTransfer.files);
        }
    };

    const handleDragOver = (event: React.DragEvent) => {
        event.preventDefault();
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* ─── 头部 ─── */}
            <div
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
                <div>
                    <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-sky-600"/>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI 招聘助手</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        当前岗位：{chatContext.position_title || "未指定"} · 当前候选人：{chatContextCandidateLabel} ·
                        激活 Skills：{chatContext.skills?.length || 0} · 当前模型：{assistantModelLabel}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant={isPage ? "default" : "outline"} size="sm"
                            onClick={() => openAssistantMode("page")}>
                        侧栏模式
                    </Button>
                    <Button variant={isFullscreen ? "default" : "outline"} size="sm"
                            onClick={() => openAssistantMode("fullscreen")}>
                        全屏模式
                    </Button>
                </div>
            </div>

            {/* ─── 主体 ─── */}
            <div
                className={cn(
                    "grid min-h-0 flex-1",
                    isFullscreen
                        ? "grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px]"
                        : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]",
                )}
            >
                <div className="flex min-h-0 flex-col">
                    {/* 快捷提示 */}
                    <div
                        className="shrink-0 overflow-x-auto border-b border-slate-200/80 px-5 py-3 dark:border-slate-800">
                        <div className="flex min-w-max gap-2">
                            {suggestionPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onMouseDown={preventAssistantActionFocusLoss}
                                    onClick={() => applyAssistantPrompt(prompt)}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 聊天消息区域 */}
                    <div
                        ref={assistantScrollAreaRef}
                        className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
                    >
                        <div className="space-y-4 px-5 py-5">
                            {chatMessages.map((message) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm",
                                        message.role === "assistant"
                                            ? "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                            : "ml-auto bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
                                    )}
                                >
                                    {message.role === "assistant" ? (
                                        <PseudoStreamingMarkdown 
                                            content={message.content} 
                                            isLatest={message.id === chatMessages[chatMessages.length - 1]?.id} 
                                        />
                                    ) : (
                                        <p className="whitespace-pre-wrap leading-7">{message.content}</p>
                                    )}
                                    {message.actions?.length ? (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {message.actions.map((action) => (
                                                <Badge key={action} variant="outline" className="rounded-full">
                                                    {action}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : null}
                                    {message.role === "assistant" && (message.usedSkills?.length || message.logId || message.usedFallback) ? (
                                        <details
                                            className="mt-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                                            <summary
                                                className="cursor-pointer select-none font-medium text-slate-700 dark:text-slate-200">查看本次上下文
                                            </summary>
                                            <div className="mt-3 space-y-3">
                                                <p className="leading-6">
                                                    模型：{labelForProvider(message.modelProvider)} / {message.modelName || "-"}
                                                    <br/>
                                                    规则来源：{labelForMemorySource(message.memorySource)}
                                                </p>
                                                {message.usedFallback ? (
                                                    <div
                                                        className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                                                        <p className="font-medium">本次结果来自 fallback 兜底</p>
                                                        {message.fallbackError ?
                                                            <p className="mt-1 whitespace-pre-wrap break-words leading-6">{message.fallbackError}</p> : null}
                                                    </div>
                                                ) : null}
                                                {message.usedSkills?.length ? (
                                                    <div className="space-y-2">
                                                        {message.usedSkills.map((skill) => (
                                                            <div key={skill.id}
                                                                 className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{skill.name}</p>
                                                                {skill.description ?
                                                                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{skill.description}</p> : null}
                                                                <pre
                                                                    className="mt-2 whitespace-pre-wrap break-words leading-6 text-slate-600 dark:text-slate-300">{skill.content || "暂无内容"}</pre>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {message.logId ? (
                                                    <div className="flex justify-end">
                                                        <Button size="sm" variant="outline"
                                                                onClick={() => openTaskLogDetail(message.logId)}>查看完整日志</Button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </details>
                                    ) : null}
                                    <p className="mt-2 text-[11px] opacity-70">{formatDateTime(message.createdAt)}</p>
                                </div>
                            ))}
                            {chatSending ? (
                                <div className="flex items-center gap-2 px-4 py-3 max-w-[92%] rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex space-x-1">
                                        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.3s]"></div>
                                        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.15s]"></div>
                                        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"></div>
                                    </div>
                                    <span className="text-xs font-medium text-slate-500">助手正在思考...</span>
                                </div>
                            ) : null}
                            <div ref={assistantScrollAnchorRef}/>
                        </div>
                    </div>

                    {/* ─── 输入区 + 附件上传 ─── */}
                    <div
                        className="shrink-0 border-t border-slate-200/80 px-5 py-5 dark:border-slate-800"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                    >
                        {/* 附件预览 */}
                        {attachedFiles.length > 0 ? (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {attachedFiles.map((file, index) => (
                                    <div
                                        key={`${file.name}-${index}`}
                                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                                    >
                                        <Paperclip className="h-3 w-3 text-slate-400"/>
                                        <span className="max-w-[120px] truncate text-slate-700 dark:text-slate-300">{file.name}</span>
                                        <span className="text-slate-400">{formatFileSize(file.size)}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeAttachedFile(index)}
                                            className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                                        >
                                            <X className="h-3 w-3 text-slate-500"/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <Textarea
                            ref={assistantInputRef}
                            autoFocus={assistantOpen || activePage === "assistant"}
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            onKeyDown={(event) => {
                                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                    event.preventDefault();
                                    void sendChatMessage();
                                }
                            }}
                            rows={isFullscreen ? 7 : 4}
                            placeholder="例如：重新对当前候选人初筛，硬性要求加强硬件测试经验；或说明这次用了哪些 Skills"
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    助手会自动携带当前岗位与启用 Skill 上下文。按 Ctrl/Cmd + Enter 可直接发送。
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* 附件上传按钮 */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.png,.jpg,.jpeg"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleFileSelect}
                                    disabled={chatSending}
                                    title="上传附件（支持 PDF、Word、Excel、图片等）"
                                >
                                    <Paperclip className="h-4 w-4"/>
                                    附件
                                    {attachedFiles.length > 0 ? (
                                        <Badge className="ml-1 rounded-full px-1.5 py-0 text-[10px]">
                                            {attachedFiles.length}
                                        </Badge>
                                    ) : null}
                                </Button>
                                <Button
                                    onClick={() => void sendChatMessage()}
                                    disabled={isCurrentChatTaskCancelling || (!activeChatTaskId && !chatInput.trim() && attachedFiles.length === 0)}
                                >
                                    {activeChatTaskId ? <Square className="h-4 w-4"/> : <Send className="h-4 w-4"/>}
                                    {isCurrentChatTaskCancelling ? "停止中..." : activeChatTaskId ? "停止生成" : "发送"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── 侧栏：上下文与 Skills ─── */}
                <div
                    className={cn("min-h-0 overflow-y-auto border-slate-200/80 px-5 py-5 dark:border-slate-800", "border-t 2xl:border-t-0 2xl:border-l")}>
                    <div className="space-y-5">
                        <Field label="岗位上下文">
                            <NativeSelect
                                value={chatContext.position_id ? String(chatContext.position_id) : "none"}
                                onChange={(event) => {
                                    const nextPositionId = event.target.value === "none" ? null : Number(event.target.value);
                                    void saveChatContext(nextPositionId, chatContext.skill_ids);
                                    queueAssistantInputFocus();
                                }}
                            >
                                <option value="none">未指定岗位</option>
                                {positions.map((position) => (
                                    <option key={position.id} value={position.id}>
                                        {position.title}
                                    </option>
                                ))}
                            </NativeSelect>
                        </Field>

                        <Field label="激活 Skills">
                            <div className="flex flex-wrap gap-2">
                                {skills.map((skill) => (
                                    <button
                                        key={skill.id}
                                        type="button"
                                        onMouseDown={preventAssistantActionFocusLoss}
                                        onClick={() => toggleSkillInAssistant(skill.id)}
                                        className={cn(
                                            "rounded-full border px-3 py-2 text-xs font-medium transition",
                                            chatContext.skill_ids.includes(skill.id)
                                                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                        )}
                                    >
                                        {skill.name}
                                    </button>
                                ))}
                            </div>
                        </Field>

                        <Field label="拖拽上传附件">
                            <div
                                className="flex items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center transition hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500"
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                            >
                                <div className="space-y-2">
                                    <Paperclip className="mx-auto h-6 w-6 text-slate-400"/>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        拖拽文件到这里，或
                                        <button
                                            type="button"
                                            className="ml-1 text-sky-600 hover:text-sky-700 dark:text-sky-400"
                                            onClick={handleFileSelect}
                                        >
                                            点击选择
                                        </button>
                                    </p>
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                        支持 PDF、Word、Excel、图片等
                                    </p>
                                </div>
                            </div>
                        </Field>

                        <Field label="推荐问题">
                            <div className="space-y-2">
                                {[
                                    "帮我生成 IoT 测试工程师 JD",
                                    "查看当前岗位候选人列表",
                                    "重新对当前候选人初筛，硬性要求加强硬件测试经验",
                                    "给当前候选人生成初试题，重点考察硬件联调",
                                    "说明这次对话用了哪些 Skills 和模型",
                                ].map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onMouseDown={preventAssistantActionFocusLoss}
                                        onClick={() => applyAssistantPrompt(prompt)}
                                        className="w-full rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-left text-xs text-slate-600 transition hover:border-slate-400 dark:border-slate-800 dark:text-slate-300"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </div>
                </div>
            </div>
        </div>
    );
}
