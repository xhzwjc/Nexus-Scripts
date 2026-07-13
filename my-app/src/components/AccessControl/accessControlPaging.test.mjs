import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./accessControlPaging.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
    },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`;
const {
    createRbacCacheScope,
    normalizeRbacPage,
    normalizeRbacPageSize,
    shouldApplyRbacResponse,
} = await import(moduleUrl);

test('RBAC分页默认50且最大100', () => {
    assert.equal(normalizeRbacPageSize(Number.NaN), 50);
    assert.equal(normalizeRbacPageSize(0), 50);
    assert.equal(normalizeRbacPageSize(25), 25);
    assert.equal(normalizeRbacPageSize(1000), 100);
    assert.equal(normalizeRbacPage(-5), 1);
    assert.equal(normalizeRbacPage(3.8), 3);
});

test('只有当前且未取消的请求可以回写状态', () => {
    assert.equal(shouldApplyRbacResponse(8, 8, false), true);
    assert.equal(shouldApplyRbacResponse(9, 8, false), false);
    assert.equal(shouldApplyRbacResponse(8, 8, true), false);
});

test('权限缓存键包含稳定用户和权限版本', () => {
    assert.equal(createRbacCacheScope('admin', 7), 'admin:7');
    assert.notEqual(createRbacCacheScope('admin', 7), createRbacCacheScope('admin', 8));
    assert.notEqual(createRbacCacheScope('admin', 7), createRbacCacheScope('operator', 7));
});
