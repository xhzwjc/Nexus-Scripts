import assert from "node:assert/strict";
import test from "node:test";

import {resolveAuditNoticePresentation} from "./auditNotice.ts";

test("audit page success warning uses execution hint not invalid summary", () => {
    const notice = resolveAuditNoticePresentation({
        screeningResultState: "success",
        screeningResultValid: true,
        invalidResultSummary: "评分辅助上下文已先清洗",
        invalidResultReasons: [],
        modelSchemaViolationReason: "resume_score task returned nested parsed_resume+score payload",
    });

    assert.equal(notice.show, true);
    assert.equal(notice.isInvalid, false);
    assert.equal(notice.title, "执行提示");
    assert.equal(notice.showSchemaReason, false);
    assert.equal(notice.showInvalidReasons, false);
});
