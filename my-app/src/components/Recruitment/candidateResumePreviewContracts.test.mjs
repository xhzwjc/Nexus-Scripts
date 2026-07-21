import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const candidatesSource = await readFile(new URL("./pages/CandidatesPage.tsx", import.meta.url), "utf8");
const adapterSource = await readFile(new URL("./components/ResumeViewerAdapter.tsx", import.meta.url), "utf8");
const proxySource = await readFile(new URL("../../app/api/recruitment/[...path]/route.ts", import.meta.url), "utf8");
const originalResumePanelStart = candidatesSource.indexOf('{candidateResumeView === "original" ? (');
const originalResumePanelSource = candidatesSource.slice(
    originalResumePanelStart,
    candidatesSource.indexOf('{candidateResumeView === "standard" ? (', originalResumePanelStart),
);

test("候选人切换在浏览器绘制前重置简历视图", () => {
    assert.match(
        candidatesSource,
        /React\.useLayoutEffect\(\(\) => \{[\s\S]*?setCandidateResumeView\("standard"\)/,
    );
});

test("原始简历只通过 ResumeViewerAdapter 接入 Headless Viewer", () => {
    assert.match(candidatesSource, /<ResumeViewerAdapter/);
    assert.doesNotMatch(candidatesSource, /<iframe/);
    assert.doesNotMatch(candidatesSource, /InlineResumePdfPreview/);
    assert.doesNotMatch(candidatesSource, /pdfjs-dist/);
    assert.match(adapterSource, /EmbedPDF/);
    assert.match(adapterSource, /DocumentManagerPluginPackage/);
    assert.match(adapterSource, /Scroller/);
    assert.match(adapterSource, /useRenderCapability/);
    assert.doesNotMatch(adapterSource, /TilingLayer/);
});

test("详情页原有下载、新窗口和打印动作继续复用鉴权下载链路", () => {
    assert.match(candidatesSource, /onDownload=\{\(\) => void openResumeFile\(primaryResumeFile, true\)\}/);
    assert.match(candidatesSource, /onOpenExternal=\{\(\) => void openResumeFile\(primaryResumeFile, false\)\}/);
    assert.match(candidatesSource, /const printCandidateResume = React\.useCallback/);
    assert.match(candidatesSource, /authenticatedFetch\(resolveResumeFileDownloadPath\(file\)/);
    assert.match(candidatesSource, /printWindow\.print\(\)/);
});

test("正常预览只显示居中的 PDF 页面，不叠加工具栏与装饰画布", () => {
    assert.doesNotMatch(adapterSource, /data-resume-viewer-search/);
    assert.doesNotMatch(adapterSource, /tool="previous-page"/);
    assert.doesNotMatch(adapterSource, /tool="zoom-in"/);
    assert.doesNotMatch(adapterSource, /tool="ai-overlay"/);
    assert.match(adapterSource, /createPluginRegistration\(ViewportPluginPackage, \{viewportGap: 0\}\)/);
    assert.match(adapterSource, /!overflow-auto !p-0 bg-transparent \[scrollbar-width:none\]/);
    assert.match(adapterSource, /className="h-full w-full overflow-auto bg-transparent p-0 \[scrollbar-width:none\]/);
    assert.match(adapterSource, /className="relative mx-auto overflow-hidden bg-white"/);
    assert.doesNotMatch(adapterSource, /ring-\[#D8DCE4\]/);
    assert.doesNotMatch(adapterSource, /shadow-\[0_4px_18px/);
});

test("原始简历标题不再展示文件大小和解析状态", () => {
    assert.doesNotMatch(originalResumePanelSource, /tr\.resumeFileDesc/);
});

test("首屏 PDF 图像完成前使用主题加载层遮挡空白页", () => {
    assert.match(adapterSource, /firstPageRenderStatus/);
    assert.match(adapterSource, /onRendered=\{pageIndex === 0 \? handleFirstPageRendered : undefined\}/);
    assert.match(adapterSource, /data-resume-viewer-render-loading/);
    assert.match(adapterSource, /dark:bg-\[#15171C\]/);
});

test("首屏渲染失败或超时后提供退出加载态与重试路径", () => {
    assert.match(adapterSource, /FIRST_PAGE_RENDER_TIMEOUT_MS = 15_000/);
    assert.match(adapterSource, /onRenderError=\{pageIndex === 0 \? handleFirstPageRenderError : undefined\}/);
    assert.match(adapterSource, /data-resume-viewer-render-error/);
    assert.match(adapterSource, /tool="retry-render"/);
    assert.match(adapterSource, /setRenderAttempt\(\(current\) => current \+ 1\)/);
    assert.match(adapterSource, /tool="open-external"/);
});

test("PDFium 原始像素直接绘制到 Canvas，避免 Blob 编码卡住", () => {
    assert.match(adapterSource, /renderPageRaw/);
    assert.match(adapterSource, /context\.putImageData/);
    assert.match(adapterSource, /data-resume-viewer-canvas/);
    assert.match(adapterSource, /task\.abort/);
    assert.doesNotMatch(adapterSource, /<RenderLayer/);
});

test("重复打开同一简历时使用隔离的 Worker 与文档实例", () => {
    assert.match(adapterSource, /const viewerInstanceId = React\.useId\(\)\.replace/);
    assert.match(adapterSource, /`resume-\$\{source\.id\}-\$\{viewerInstanceId\}`/);
    assert.match(adapterSource, /new URL\(PDFIUM_WASM_URL, window\.location\.origin\)\.href/);
    assert.match(adapterSource, /worker: true/);
    assert.doesNotMatch(adapterSource, /worker: false/);
});

test("原始简历预览跟随抽屉可用高度并保留小屏下限", () => {
    assert.match(originalResumePanelSource, /h-\[calc\(100dvh-295px\)\]/);
    assert.match(originalResumePanelSource, /min-h-\[360px\]/);
    assert.doesNotMatch(originalResumePanelSource, /h-\[520px\]/);
});

test("AI Overlay 使用 pageIndex 和归一化坐标并独立于 PDF 图层", () => {
    assert.match(adapterSource, /pageIndex: number/);
    assert.match(adapterSource, /clampNormalized/);
    assert.match(adapterSource, /left: `\$\{x \* 100\}%`/);
    assert.match(adapterSource, /top: `\$\{y \* 100\}%`/);
    assert.match(adapterSource, /data-resume-ai-overlay/);
    assert.match(adapterSource, /pointer-events-none absolute inset-0 z-30/);
});

test("预览传输支持 Range、取消并由 Next 代理透传响应头", () => {
    assert.match(adapterSource, /headers: \{Range: `bytes=0-/);
    assert.match(adapterSource, /new AbortController\(\)/);
    assert.match(adapterSource, /controller\.abort\(\)/);
    assert.match(proxySource, /request\.headers\.get\("range"\)/);
    assert.match(proxySource, /"accept-ranges"/);
    assert.match(proxySource, /"content-range"/);
});

test("PDF 页面保留原始颜色并统一浅深色 Viewer 外观", () => {
    assert.match(adapterSource, /style=\{\{width, height, colorScheme: "light"\}\}/);
    assert.match(adapterSource, /bg-white dark:bg-\[#1B1E25\]/);
    assert.doesNotMatch(adapterSource, /filter:\s*["']?invert/);
    assert.doesNotMatch(adapterSource, /dark:invert/);
});
