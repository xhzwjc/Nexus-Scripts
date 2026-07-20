import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("./candidateIdentity.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const isolatedSource = source.replace(/^import .*;\n/gm, "");
const transpiled = ts.transpileModule(
    `const getCurrentLanguage = () => "zh-CN";
const zhCN = {recruitment: {candidateIdentity: {namePending: "姓名待识别"}}};
const enUS = {recruitment: {candidateIdentity: {namePending: "Name pending"}}};
${isolatedSource}`,
    {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
        },
    },
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const {
    extractHighConfidenceNameFromResumeFilename,
    resolveCandidateIdentity,
} = await import(moduleUrl);

test("闭合岗位前缀后的明确姓名可用于历史数据展示", () => {
    const fileName = "【硬件测试工程师_北京 10-15K】冯立娜 3年.pdf";
    assert.equal(extractHighConfidenceNameFromResumeFilename(fileName), "冯立娜");
    assert.deepEqual(resolveCandidateIdentity({
        name: "【硬件测试工程师_北京 10-15K】冯立娜 3年",
        source_detail: fileName,
    }), {
        rawName: "【硬件测试工程师_北京 10-15K】冯立娜 3年",
        displayName: "冯立娜",
        avatarLabel: "冯",
        trusted: true,
        reason: "filename_name",
    });
    assert.equal(
        extractHighConfidenceNameFromResumeFilename("【智能家居技术工程师（兼职_全国各大城市）_西安 500-10000元_月】张柯 10年以上18735365153.pdf"),
        "张柯",
    );
});

test("纯岗位、城市和岗位词不会被伪装成候选人姓名", () => {
    for (const name of [
        "【智能家居技术工程师（兼职 全国各大城市）】",
        "【岗位】济南",
        "【岗位】测试工程师",
        "测试工程师",
        "智能家居技术工程师",
        "个人简历",
        "软件研发",
        "数据分析",
        "Product Manager",
        "Software Engineer",
        "东莞",
        "广东",
        "!!!John",
    ]) {
        const identity = resolveCandidateIdentity({name, source_detail: `${name}.pdf`});
        assert.equal(identity.displayName, "姓名待识别");
        assert.equal(identity.avatarLabel, null);
        assert.equal(identity.trusted, false);
    }
});

test("可信姓名保留文字头像且英文姓名使用首尾缩写", () => {
    assert.equal(resolveCandidateIdentity({name: "张三", source_detail: "张三.pdf"}).avatarLabel, "张");
    assert.equal(resolveCandidateIdentity({name: "Alice Smith", name_source: "hr_manual"}).avatarLabel, "AS");
    assert.equal(resolveCandidateIdentity({name: "Alice", name_source: "resume_parsed"}).avatarLabel, "A");
});

test("人工姓名优先于生成式外观规则", () => {
    const identity = resolveCandidateIdentity({
        name: "【艺名】",
        name_source: "hr_manual",
        source_detail: "【测试工程师】张三.pdf",
    });
    assert.equal(identity.displayName, "【艺名】");
    assert.equal(identity.avatarLabel, "艺");
    assert.equal(identity.trusted, true);
});
