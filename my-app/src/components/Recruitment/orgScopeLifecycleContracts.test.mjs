import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../../app.tsx", import.meta.url), "utf8");
const containerSource = await readFile(
    new URL("./RecruitmentAutomationContainer.tsx", import.meta.url),
    "utf8",
);

test("招聘组织范围由不会随顶层模块切换卸载的AppContent持有", () => {
    assert.match(appSource, /const \[recruitmentOrgScopeSnapshot, setRecruitmentOrgScopeSnapshot\] = useState/);
    assert.match(appSource, /orgScopeSelection=\{recruitmentOrgScopeSelection\}/);
    assert.match(appSource, /onOrgScopeSelectionChange=\{handleRecruitmentOrgScopeSelectionChange\}/);
    assert.match(appSource, /setRecruitmentOrgScopeSnapshot\(null\)/);
    assert.doesNotMatch(containerSource, /\[selectedOrgScope, setSelectedOrgScope\][\s\S]*useState\(defaultOrgScope\)/);
});

test("组织目录仅在权威成功后校验并同步受控范围", () => {
    assert.match(containerSource, /organizationCatalogResult\.value\.authoritative/);
    assert.match(containerSource, /validateRecruitmentOrgScopeSelection\(mountedSelection/);
    assert.match(containerSource, /setOrganizationCatalogStatus\("ready"\)/);
    assert.match(containerSource, /setOrganizationCatalogStatus\("error"\)/);
    assert.match(containerSource, /if \(organizationCatalogStatus !== "ready"\)/);
    assert.match(containerSource, /updateOrgScopeSelection\(validatedSelection\)/);
});

test("权威目录成功时首屏候选人请求显式使用校验后的公司和部门", () => {
    const bootstrapStart = containerSource.indexOf("async function bootstrap()");
    const bootstrapEnd = containerSource.indexOf("void bootstrap();", bootstrapStart);
    const bootstrapSource = containerSource.slice(bootstrapStart, bootstrapEnd);
    const validationIndex = bootstrapSource.indexOf("validateRecruitmentOrgScopeSelection");
    const requestIndex = bootstrapSource.indexOf("loadCandidatesFirstPage(bootstrapSelection)");
    assert.ok(validationIndex >= 0 && requestIndex > validationIndex);
    assert.match(bootstrapSource, /candidateListRefreshQueryRef\.current = \{[\s\S]*departmentScope: bootstrapSelection\.departmentScope,[\s\S]*orgScope: bootstrapSelection\.orgScope/);
    assert.match(bootstrapSource, /async function loadCandidatesFirstPage\(scope: RecruitmentOrgScopeSelection\)/);
    assert.match(bootstrapSource, /buildCandidateListQueryString\(\{[\s\S]*departmentScope: scope\.departmentScope,[\s\S]*orgScope: scope\.orgScope/);
});

test("目录失败时保留挂载选择且不把降级目录写回父级", () => {
    const bootstrapStart = containerSource.indexOf("async function bootstrap()");
    const bootstrapEnd = containerSource.indexOf("void bootstrap();", bootstrapStart);
    const bootstrapSource = containerSource.slice(bootstrapStart, bootstrapEnd);
    const authoritativeStart = bootstrapSource.indexOf("organizationCatalogResult.value.authoritative");
    const authoritativeEnd = bootstrapSource.indexOf("} else {", authoritativeStart);
    const authoritativeSource = bootstrapSource.slice(authoritativeStart, authoritativeEnd);
    const errorStart = authoritativeEnd;
    const errorEnd = bootstrapSource.indexOf("candidateListRefreshQueryRef.current", errorStart);
    const errorSource = bootstrapSource.slice(errorStart, errorEnd);
    assert.match(bootstrapSource, /let bootstrapSelection = mountedSelection/);
    assert.match(authoritativeSource, /bootstrapSelection = validateRecruitmentOrgScopeSelection/);
    assert.match(authoritativeSource, /updateOrgScopeSelection\(bootstrapSelection\)/);
    assert.match(errorSource, /setOrganizationCatalogStatus\("error"\)/);
    assert.doesNotMatch(errorSource, /bootstrapSelection\s*=/);
    assert.doesNotMatch(errorSource, /updateOrgScopeSelection/);
});

test("主动切换组织与自动权限回退使用同一受控更新入口", () => {
    const handlerStart = containerSource.indexOf("const handleOrgScopeChange");
    const handlerEnd = containerSource.indexOf("function renderWorkspaceOrganizationControl", handlerStart);
    const handlerSource = containerSource.slice(handlerStart, handlerEnd);
    assert.match(handlerSource, /updateOrgScopeSelection\(\{orgScope, departmentScope: deptScope\}\)/);
    assert.doesNotMatch(handlerSource, /setSelectedOrgScope|setSelectedDepartmentScope/);
});

test("人才库、审计和组织相关设置请求等待目录解析", () => {
    assert.match(containerSource, /activePage === "talent-pool" && organizationScopeResolved/);
    assert.match(containerSource, /activePage === "audit" && organizationScopeResolved/);
    assert.match(containerSource, /activePage !== "settings-skills" \|\| !organizationScopeResolved/);
    assert.match(containerSource, /activePage !== "settings-mail" \|\| !organizationScopeResolved/);
});
