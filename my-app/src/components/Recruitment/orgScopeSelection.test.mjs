import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("./orgScopeSelection.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
    },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const {
    ALL_COMPANY_DEPARTMENTS_VALUE,
    validateRecruitmentOrgScopeSelection,
} = await import(moduleUrl);

const organizations = [
    {org_code: "group", name: "集团", org_type: "group", path: "group", sort_order: 1, is_active: true},
    {org_code: "sub-group", name: "子集团", org_type: "sub_group", parent_org_code: "group", path: "group/sub-group", sort_order: 2, is_active: true},
    {org_code: "company-a", name: "公司A", org_type: "company", parent_org_code: "sub-group", path: "group/sub-group/company-a", sort_order: 3, is_active: true},
    {org_code: "dept-a", name: "部门A", org_type: "department", parent_org_code: "company-a", path: "group/sub-group/company-a/dept-a", sort_order: 4, is_active: true},
    {org_code: "company-b", name: "公司B", org_type: "company", parent_org_code: "group", path: "group/company-b", sort_order: 5, is_active: true},
    {org_code: "dept-b", name: "部门B", org_type: "department", parent_org_code: "company-b", path: "group/company-b/dept-b", sort_order: 6, is_active: true},
];

function catalog(overrides = {}) {
    return {
        defaultOrgScope: "group",
        hasAllOrgScope: false,
        organizationCatalog: organizations,
        visibleOrgCodes: ["group", "sub-group", "company-a", "dept-a", "company-b", "dept-b"],
        ...overrides,
    };
}

test("权威目录仍授权公司和部门时完整保留选择", () => {
    const selection = {orgScope: "company-a", departmentScope: "dept-a"};
    assert.deepEqual(validateRecruitmentOrgScopeSelection(selection, catalog()), selection);
});

test("子集团范围及其后代部门在仍授权时完整保留", () => {
    const selection = {orgScope: "sub-group", departmentScope: "dept-a"};
    assert.deepEqual(validateRecruitmentOrgScopeSelection(selection, catalog()), selection);
});

test("公司失权时公司与部门原子回落到默认范围", () => {
    const selection = {orgScope: "company-a", departmentScope: "dept-a"};
    assert.deepEqual(validateRecruitmentOrgScopeSelection(selection, catalog({
        visibleOrgCodes: ["group"],
    })), {
        orgScope: "group",
        departmentScope: ALL_COMPANY_DEPARTMENTS_VALUE,
    });
});

test("公司仍授权但部门失权时只回落部门范围", () => {
    const selection = {orgScope: "company-a", departmentScope: "dept-b"};
    assert.deepEqual(validateRecruitmentOrgScopeSelection(selection, catalog()), {
        orgScope: "company-a",
        departmentScope: ALL_COMPANY_DEPARTMENTS_VALUE,
    });
});

test("仅授权一个部门时自动落到该部门而不是虚构公司全量权限", () => {
    const selection = {orgScope: "company-a", departmentScope: ALL_COMPANY_DEPARTMENTS_VALUE};
    assert.deepEqual(validateRecruitmentOrgScopeSelection(selection, catalog({
        visibleOrgCodes: ["dept-a"],
    })), {
        orgScope: "company-a",
        departmentScope: "dept-a",
    });
});

test("默认公司也不可用时选择排序后的首个有效公司", () => {
    const selection = {orgScope: "removed-company", departmentScope: "removed-dept"};
    assert.deepEqual(validateRecruitmentOrgScopeSelection(selection, catalog({
        defaultOrgScope: "removed-company",
        visibleOrgCodes: ["company-b", "dept-b"],
    })), {
        orgScope: "company-b",
        departmentScope: ALL_COMPANY_DEPARTMENTS_VALUE,
    });
});
