import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const globalsSource = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
const appStylesSource = await readFile(new URL("../../App.css", import.meta.url), "utf8");
const recruitmentSource = await readFile(new URL("./RecruitmentAutomationContainer.tsx", import.meta.url), "utf8");
const accessControlSource = await readFile(new URL("../AccessControl/AccessControlCenter.tsx", import.meta.url), "utf8");
const dialogSource = await readFile(new URL("../ui/dialog.tsx", import.meta.url), "utf8");
const buttonSource = await readFile(new URL("../ui/button.tsx", import.meta.url), "utf8");
const candidatesSource = await readFile(new URL("./pages/CandidatesPage.tsx", import.meta.url), "utf8");
const radarSource = await readFile(new URL("./components/CandidateRadarChart.tsx", import.meta.url), "utf8");

test("招聘深色主题使用原型规定的完整语义令牌", () => {
    const expectedTokens = [
        "--ats-page: #15171c",
        "--ats-surface-raised: #1b1e25",
        "--ats-surface-subtle: #20242c",
        "--ats-surface-sunken: #191c22",
        "--ats-surface-overlay: #23262e",
        "--ats-text-primary: #e8eaed",
        "--ats-text-secondary: #b9bcc4",
        "--ats-text-tertiary: #9da0a8",
        "--ats-text-weak: #9296a0",
        "--ats-text-placeholder: #6e727b",
        "--ats-border-control: #2e333c",
        "--ats-border-card: #282c34",
        "--ats-primary: #5b78ff",
        "--ats-link: #8091ff",
        "--ats-overlay: rgba(0, 0, 0, 0.62)",
    ];

    for (const token of expectedTokens) {
        assert.ok(globalsSource.includes(token), `缺少深色主题令牌：${token}`);
    }
});

test("招聘与权限中心根节点共享深色主题作用域", () => {
    assert.match(recruitmentSource, /ats-dark-theme/);
    assert.match(accessControlSource, /ats-dark-theme/);
    assert.match(globalsSource, /\[role="dialog"\]/);
    assert.match(globalsSource, /\[data-radix-popper-content-wrapper\]/);
    assert.match(globalsSource, /\.fixed\.inset-0/);
});

test("弹窗遮罩层级和按钮状态符合深色规范", () => {
    assert.match(dialogSource, /dark:bg-black\/\[0\.62\]/);
    assert.match(dialogSource, /dark:bg-\[#1B1E25\]/);
    assert.match(dialogSource, /dark:shadow-\[0_16px_48px_rgba\(0,0,0,0\.6\)\]/);
    assert.match(buttonSource, /dark:hover:bg-\[#6E88FF\]/);
    assert.match(buttonSource, /dark:active:bg-\[#4A64E8\]/);
    assert.match(buttonSource, /dark:disabled:bg-\[#2A2F3A\]/);
    assert.match(buttonSource, /dark:disabled:text-\[#5A5E67\]/);
});

test("原生控件与滚动区域也继承深色交互规范", () => {
    assert.match(globalsSource, /color-scheme: dark/);
    assert.match(globalsSource, /scrollbar-color: #3a3f49 transparent/);
    assert.match(globalsSource, /accent-color: var\(--ats-primary\)/);
});

test("浅色数量角标在深色作用域内使用深色表面", () => {
    assert.match(globalsSource, /\[data-slot="badge"\]\[class~="bg-white"\]/);
    assert.match(globalsSource, /background-color: var\(--ats-surface-subtle\) !important/);
    assert.match(globalsSource, /color: var\(--ats-text-tertiary\) !important/);
});

test("全局侧栏与页面共享深色基础表面", () => {
    assert.match(appStylesSource, /\.dark \.dashboard-sidebar \{[\s\S]*background: var\(--ats-page\)/);
    assert.match(appStylesSource, /border-right-color: var\(--ats-border-card\)/);
    assert.match(appStylesSource, /\.dark \.sidebar-nav-item\.active \{[\s\S]*background: var\(--ats-primary\)/);
});

test("候选人详情的评审选择器和档案编辑区使用深色表面", () => {
    assert.match(candidatesSource, /dark:border-\[#4A505C\] dark:bg-\[#15171C\]/);
    assert.match(candidatesSource, /dark:border-\[#282C34\] dark:bg-\[#1B1E25\]/);
    assert.match(candidatesSource, /dark:text-\[#E8EAED\]/);
});

test("候选人雷达图轴标签和网格随深色主题切换", () => {
    assert.match(radarSource, /--candidate-radar-axis:#D6D8DD/);
    assert.match(radarSource, /--candidate-radar-grid:#5E636E/);
    assert.match(radarSource, /fill: "var\(--candidate-radar-axis\)"/);
    assert.match(radarSource, /stroke="var\(--candidate-radar-grid\)"/);
});
