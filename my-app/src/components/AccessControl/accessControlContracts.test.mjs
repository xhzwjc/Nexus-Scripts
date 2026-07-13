import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const centerSource = await readFile(new URL('./AccessControlCenter.tsx', import.meta.url), 'utf8');
const usersSource = await readFile(new URL('./AccessControlUsersPage.tsx', import.meta.url), 'utf8');
const rolesSource = await readFile(new URL('./AccessControlRolesPage.tsx', import.meta.url), 'utf8');
const organizationsSource = await readFile(new URL('./AccessControlOrganizationsPage.tsx', import.meta.url), 'utf8');
const auditSource = await readFile(new URL('./AccessControlAuditPage.tsx', import.meta.url), 'utf8');
const querySource = await readFile(new URL('./accessControlQuery.ts', import.meta.url), 'utf8');

test('权限中心不再请求整包overview并按当前标签加载', () => {
    assert.doesNotMatch(centerSource, /\/api\/admin\/rbac\/overview/);
    assert.match(usersSource, /\/api\/admin\/rbac\/users\?/);
    assert.match(rolesSource, /\/api\/admin\/rbac\/catalog/);
    assert.match(organizationsSource, /\/api\/admin\/rbac\/organizations/);
    assert.match(auditSource, /\/api\/admin\/rbac\/audit-logs\?/);
    assert.match(centerSource, /invalidateRbacCache\(\);/);
});

test('用户和审计查询具有服务端分页、防抖与筛选契约', () => {
    assert.match(usersSource, /page_size: String\(pageSize\)/);
    assert.match(usersSource, /useDebouncedValue\(query, 300\)/);
    assert.match(usersSource, /params\.set\('role_code'/);
    assert.match(usersSource, /params\.set\('config_state'/);
    assert.match(auditSource, /page_size: String\(AUDIT_PAGE_SIZE\)/);
    assert.match(auditSource, /useDebouncedValue\(query, 300\)/);
    assert.match(auditSource, /params\.set\('sensitivity'/);
});

test('请求切换会取消旧请求且旧响应不能覆盖新状态', () => {
    assert.match(querySource, /const controller = new AbortController\(\)/);
    assert.match(querySource, /requestIdRef\.current = requestId/);
    assert.match(querySource, /shouldApplyRbacResponse/);
    assert.match(querySource, /return \(\) => controller\.abort\(\)/);
});

test('用户和角色大型表单仅在使用时动态加载与挂载', () => {
    assert.match(usersSource, /const UserForm = dynamic/);
    assert.match(usersSource, /\{\(createOpen \|\| editUser\) && <UserForm/);
    assert.match(rolesSource, /const RoleForm = dynamic/);
    assert.match(rolesSource, /\{editorMode \? \(/);
});

test('组织用户显式分页且权限缓存只驻留内存', () => {
    assert.match(organizationsSource, /page_size: String\(ORG_USERS_PAGE_SIZE\)/);
    assert.match(querySource, /const rbacMemoryCache = new Map/);
    assert.doesNotMatch(querySource, /localStorage\.setItem|sessionStorage\.setItem/);
    assert.match(querySource, /permissionVersion/);
    assert.match(querySource, /requestError\.status === 401 \|\| requestError\.status === 403/);
    assert.match(querySource, /invalidateRbacCache\(\);/);
});

test('权限变更只失效受影响目录及派生概览审计缓存', () => {
    assert.match(usersSource, /invalidateRbacCache\('\/api\/admin\/rbac\/users'\)/);
    assert.match(usersSource, /invalidateRbacCache\('\/api\/admin\/rbac\/summary'\)/);
    assert.match(rolesSource, /invalidateRbacCache\('\/api\/admin\/rbac\/catalog'\)/);
    assert.match(rolesSource, /invalidateRbacCache\('\/api\/admin\/rbac\/users'\)/);
    assert.match(organizationsSource, /invalidateRbacCache\('\/api\/admin\/rbac\/organizations'\)/);
    assert.match(organizationsSource, /invalidateRbacCache\('\/api\/admin\/rbac\/audit-logs'\)/);
});
