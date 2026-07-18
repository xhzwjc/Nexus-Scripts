import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const talentPoolPageSource = await readFile(
    new URL("./pages/TalentPoolPage.tsx", import.meta.url),
    "utf8",
);
const sourceStageStart = talentPoolPageSource.indexOf("function talentPoolSourceStageLabel");
const sourceStageEnd = talentPoolPageSource.indexOf("function talentPoolReidentifyGroupLabel", sourceStageStart);
const sourceStageSource = talentPoolPageSource.slice(sourceStageStart, sourceStageEnd);

test("新上传候选人在岗位识别中不会被标记为历史人才库数据", () => {
    assert.notEqual(sourceStageStart, -1);
    assert.notEqual(sourceStageEnd, -1);
    assert.match(talentPoolPageSource, /sourceAiMatching: isZh \? "AI 岗位识别中" : "AI Position Matching"/);
    assert.match(talentPoolPageSource, /const sourceStage = talentPoolSourceStageLabel\(candidate, tr\);/);

    const matchingBranchIndex = sourceStageSource.indexOf("if (isTalentPoolMatching(candidate)) return tr.sourceAiMatching;");
    const reasonReadIndex = sourceStageSource.indexOf("const reason = talentPoolReason(candidate);");
    const legacyFallbackIndex = sourceStageSource.indexOf("return tr.sourceLegacyArchived;");

    assert.notEqual(matchingBranchIndex, -1);
    assert.ok(reasonReadIndex > matchingBranchIndex, "matching 状态必须优先于空 talent_pool_reason 的历史数据兜底");
    assert.ok(legacyFallbackIndex > reasonReadIndex, "历史数据文案只能作为已知来源分支之后的最终兜底");
});
