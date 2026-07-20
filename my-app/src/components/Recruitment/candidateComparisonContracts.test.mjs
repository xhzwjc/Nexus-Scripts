import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const containerSource = await readFile(
    new URL("./RecruitmentAutomationContainer.tsx", import.meta.url),
    "utf8",
);
const candidatesPageSource = await readFile(
    new URL("./pages/CandidatesPage.tsx", import.meta.url),
    "utf8",
);
const comparisonWorkspaceSource = await readFile(
    new URL("./pages/CandidateComparisonWorkspace.tsx", import.meta.url),
    "utf8",
);
const apiTypesSource = await readFile(
    new URL("../../lib/recruitment-api.ts", import.meta.url),
    "utf8",
);
const i18nTypesSource = await readFile(
    new URL("../../lib/i18n/types.ts", import.meta.url),
    "utf8",
);
const zhSource = await readFile(
    new URL("../../lib/i18n/translations/zh-CN.ts", import.meta.url),
    "utf8",
);
const enSource = await readFile(
    new URL("../../lib/i18n/translations/en-US.ts", import.meta.url),
    "utf8",
);
const proxySource = await readFile(
    new URL("../../app/api/recruitment/[...path]/route.ts", import.meta.url),
    "utf8",
);

test("候选人对比使用独立选择并保持候选人页内部全屏模式", () => {
    assert.match(containerSource, /\[comparisonCandidateIds, setComparisonCandidateIds\] = useState<number\[]>\(\[\]\)/);
    assert.match(containerSource, /\[comparisonSelectionItems, setComparisonSelectionItems\] = useState<CandidateSummary\[]>\(\[\]\)/);
    assert.match(containerSource, /\[candidateWorkspaceMode, setCandidateWorkspaceMode\] = useState<"list" \| "comparison">\("list"\)/);
    assert.match(candidatesPageSource, /candidateWorkspaceMode === "comparison"/);
    assert.match(candidatesPageSource, /<CandidateComparisonWorkspace/);
    assert.doesNotMatch(containerSource, /RecruitmentPage[^\n]+candidate-comparison/);
});

