import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const activeSources = [
    "./pages/CandidatesPage.tsx",
    "./pages/TalentPoolPage.tsx",
    "./pages/CandidateComparisonWorkspace.tsx",
    "./pages/ReviewWorkbenchPage.tsx",
    "./pages/InterviewWorkbenchPage.tsx",
    "./pages/WorkspacePage.tsx",
    "./RecruitmentAutomationContainer.tsx",
];

const sourceEntries = await Promise.all(activeSources.map(async (relativePath) => ({
    relativePath,
    source: await readFile(new URL(relativePath, import.meta.url), "utf8"),
})));

test("所有活跃招聘工作区统一使用候选人展示身份契约", () => {
    for (const {relativePath, source} of sourceEntries) {
        assert.match(source, /resolveCandidateIdentity/, `${relativePath} 必须使用统一身份解析器`);
    }
});

test("所有文字头像都通过共享组件降级为人物图标", () => {
    for (const {relativePath, source} of sourceEntries) {
        assert.match(source, /CandidateAvatar/, `${relativePath} 必须使用共享头像组件`);
        assert.doesNotMatch(
            source,
            /candidate[^\n]*\.name[^\n]*(?:slice\(0,\s*1\)|charAt\(0\))|candidate\.name\.trim\(\)\.slice/,
            `${relativePath} 不得再次直接截取候选人姓名首字符`,
        );
    }
});

test("姓名待识别文案具有完整的强类型中英文 i18n 契约", async () => {
    const [types, zh, en, avatar] = await Promise.all([
        readFile(new URL("../../lib/i18n/types.ts", import.meta.url), "utf8"),
        readFile(new URL("../../lib/i18n/translations/zh-CN.ts", import.meta.url), "utf8"),
        readFile(new URL("../../lib/i18n/translations/en-US.ts", import.meta.url), "utf8"),
        readFile(new URL("./components/CandidateAvatar.tsx", import.meta.url), "utf8"),
    ]);
    assert.match(types, /candidateIdentity:\s*\{\s*namePending: string;/);
    assert.match(zh, /candidateIdentity:\s*\{\s*namePending: '姓名待识别'/);
    assert.match(en, /candidateIdentity:\s*\{\s*namePending: 'Name pending'/);
    assert.match(avatar, /UserRound/);
    assert.match(avatar, /!hasLabel && "bg-\[#B0B2B8\] text-white"/);
});

test("活跃工作流不会在确认框、重复提示和默认面试主题中回退原始姓名", async () => {
    const [container, candidatesPage, interviewPage, comparisonPage] = await Promise.all([
        readFile(new URL("./RecruitmentAutomationContainer.tsx", import.meta.url), "utf8"),
        readFile(new URL("./pages/CandidatesPage.tsx", import.meta.url), "utf8"),
        readFile(new URL("./pages/InterviewWorkbenchPage.tsx", import.meta.url), "utf8"),
        readFile(new URL("./pages/CandidateComparisonWorkspace.tsx", import.meta.url), "utf8"),
    ]);
    assert.doesNotMatch(container, /candidateDeleteTarget\?\.name\s*\|\|/);
    assert.doesNotMatch(candidatesPage, /defaultInterviewSubject\(candidateDetail\?\.candidate\.name\)/);
    assert.doesNotMatch(candidatesPage, /\{dup\.name\}\s*\(/);
    assert.doesNotMatch(interviewPage, /createScheduleForm\([^\n]*task\.candidate\.name/);
    assert.match(comparisonPage, /\[members, pendingCandidateName\]/);
});
