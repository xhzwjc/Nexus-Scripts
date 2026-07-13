import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const containerSource = await readFile(
    new URL("./RecruitmentAutomationContainer.tsx", import.meta.url),
    "utf8",
);
const helperSource = await readFile(
    new URL("./settingsPerformance.ts", import.meta.url),
    "utf8",
);
const mailPageSource = await readFile(
    new URL("./pages/MailSettingsPage.tsx", import.meta.url),
    "utf8",
);
const skillPageSource = await readFile(
    new URL("./pages/SkillSettingsPage.tsx", import.meta.url),
    "utf8",
);

test("设置首屏只启动基础数据和当前设置切片", () => {
    assert.match(containerSource, /shouldBootstrapRecruitmentCore\(activePageRef\.current, canUseRecruitmentWorkspace\)/);
    assert.match(helperSource, /canUseRecruitmentWorkspace && !isRecruitmentSettingsPage\(page\)/);
    const taskSSEBlock = containerSource.slice(
        containerSource.indexOf("const taskSSEPageActive"),
        containerSource.indexOf("const taskSSEEnabled"),
    );
    assert.doesNotMatch(taskSSEBlock, /settings-mail|settings-models|settings-skills/);
    assert.match(containerSource, /const ModelSettingsPage = nextDynamic/);
    assert.match(containerSource, /const SkillSettingsPage = nextDynamic/);
    assert.match(containerSource, /const MailSettingsPage = nextDynamic/);
});