test("对比页查看详情不退出工作区并让抽屉覆盖在对比层上", () => {
    assert.match(candidatesPageSource, /onOpenCandidate=\{setSelectedCandidateId\}/);
    assert.match(candidatesPageSource, /detailOpen=\{selectedCandidateId !== null\}/);
    assert.doesNotMatch(candidatesPageSource, /onOpenCandidate=\{\(candidateId\) => \{[\s\S]{0,180}exitCandidateComparison/);
    assert.match(comparisonWorkspaceSource, /detailOpen \? "z-40" : "z-\[10000\]"/);
    assert.match(candidatesPageSource, /candidateWorkspaceMode === "list" \? \([\s\S]*<CandidateComparisonTray/);
});

test("批量选择可逐页导入且不会给原有批处理选择施加四人上限", () => {
    const importStart = containerSource.indexOf("const importCandidatesToComparison");
    const importEnd = containerSource.indexOf("const removeCandidateFromComparison", importStart);
    const importSource = containerSource.slice(importStart, importEnd);
    assert.match(importSource, /const existingIds = new Set\(comparisonCandidateIdsRef\.current\)/);
    assert.match(importSource, /const availableSlots = Math\.max\(0, 4 - comparisonSelectionItems\.length\)/);
    assert.match(importSource, /newItems\.slice\(0, availableSlots\)/);
    assert.match(importSource, /setSelectedCandidateIds\(\[\]\)/);
    assert.match(importSource, /candidateComparisonText\.overflowSkipped/);
    assert.match(containerSource, /candidateSelectionItemCacheRef/);
    assert.match(containerSource, /candidateSelectionItemCacheRef\.current\.set\(candidate\.id, candidate\)/);
    const batchToggleStart = containerSource.indexOf("function toggleCandidateSelection");
    const batchToggleSource = containerSource.slice(batchToggleStart, batchToggleStart + 260);
    assert.doesNotMatch(batchToggleSource, /4|maximum/);
});

test("比较选择在客户端执行唯一、上限、岗位关联和同岗位约束", () => {
    assert.match(containerSource, /Array\.from\(new Set\(candidateIds\.filter/);
    assert.match(containerSource, /candidateComparisonText\.maximumReached/);
    assert.match(containerSource, /candidateComparisonText\.assignedPositionRequired/);
    assert.match(containerSource, /candidateComparisonText\.samePositionRequired/);
    assert.match(containerSource, /comparisonCandidateIdsRef\.current\.length >= 4/);
    assert.match(containerSource, /items\.some\(\(candidate\) => candidate\.position_id !== expectedPositionId\)/);
});

test("预览请求走显式 candidate-manage 权限并遵守 latest-wins", () => {
    assert.match(proxySource, /path === "candidate-comparisons\/preview" && normalizedMethod === "POST"/);
    assert.match(proxySource, /return "recruitment-candidate-manage"/);
    assert.match(containerSource, /recruitmentApi<CandidateComparisonPreview>\("\/candidate-comparisons\/preview"/);
    assert.match(containerSource, /expected_position_id: expectedPositionId/);
    assert.match(containerSource, /comparisonAbortControllerRef\.current\?\.abort\(\)/);
    assert.match(containerSource, /comparisonRequestIdRef\.current !== requestId/);
    assert.match(containerSource, /signal: controller\.signal/);
});

test("SSE 失效与旧响应竞态由 invalidation revision 隔离", () => {
    assert.match(containerSource, /comparisonInvalidationRevisionRef\.current \+= 1/);
    assert.match(containerSource, /comparisonReconcileAttemptsRef\.current = 0/);
    assert.match(containerSource, /setComparisonStale\(true\)/);
    assert.match(containerSource, /const invalidationRevision = comparisonInvalidationRevisionRef\.current/);
    assert.match(containerSource, /setComparisonStale\(comparisonInvalidationRevisionRef\.current !== invalidationRevision\)/);
});

test("对比页聚焦始终对账，processing 或 stale 快速对账后降为低频", () => {
    assert.match(containerSource, /window\.addEventListener\("focus", handleComparisonFocus\)/);
    assert.match(containerSource, /shouldUseFastReconcile \? 5000 : 60000/);
    assert.match(containerSource, /comparisonReconcileAttemptsRef\.current < 6/);
    assert.match(containerSource, /!comparisonProcessing && !comparisonStale/);
    assert.match(containerSource, /loadCandidateComparison\(\{background: true\}\)/);
    const focusStart = containerSource.indexOf("const handleComparisonFocus");
    const focusEnd = containerSource.indexOf("window.addEventListener", focusStart);
    const focusSource = containerSource.slice(focusStart, focusEnd);
    assert.doesNotMatch(focusSource, /comparisonStale|comparisonProcessing/);
});

test("组织或数据权限范围变化清空比较，筛选分页不进入比较范围键", () => {
    const scopeStart = containerSource.indexOf("const comparisonDataScopeKey = useMemo");
    const scopeEnd = containerSource.indexOf("const comparisonDataScopeKeyRef", scopeStart);
    const scopeSource = containerSource.slice(scopeStart, scopeEnd);
    assert.match(scopeSource, /dataScope: recruitmentDataCacheKey/);
    assert.match(scopeSource, /departmentScope: selectedDepartmentScope/);
    assert.match(scopeSource, /orgScope: selectedOrgScope/);
    assert.match(scopeSource, /canManageCandidate/);
    assert.doesNotMatch(scopeSource, /candidateQuery|candidatePageIndex|candidateStatusFilter/);
    assert.match(containerSource, /comparisonDataScopeKeyRef\.current = comparisonDataScopeKey;\s+candidateSelectionItemCacheRef\.current\.clear\(\);\s+clearCandidateComparison\(\)/);
});

test("降级口径不展示评分差异，最佳标记遵守人工分语义", () => {
    assert.match(comparisonWorkspaceSource, /if \(!preview\?\.comparability\.score_deltas_allowed\) return \[\]/);
    assert.match(comparisonWorkspaceSource, /if \(!preview\?\.comparability\.ranking_allowed \|\| preview\.manual_override_mode !== "none"\) return null/);
    assert.match(comparisonWorkspaceSource, /rankingAllowed=\{preview\.comparability\.ranking_allowed && preview\.manual_override_mode === "none"\}/);
    assert.match(comparisonWorkspaceSource, /preview\.comparability\.facts_allowed \? \(row\.value\(member\)/);
    assert.doesNotMatch(comparisonWorkspaceSource, /CandidateRadarChart|<Radar/);
});

test("不可排名时仍展示可核对分数与维度，并复用候选人业务状态", () => {
    assert.match(apiTypesSource, /"score_total_mismatch"/);
    assert.match(apiTypesSource, /display_status: string/);
    assert.match(comparisonWorkspaceSource, /member\.screening\?\.ai\.match_percent/);
    assert.match(comparisonWorkspaceSource, /member\.candidate\.display_status \|\| member\.candidate\.status/);
    assert.match(comparisonWorkspaceSource, /coreDimensions\.map/);
    assert.match(comparisonWorkspaceSource, /otherDimensions\.map/);
    // B1：就绪成员的优势/风险随其自有评分展示（按 hasAnyScreening 而非 level==="strict" 门控），
    // 有限可比下不得因他人 legacy 而被一并隐藏。
    assert.match(comparisonWorkspaceSource, /const hasAnyScreening = React\.useMemo\(\(\) => members\.some\(\(member\) => member\.screening != null\)/);
    assert.match(comparisonWorkspaceSource, /hasAnyScreening \? <ComparisonGridRow label=\{text\.strengthsTitle\}/);
    assert.match(zhSource, /部分候选人的 AI 总分与维度合计不一致/);
    assert.match(enSource, /Some AI totals do not match their dimension sums/);
});

test("比较结果只映射稳定 reason code 且关键差异不回退一致维度", () => {
    assert.match(apiTypesSource, /export type CandidateComparisonReasonCode/);
    assert.match(apiTypesSource, /"audit_request_hash_mismatch"/);
    assert.match(apiTypesSource, /"artifact_processing"/);
    assert.match(apiTypesSource, /"artifact_failed"/);
    assert.match(comparisonWorkspaceSource, /case "possible_duplicate_contact": return text\.reasonPossibleDuplicateContact/);
    assert.match(comparisonWorkspaceSource, /case "audit_request_hash_mismatch": return text\.reasonAuditRequestHashMismatch/);
    assert.match(comparisonWorkspaceSource, /return preview\.key_differences/);
    assert.match(comparisonWorkspaceSource, /\.slice\(0, 4\)/);
    assert.doesNotMatch(comparisonWorkspaceSource, /key_differences\.summary/);
});

test("关键差异同时标明原始分量纲和归一化百分点差值", () => {
    assert.match(comparisonWorkspaceSource, /text\.scoreValue\([\s\S]*formatComparisonNumber\(value\.score\)[\s\S]*formatComparisonNumber\(dimension\.max_score\)/);
    assert.match(zhSource, /differenceSpread: \(value\) => `归一化差值 \$\{value\} 个百分点`/);
    assert.match(enSource, /differenceSpread: \(value\) => `Normalized gap \$\{value\} pp`/);
});

test("比较文案由强类型中英文 i18n 提供且键保持一致", () => {
    for (const source of [i18nTypesSource, zhSource, enSource]) {
        assert.match(source, /candidateComparison:/);
        assert.match(source, /strictNoRankingDescription:/);
        assert.match(source, /reasonArtifactProcessing:/);
        assert.match(source, /reasonArtifactFailed:/);
        assert.match(source, /reasonAuditRequestHashMismatch:/);
        assert.match(source, /noKeyDifferences:/);
        assert.match(source, /duplicateGroup:/);
    }
    assert.doesNotMatch(comparisonWorkspaceSource, /isZh\s*\?/);
});

test("对比矩阵具备固定表头语义且托盘为列表留出底部空间", () => {
    assert.match(comparisonWorkspaceSource, /createPortal\(children, portalTarget\)/);
    assert.match(comparisonWorkspaceSource, /"fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-\[#F7F8FA\]"/);
    assert.match(comparisonWorkspaceSource, /detailOpen \? "z-40" : "z-\[10000\]"/);
    assert.match(comparisonWorkspaceSource, /className="fixed bottom-6 left-1\/2 z-\[70\]/);
    assert.match(comparisonWorkspaceSource, /const COMPARISON_DIMENSION_COLUMN_WIDTH = 200/);
    assert.match(comparisonWorkspaceSource, /const COMPARISON_MEMBER_MIN_WIDTH = 240/);
    assert.match(comparisonWorkspaceSource, /minWidth: `\$\{COMPARISON_DIMENSION_COLUMN_WIDTH \+ Math\.max\(memberCount, 1\) \* COMPARISON_MEMBER_MIN_WIDTH\}px`/);
    assert.match(comparisonWorkspaceSource, /role="table" aria-label=\{text\.title\} className="w-full" style=\{comparisonTableStyle\(members\.length\)\}/);
    assert.doesNotMatch(comparisonWorkspaceSource, /grid min-w-max/);
    assert.match(comparisonWorkspaceSource, /role="columnheader"/);
    assert.match(comparisonWorkspaceSource, /role="rowheader"/);
    assert.match(comparisonWorkspaceSource, /sticky top-0/);
    assert.match(candidatesPageSource, /comparisonCandidates\.length \? "pb-24" : "pb-1"/);
});

test("移除候选人立即更新矩阵并在后台静默重算，少于两人时退出对比工作区", () => {
    const optimisticStart = containerSource.indexOf("function removeCandidateFromComparisonPreview");
    const optimisticEnd = containerSource.indexOf("// keep-alive", optimisticStart);
    const optimisticSource = containerSource.slice(optimisticStart, optimisticEnd);
    const removeStart = containerSource.indexOf("const removeCandidateFromComparison");
    const removeEnd = containerSource.indexOf("const toggleCandidateInComparison", removeStart);
    const removeSource = containerSource.slice(removeStart, removeEnd);
    assert.match(optimisticSource, /preview\.members\.filter\(\(member\) => member\.candidate\.id !== candidateId\)/);
    assert.match(optimisticSource, /dimension\.values\.filter\(\(value\) => remainingCandidateIds\.has\(value\.candidate_id\)\)/);
    assert.match(optimisticSource, /possible_duplicate_groups[\s\S]*group\.candidate_ids\.length > 1/);
    assert.match(optimisticSource, /manual_override_mode: manualOverrideMode/);
    assert.match(removeSource, /comparisonAbortControllerRef\.current\?\.abort\(\)/);
    assert.match(removeSource, /setComparisonPreview\(\(current\) => removeCandidateFromComparisonPreview\(current, candidateId\)\)/);
    assert.match(removeSource, /loadCandidateComparison\(\{\s*background: true,\s*candidateIds: nextIds,\s*selectionItems: nextItems/);
    assert.match(removeSource, /candidateWorkspaceMode === "comparison" && nextIds\.length < 2/);
    assert.match(removeSource, /setCandidateWorkspaceMode\("list"\)/);
    assert.match(removeSource, /candidateComparisonText\.removedAndExited/);
    assert.match(containerSource, /const requestedCandidateIds = options\?\.candidateIds \?\? comparisonCandidateIds/);
    assert.match(containerSource, /const requestedSelectionItems = options\?\.selectionItems \?\? comparisonSelectionItems/);
});

test("人工修正分数合法零值使用 nullish 判断显示", () => {
    assert.match(containerSource, /manualOverrideScore: score\?\.manual_override_score != null \? String\(score\.manual_override_score\) : ""/);
    assert.doesNotMatch(containerSource, /manualOverrideScore: score\?\.manual_override_score \? String/);
});
