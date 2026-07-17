import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const containerSource = await readFile(
    new URL("./RecruitmentAutomationContainer.tsx", import.meta.url),
    "utf8",
);
const uploadDialogStart = containerSource.indexOf("const resumeUploadDialogBody");
const uploadDialogEnd = containerSource.indexOf("function renderPage", uploadDialogStart);
const uploadDialogSource = containerSource.slice(uploadDialogStart, uploadDialogEnd);

test("超长简历文件名不会撑宽上传弹窗", () => {
    assert.notEqual(uploadDialogStart, -1);
    assert.notEqual(uploadDialogEnd, -1);
    assert.match(uploadDialogSource, /DialogContent[^>]+className="flex min-w-0 max-h-\[88vh\][^"]*overflow-hidden/);
    assert.match(
        uploadDialogSource,
        /ScrollArea className="[^"]*\[&_\[data-slot=scroll-area-viewport\]>div\]:!block[^"]*\[&_\[data-slot=scroll-area-viewport\]>div\]:!w-full[^"]*\[&_\[data-slot=scroll-area-viewport\]>div\]:!min-w-0[^"]*\[&_\[data-slot=scroll-area-viewport\]>div\]:!max-w-full[^"]*"/,
        "必须覆盖 Radix ScrollArea 自动生成的 table 容器，否则长文件名仍会按内容宽度撑开弹窗",
    );
    assert.match(uploadDialogSource, /className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden px-6 py-5"/);
    assert.match(uploadDialogSource, /className="flex w-full min-w-0 max-w-full items-center gap-2\.5 overflow-hidden/);
    assert.match(uploadDialogSource, /className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"/);
    assert.match(uploadDialogSource, /title=\{file\.name\} className="block min-w-0 flex-1 truncate/);
});