test("Skill 设置使用服务端摘要分页、搜索防抖和详情按需加载", () => {
    assert.match(containerSource, /SETTINGS_SEARCH_DEBOUNCE_MS = 300/);
    assert.match(containerSource, /summary: true,[\s\S]*query: skillSettingsQuery,[\s\S]*taskType: skillSettingsTaskFilter/);
    assert.match(containerSource, /recruitmentApi<RecruitmentSkill>\(`\/skills\/\$\{skill\.id\}`/);
    assert.match(containerSource, /skillSettingsLoadAbortControllerRef\.current\?\.abort\(\)/);
    assert.match(containerSource, /skillSettingsLoadRequestIdRef\.current !== requestId/);
    assert.match(containerSource, /orgCodes: activeBusinessOrgCodes/);
    assert.match(containerSource, /skillSettingsScopeKeyRef\.current !== activeBusinessOrgScopeKey/);
    assert.match(skillPageSource, /skill\.dimension_count/);
    assert.match(skillPageSource, /onPageChange\(pageIndex \+ 1\)/);
    const detailStart = containerSource.indexOf("async function openSkillEditor(skill?");
    const detailEnd = containerSource.indexOf("function openSkillEditorByTaskKind", detailStart);
    const detailSource = containerSource.slice(detailStart, detailEnd);
    assert.match(detailSource, /applySkillEditorState\(detail\)/);
    assert.doesNotMatch(detailSource, /upsertSkillInLocalState\(detail\)/);
});

test("模型查看权限用户可以加载且旧请求不能回写", () => {
    const loaderStart = containerSource.indexOf("async function loadLLMConfigs");
    const loaderEnd = containerSource.indexOf("async function loadChatContext", loaderStart);
    const loaderSource = containerSource.slice(loaderStart, loaderEnd);
    assert.match(loaderSource, /!canViewLLMConfig && !canManageLLMConfig/);
    assert.match(loaderSource, /signal: controller\.signal/);
    assert.match(loaderSource, /llmConfigsLoadRequestIdRef\.current === requestId/);
    assert.match(loaderSource, /llmConfigsLoadedOnceRef\.current = true/);
    const ensureStart = containerSource.indexOf("async function ensureLLMConfigsLoaded");
    const ensureEnd = containerSource.indexOf("async function saveMailAutoPushGlobalConfig", ensureStart);
    assert.doesNotMatch(containerSource.slice(ensureStart, ensureEnd), /llmConfigsLoadedOnceRef\.current = true/);
});

test("邮件切片独立加载且历史只请求摘要分页", () => {
    assert.match(containerSource, /async function loadMailSenders/);
    assert.match(containerSource, /async function loadMailRecipients/);
    assert.match(containerSource, /async function loadMailDispatches/);
    assert.match(containerSource, /async function loadMailAutoConfig/);
    assert.match(containerSource, /`\/resume-mail-dispatches\?\$\{queryString\}`/);
    assert.match(containerSource, /recruitmentApi<RecruitmentResumeMailDispatch>\(`\/resume-mail-dispatches\/\$\{dispatchId\}`/);
    assert.match(containerSource, /await loadMailSenders\(\)/);
    assert.match(containerSource, /await loadMailRecipients\(\)/);
    assert.match(containerSource, /await loadMailDispatches\(\{pageIndex: 0\}\)/);
    assert.match(containerSource, /SETTINGS_RECONCILIATION_INTERVAL_MS = 180_000/);
    assert.match(containerSource, /mailDispatchesScopeKeyRef\.current !== activeBusinessOrgScopeKey/);
    assert.match(containerSource, /resumeMailDispatchHistoryLoadedOnceRef\.current/);
    assert.match(containerSource, /ensureResumeMailDispatchHistoryLoaded/);
    assert.match(containerSource, /async function ensureResumeMailComposerDataLoaded/);
    assert.match(containerSource, /async function ensureResumeMailDispatchHistoryLoaded[\s\S]*if \(!canViewMail\)/);
    assert.match(containerSource, /activePageRef\.current === "settings-mail" && canViewMail/);
    assert.match(containerSource, /loadMailDispatches\(\{pageIndex: 0\}\)/);
    assert.match(containerSource, /reconcileSkillSettingsAfterMutation/);
});

test("邮件页面保留四块独立 Loading 和历史分页", () => {
    assert.match(mailPageSource, /mailSendersLoading && !mailSenderConfigs\.length/);
    assert.match(mailPageSource, /mailRecipientsLoading && !mailRecipients\.length/);
    assert.match(mailPageSource, /mailDispatchesLoading && !resumeMailDispatches\.length/);
    assert.match(mailPageSource, /mailAutoConfigLoading \|\| mailRecipientsLoading/);
    assert.match(mailPageSource, /onResumeMailDispatchPageChange\(resumeMailDispatchPageIndex \+ 1\)/);
    assert.match(mailPageSource, /dispatch\.candidate_names\?\.\[index\]/);
    assert.match(mailPageSource, /dispatch\.position_title/);
});

test("邮件切片按查看、发件箱管理和配置管理权限独立请求与渲染", () => {
    assert.match(containerSource, /const canManageMailSenders = Boolean\(perms\["recruitment-mail-sender-manage"\]\)/);
    assert.match(containerSource, /const canManageMailRecipients = Boolean\(perms\["recruitment-mail-config-manage"\]\)/);
    assert.match(containerSource, /if \(!canViewMail && !canManageMailSenders\)/);
    assert.match(containerSource, /if \(!canViewMail && !canManageMailRecipients\)/);
    assert.match(containerSource, /if \(!canViewMail\) \{\s*return null;/);
    assert.match(mailPageSource, /canViewMail \|\| canManageMailSenders/);
    assert.match(mailPageSource, /canViewMail \|\| canManageMailRecipients/);
    assert.match(mailPageSource, /canViewMail \? <div className="rounded/);
    assert.match(mailPageSource, /canSendMail && dispatch\.status === "failed"/);
});

test("分页适配同时兼容旧数组和新分页对象", () => {
    assert.match(helperSource, /if \(Array\.isArray\(response\)\)/);
    assert.match(helperSource, /items: Array\.isArray\(response\.items\)/);
    assert.match(helperSource, /params\.set\("query", normalizedQuery\)/);
    assert.match(helperSource, /params\.set\("task_type", normalizedTaskType\)/);
    assert.match(helperSource, /params\.append\("org_code", orgCode\)/);
});

test("设置定时对账跟随当前分页和筛选，不会写回旧页面", () => {
    const reconciliationStart = containerSource.indexOf("const reconcileActiveSettingsPage");
    const reconciliationEnd = containerSource.indexOf("const scrollCandidateListToTop", reconciliationStart);
    const reconciliationSource = containerSource.slice(reconciliationStart, reconciliationEnd);
    assert.match(reconciliationSource, /resumeMailDispatchPageIndex/);
    assert.match(reconciliationSource, /skillSettingsPageIndex/);
    assert.match(reconciliationSource, /skillSettingsQuery/);
    assert.match(reconciliationSource, /skillSettingsTaskFilter/);
});
