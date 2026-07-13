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
const sseSource = await readFile(
    new URL("./hooks/useTaskSSE.ts", import.meta.url),
    "utf8",
);

test("SSE首连和重连均触发带重连标记的候选人页对账", () => {
    assert.match(sseSource, /handlers\.onConnected\?\.\(\{\s*reconnected: wasReconnected/);
    assert.match(containerSource, /onConnected: \(\{reconnected\}\) => \{/);
    assert.match(containerSource, /armCandidateConsistencyPolling\(CANDIDATE_CONSISTENCY_EVENT_WINDOW_MS, \{forceRefresh: true\}\)/);
    assert.match(containerSource, /armCandidateConsistencyPolling\(CANDIDATE_CONSISTENCY_ACTIVATION_WINDOW_MS, \{forceRefresh: true\}\)/);
});

test("一致性轮询不会覆盖筛选分页请求并在隐藏或切页时清理", () => {
    const pollingStart = containerSource.indexOf("const reconcileCurrentCandidatePage = async () =>");
    const pollingEnd = containerSource.indexOf("const current = positionDetail?.current_jd_version", pollingStart);
    const pollingSource = containerSource.slice(pollingStart, pollingEnd);
    assert.match(pollingSource, /candidateListLoadAbortControllerRef\.current/);
    assert.match(pollingSource, /activePageRef\.current === "candidates"/);
    assert.match(pollingSource, /pageVisibleRef\.current/);
    assert.match(pollingSource, /CANDIDATE_CONSISTENCY_IDLE_POLL_INTERVAL_MS/);
    assert.match(pollingSource, /CANDIDATE_CONSISTENCY_FULL_REFRESH_INTERVAL_MS/);
    assert.match(pollingSource, /refreshCandidateStatsRef\.current\(query\.departmentScope, query\.orgScope\)/);
    assert.match(pollingSource, /loadCandidatePositionsRef\.current\(\{force: true\}\)/);
    assert.match(pollingSource, /window\.setTimeout/);
    assert.match(pollingSource, /window\.clearTimeout\(timer\)/);

    const loadStart = containerSource.indexOf("async function loadCandidates(options?:");
    const loadEnd = containerSource.indexOf("async function refreshActiveCandidateList", loadStart);
    const loadSource = containerSource.slice(loadStart, loadEnd);
    assert.match(loadSource, /candidatesLoadRequestIdRef\.current !== requestId/);
    assert.match(loadSource, /candidateListContextKeyRef\.current !== contextKey/);
    assert.match(loadSource, /abortCandidateListRequests\(\)/);

    const refreshStart = containerSource.indexOf("async function refreshActiveCandidateList");
    const refreshEnd = containerSource.indexOf("async function refreshActiveCandidateListAndStats", refreshStart);
    const refreshSource = containerSource.slice(refreshStart, refreshEnd);
    assert.match(refreshSource, /candidateListRefreshQueryRef\.current/);
    assert.match(refreshSource, /positionFilter: query\.positionFilter/);
    assert.match(refreshSource, /statusFilter: query\.statusFilter/);
    assert.match(refreshSource, /pageIndex: query\.pageIndex/);
    assert.match(refreshSource, /pageSize: query\.pageSize/);
});

test("bootstrap首屏和延迟统计同样遵守latest-wins", () => {
    const bootstrapStart = containerSource.indexOf("async function bootstrap()");
    const bootstrapEnd = containerSource.indexOf("void bootstrap();", bootstrapStart);
    const bootstrapSource = containerSource.slice(bootstrapStart, bootstrapEnd);
    assert.match(bootstrapSource, /refreshCandidateStatsRef\.current\(query\.departmentScope, query\.orgScope\)/);
    assert.match(bootstrapSource, /const requestId = candidatesLoadRequestIdRef\.current \+ 1/);
    assert.match(bootstrapSource, /candidateListContextKeyRef\.current !== contextKey/);
    assert.match(bootstrapSource, /signal: controller\.signal/);
    assert.match(bootstrapSource, /candidateListLoadAbortControllerRef\.current === controller/);
});

test("统计与岗位最终一致性刷新使用最新scope且旧响应不能回写", () => {
    assert.match(containerSource, /candidateStatsLoadRequestIdRef\.current === requestId/);
    assert.match(containerSource, /candidatePipelineStatsLoadRequestIdRef\.current !== requestId/);
    assert.match(containerSource, /resolveCandidateStatsScopeKey\(\) === requestedScopeKey/);
    assert.match(containerSource, /resolveCandidatePipelineStatsScopeKey\(\) !== requestedScopeKey/);
    assert.match(containerSource, /refreshCandidateStatsRef\.current\(query\.departmentScope, query\.orgScope\)/);
    assert.match(containerSource, /candidateListRefreshQueryRef\.current = \{[\s\S]*departmentScope: deptScope,[\s\S]*orgScope,/);
});

test("实时补丁按候选人ID更新并失效旧分页快照", () => {
    const syncStart = containerSource.indexOf("const syncRealtimeCandidateListsBatch");
    const syncEnd = containerSource.indexOf("const syncRealtimeCandidateLists =", syncStart);
    const syncSource = containerSource.slice(syncStart, syncEnd);
    assert.match(syncSource, /candidateListPageCacheRef\.current = null/);
    assert.match(syncSource, /candidatesLoadRequestIdRef\.current \+= 1/);
    assert.match(syncSource, /candidateListLoadAbortControllerRef\.current\.abort\(\)/);
    assert.match(syncSource, /forceRefresh: forceCandidateListRefresh/);
    assert.match(syncSource, /candidate\.id === candidateId/);
    assert.match(syncSource, /snapshot\.id/);
});

test("批量初筛只保留一个列表级轮询而不创建逐候选人轮询", () => {
    const attachStart = containerSource.indexOf("function attachScreeningTaskMonitor(");
    const attachEnd = containerSource.indexOf("useEffect(() =>", attachStart);
    const attachSource = containerSource.slice(attachStart, attachEnd);
    assert.doesNotMatch(attachSource, /startTaskMonitor\(/);
    assert.match(containerSource, /CANDIDATE_CONSISTENCY_POLL_INTERVAL_MS/);
});

test("当前候选人表格行使用稳定候选人ID且补丁变化会产生新对象", () => {
    assert.match(candidatesPageSource, /<CandidatePrototypeTableRow\s+key=\{candidate\.id\}/);
    assert.match(containerSource, /return changed \? \(\{ \.\.\.current, \.\.\.patch \} as T\) : current/);
});
