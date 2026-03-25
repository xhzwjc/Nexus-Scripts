/**
 * Recruitment module barrel file
 *
 * 统一导出所有模块，方便上层引用。
 */

/* ─── 类型 ─── */
export * from "./types";

/* ─── 工具函数 ─── */
export * from "./utils";

/* ─── 共享 UI 组件 ─── */
export {
    MetricCard,
    LoadingCard,
    LoadingPanel,
    EmptyState,
    SearchField,
    Field,
    NativeSelect,
    SectionNavButton,
    SettingsEntry,
    InfoTile,
    MiniStat,
    TodoCard,
    QuickActionCard,
    buildLogObjectLabel,
} from "./components/SharedComponents";

/* ─── Custom Hooks ─── */
export { useRecruitmentData } from "./hooks/useRecruitmentData";
export type { RecruitmentDataState, RecruitmentDataActions } from "./hooks/useRecruitmentData";
export { useTaskMonitor } from "./hooks/useTaskMonitor";
export type { TaskMonitorCallbacks } from "./hooks/useTaskMonitor";
export { useChatAssistant } from "./hooks/useChatAssistant";

/* ─── 页面组件 ─── */
export { AssistantPage } from "./pages/AssistantPage";
export { WorkspacePage } from "./pages/WorkspacePage";
export { SkillSettingsPage } from "./pages/SkillSettingsPage";
export { ModelSettingsPage } from "./pages/ModelSettingsPage";
export { MailSettingsPage } from "./pages/MailSettingsPage";
export { PositionsPage } from "./pages/PositionsPage";
export { CandidatesPage } from "./pages/CandidatesPage";
export { AuditPage } from "./pages/AuditPage";
