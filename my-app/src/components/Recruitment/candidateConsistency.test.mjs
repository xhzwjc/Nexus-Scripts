import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("./candidateConsistency.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
    },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const {
    coalesceCandidatePatchesById,
    resolveCandidateConsistencyPollIntervalMs,
    shouldPollCandidateListForConsistency,
} = await import(moduleUrl);

const baseInput = {
    candidatePageActive: true,
    pageVisible: true,
    candidatesLoaded: true,
    hasVisibleLiveTask: false,
    hasActiveBatchTask: false,
    runningCandidateCount: 0,
    runningCountConfirmedUntil: 0,
    pollUntil: 0,
    now: 1_000,
};

test("候选人任务等待或处理中时保留单列表一致性轮询", () => {
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        hasVisibleLiveTask: true,
    }), true);
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        runningCandidateCount: 2,
        runningCountConfirmedUntil: 31_000,
    }), true);
});

test("回调早于订阅且候选人不在当前页时由批量任务或有限窗口兜底", () => {
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        hasActiveBatchTask: true,
    }), true);
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        pollUntil: 61_000,
    }), true);
});

test("成功或失败后的有限窗口结束后停止额外轮询", () => {
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        pollUntil: 999,
    }), false);
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        runningCandidateCount: 2,
        runningCountConfirmedUntil: 999,
    }), false);
});

test("事件窗口结束后仍保留低频最终一致性轮询", () => {
    assert.equal(resolveCandidateConsistencyPollIntervalMs(baseInput, {
        fast: 12_000,
        idle: 60_000,
    }), 60_000);
    assert.equal(resolveCandidateConsistencyPollIntervalMs({
        ...baseInput,
        hasVisibleLiveTask: true,
    }, {
        fast: 12_000,
        idle: 60_000,
    }), 12_000);
    assert.equal(resolveCandidateConsistencyPollIntervalMs({
        ...baseInput,
        pageVisible: false,
    }, {
        fast: 12_000,
        idle: 60_000,
    }), null);
});

test("切页或页面进入后台时暂停轮询，恢复后由激活对账重新开启", () => {
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        candidatePageActive: false,
        hasVisibleLiveTask: true,
    }), false);
    assert.equal(shouldPollCandidateListForConsistency({
        ...baseInput,
        pageVisible: false,
        hasActiveBatchTask: true,
    }), false);
});

test("多个候选人并发回调按稳定ID合并且不会串数据", () => {
    const patches = coalesceCandidatePatchesById([
        {id: 101, status: "screening_running", taskId: 1},
        {id: 202, status: "screening_running", taskId: 2},
        {id: 101, status: "screening_passed", score: 86},
        {id: 202, status: "screening_failed", reason: "timeout"},
    ]);

    assert.deepEqual(patches.get(101), {
        id: 101,
        status: "screening_passed",
        taskId: 1,
        score: 86,
    });
    assert.deepEqual(patches.get(202), {
        id: 202,
        status: "screening_failed",
        taskId: 2,
        reason: "timeout",
    });
    assert.equal(patches.size, 2);
});
