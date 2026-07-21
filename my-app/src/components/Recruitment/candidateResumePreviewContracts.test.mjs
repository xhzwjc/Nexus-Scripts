import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const candidatesSource = await readFile(new URL("./pages/CandidatesPage.tsx", import.meta.url), "utf8");

test("候选人切换在浏览器绘制前重置简历视图", () => {
    assert.match(
        candidatesSource,
        /React\.useLayoutEffect\(\(\) => \{[\s\S]*?setCandidateResumeView\("standard"\)/,
    );
});

test("原始简历使用适配深色模式的阅读器画布", () => {
    assert.match(candidatesSource, /data-resume-preview-reader/);
    assert.match(candidatesSource, /bg-\[#EEF0F3\] dark:bg-\[#15171C\]/);
    assert.match(candidatesSource, /dark:border-\[#2E333C\]/);
    assert.match(candidatesSource, /dark:shadow-\[0_12px_32px_rgba\(0,0,0,0\.34\)\]/);
});

test("原始简历首帧就显示稳定加载层", () => {
    assert.match(candidatesSource, /const inlineResumePreviewPending = Boolean\(/);
    assert.match(candidatesSource, /data-resume-preview-loading/);
    assert.match(candidatesSource, /transition-opacity duration-300/);
});
