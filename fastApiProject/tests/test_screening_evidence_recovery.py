"""证据恢复/复核/段落引用新契约回归（jg 复审方案落地）。

样本全部取自 2026-07-18 本地 MySQL 实测的 4 份真实简历误杀案例（候选人 983-986）：
模型引用压缩（拼接/省略/字段重排/加词/换等级词）此前被逐字门整维度归零，
两名候选人被压过人才库线自动误拒。新契约：内容属实→按原文恢复；无法唯一
定位/等级抬格/证据被占用→得分保留转人工复核；编造内容→仍归零。
"""
from app.services.recruitment_service_impl import (
    SCREENING_PAYLOAD_SCHEMA_CONFIG,
    _build_raw_screening_storage_payload,
    _normalize_city_dimension_reasons,
    _sanitize_candidate_education_value,
    _validate_primary_screening_response,
    sanitize_screening_payload,
    sanitize_screening_payload_fast,
)


def _empty_parsed_resume():
    return {
        "basic_info": {f: "" for f in ["name", "phone", "email", "years_of_experience", "education", "location"]},
        "work_experiences": [],
        "education_experiences": [],
        "skills": [],
        "projects": [],
        "summary": "",
    }


def _schema(rules, *, max_possible=None):
    labels = tuple(r["label"] for r in rules)
    return {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": labels,
            "required_core_dimension_labels": tuple(r["label"] for r in rules if r.get("is_core")),
            "required_dimension_rules": tuple(rules),
            "max_possible_score": max_possible if max_possible is not None else sum(r["max_score"] for r in rules),
            "status_thresholds": {"pass_threshold": 75.0, "pool_threshold": 55.0},
        },
    }


def _payload(dims, *, suggested="talent_pool", total=None, match=None):
    computed_total = sum(d["score"] for d in dims)
    return {
        "parsed_resume": _empty_parsed_resume(),
        "score": {
            "total_score": computed_total if total is None else total,
            "match_percent": round(computed_total * 10) if match is None else match,
            "advantages": ["优势"], "concerns": ["关注"],
            "recommendation": "建议纳入人才库观察",
            "suggested_status": suggested,
            "dimensions": dims,
        },
    }


def test_spliced_quote_from_two_real_sentences_is_restored():
    """983 冯立娜案：模型把两句真实原文拼成一条引用 → 不再归零，恢复为原文片段并保分。"""
    raw = (
        "熟悉智能硬件产品测试逻辑，主导升降桌手控器、AI 智能基座等硬件设备的软硬件联调测试\n"
        "2.主导手控器功能测试：验证按键响应、升降速度、档位记忆、急停保护、上下限限位等硬件核心功能"
    )
    rules = [{"label": "智能硬件测试", "max_score": 5.0, "is_core": True,
              "note": "评估智能硬件设备测试经验，重点看手控器、硬件设备、软硬件联调"}]
    dims = [{"label": "智能硬件测试", "score": 4.0, "max_score": 5.0, "reason": "有智能硬件经验",
             "evidence": ["主导升降桌手控器功能测试：验证按键响应、升降速度、档位记忆"], "is_inferred": False}]
    sanitized, meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    dim = sanitized["score"]["dimensions"][0]
    assert dim["score"] == 4.0
    assert dim["evidence"], "恢复后的原文证据不得为空"
    assert all("主导" in item for item in dim["evidence"])
    assert any("已按原文恢复证据片段" in w for w in meta["warnings"])
    assert not sanitized["score"].get("evidence_review_labels")


def test_elided_parenthetical_quote_is_restored():
    """986 陈幸幸案：引用内省略括号与"一系列" → 恢复为完整原文行并保分。"""
    raw = "小米智能摄像机是小米及其生态链公司（如创米、华来、魔象）推出的一系列智能家居安防产品"
    rules = [{"label": "智能家居经验", "max_score": 5.0, "is_core": True,
              "note": "评估智能家居产品测试经验，熟悉小米生态、摄像机等智能家居产品"}]
    dims = [{"label": "智能家居经验", "score": 5.0, "max_score": 5.0, "reason": "小米生态经验",
             "evidence": ["小米智能摄像机是小米及其生态链公司推出的智能家居安防产品"], "is_inferred": False}]
    sanitized, meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    dim = sanitized["score"]["dimensions"][0]
    assert dim["score"] == 5.0
    assert any("如创米、华来、魔象" in item for item in dim["evidence"]), "证据应替换为含括号的完整原文"
    assert any("已按原文恢复证据片段" in w for w in meta["warnings"])


def test_reordered_structured_fields_are_restored():
    """984 杜晓雨案：院校/学历字段顺序被模型重排 → 恢复而非归零。"""
    raw = "性 别： 男 学 历： 本科\n院 校： 北京现代科技学院"
    rules = [{"label": "教育背景", "max_score": 5.0, "is_core": False,
              "note": "评估学历层次与院校，重点看学历、院校名称"}]
    dims = [{"label": "教育背景", "score": 3.0, "max_score": 5.0, "reason": "本科",
             "evidence": ["院 校: 北京现代科技学院 学 历: 本科"], "is_inferred": False}]
    sanitized, meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    dim = sanitized["score"]["dimensions"][0]
    assert dim["score"] == 3.0
    assert any("北京现代科技学院" in item for item in dim["evidence"])
    assert any("已按原文恢复证据片段" in w for w in meta["warnings"])


def test_prefix_word_added_quote_is_restored():
    """985 郭咸臣案：引用前多加一个词（"测试"）→ 恢复而非归零（该误杀曾把 57% 压到 47% 误拒）。"""
    raw = (
        "1. 测试手机硬件及软件性能有无缺陷并进行刷机\n"
        "2. 手机传感器相关测试，如环境光，接近光传感器等"
    )
    rules = [{"label": "传感器测试", "max_score": 5.0, "is_core": True,
              "note": "评估传感器测试经验，重点看手机传感器、环境光等传感器测试"}]
    dims = [{"label": "传感器测试", "score": 2.0, "max_score": 5.0, "reason": "有传感器测试",
             "evidence": ["测试手机传感器相关测试,如环境光,接近光传感器等"], "is_inferred": False}]
    sanitized, meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    dim = sanitized["score"]["dimensions"][0]
    assert dim["score"] == 2.0
    assert any("手机传感器相关测试" in item for item in dim["evidence"])
    assert any("已按原文恢复证据片段" in w for w in meta["warnings"])


def test_capability_level_exaggeration_routes_to_review_not_zero():
    """983 自动化案：原文"了解 Selenium"被写成"熟悉 Selenium"——语义抬格：
    得分保留但转人工复核（talent_pool + review_required），不自动通过也不归零。"""
    raw = "7.了解Web自动化测试工具Selenium、Pytest及流程。"
    rules = [{"label": "自动化测试能力", "max_score": 5.0, "is_core": True,
              "note": "评估自动化测试脚本与框架经验，重点看 Selenium、Pytest 等工具"}]
    dims = [{"label": "自动化测试能力", "score": 4.0, "max_score": 5.0, "reason": "熟悉自动化",
             "evidence": ["熟悉Web自动化测试工具Selenium、Pytest及流程"], "is_inferred": False}]
    sanitized, meta = sanitize_screening_payload(
        _payload(dims, suggested="screening_passed"), _schema(rules), raw_resume_text=raw
    )
    score = sanitized["score"]
    dim = score["dimensions"][0]
    assert dim["score"] == 4.0, "抬格不归零（原文确有该工具经验）"
    assert dim["evidence"] == []
    assert score["evidence_review_labels"] == ["自动化测试能力"]
    assert score["review_required"] is True
    assert score["suggested_status"] == "talent_pool", "复核终局：不自动通过也不自动拒绝"
    assert any("待人工复核" in w for w in meta["warnings"])


def test_fabricated_token_inside_real_sentence_is_still_zeroed():
    """防伪不降级：往真实句子里塞原文不存在的能力词（ZigBee）→ 仍整维度归零。"""
    raw = "负责 BLE 协议联调与自动化测试工作。"
    rules = [{"label": "IoT协议", "max_score": 5.0, "is_core": True,
              "note": "评估无线协议测试经验，重点看 BLE、ZigBee 等协议"}]
    dims = [{"label": "IoT协议", "score": 5.0, "max_score": 5.0, "reason": "协议全面",
             "evidence": ["负责 BLE 协议联调与 ZigBee 自动化测试工作"], "is_inferred": False}]
    sanitized, meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    dim = sanitized["score"]["dimensions"][0]
    assert dim["score"] == 0.0
    assert dim["evidence"] == []
    assert not sanitized["score"].get("evidence_review_labels")
    assert any("已按 0 分回退" in w for w in meta["warnings"])


def test_fabricated_extra_clause_is_still_zeroed():
    """防伪不降级：真实句子后拼接编造子句（"精通 ZigBee 协议栈"）→ 仍整维度归零。"""
    raw = "负责 BLE 协议联调与自动化测试工作。"
    rules = [{"label": "IoT协议", "max_score": 5.0, "is_core": True,
              "note": "评估无线协议测试经验，重点看 BLE、ZigBee 等协议"}]
    dims = [{"label": "IoT协议", "score": 5.0, "max_score": 5.0, "reason": "协议全面",
             "evidence": ["负责 BLE 协议联调与自动化测试工作，精通 ZigBee 协议栈"], "is_inferred": False}]
    sanitized, _meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    assert sanitized["score"]["dimensions"][0]["score"] == 0.0


def test_structured_short_facts_are_valid_evidence():
    """jg IV：年龄/驾照/学历层次这类短结构化事实豁免短语级长度门（仍须原文逐字存在）。"""
    raw = "年龄：33岁 持有C1驾照 学历：本科"
    rules = [
        {"label": "基本条件", "max_score": 5.0, "is_core": False, "note": "评估年龄与驾照条件，重点看年龄、驾照"},
        {"label": "年龄造假维度", "max_score": 5.0, "is_core": False, "note": "评估年龄，重点看年龄"},
    ]
    dims = [
        {"label": "基本条件", "score": 4.0, "max_score": 5.0, "reason": "条件符合",
         "evidence": ["33岁", "C1驾照"], "is_inferred": False},
        {"label": "年龄造假维度", "score": 5.0, "max_score": 5.0, "reason": "年龄合适",
         "evidence": ["45岁"], "is_inferred": False},
    ]
    sanitized, _meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    by_label = {d["label"]: d for d in sanitized["score"]["dimensions"]}
    assert by_label["基本条件"]["score"] == 4.0
    assert set(by_label["基本条件"]["evidence"]) == {"33岁", "C1驾照"}
    assert by_label["年龄造假维度"]["score"] == 0.0, "原文不存在的短事实仍归零"


def test_age_reference_isolated_from_job_intent_on_same_extracted_line():
    """CAD-01826：表格抽取把年龄与求职意向压成一行时，求职意向不得误杀年龄事实。"""
    raw = "年龄：39岁 现居地：上海 求职意向：采购经理/主管"
    rules = [
        {
            "label": "年龄与健康条件",
            "max_score": 0.5,
            "is_core": False,
            "note": "评估年龄是否在40岁以下及健康条件",
        },
    ]
    dims = [
        {
            "label": "年龄与健康条件",
            "score": 0.5,
            "max_score": 0.5,
            "reason": "年龄符合要求",
            "evidence": ["39岁"],
            "evidence_refs": ["R0001"],
            "is_inferred": False,
        },
    ]

    sanitized, meta = sanitize_screening_payload(
        _payload(dims, total=0.5, match=100),
        _schema(rules, max_possible=0.5),
        raw_resume_text=raw,
    )

    dimension = sanitized["score"]["dimensions"][0]
    assert dimension["score"] == 0.5
    assert dimension["evidence"] == ["年龄：39岁"]
    assert not any("否定性陈述" in warning for warning in meta["warnings"])
    assert not any("年龄与健康条件" in warning and "相关性" in warning for warning in meta["warnings"])


def test_city_reference_isolated_from_job_intent_on_same_extracted_line():
    """CAD-01831：期望城市与求职意向同处一行时，城市事实不得被整行否定。"""
    raw = "左博男 | 年龄：39岁 | 求职意向：采购经理/主管 | 期望城市：南昌"
    rules = [
        {
            "label": "城市覆盖范围",
            "max_score": 0.5,
            "is_core": False,
            "note": "评估候选人的期望城市是否在岗位覆盖城市范围内",
        },
    ]
    dims = [
        {
            "label": "城市覆盖范围",
            "score": 0.2,
            "max_score": 0.5,
            "reason": "岗位覆盖列表包含南昌，匹配度较高；但南昌不在当前城市列表中。",
            "evidence": ["期望城市:南昌"],
            "evidence_refs": ["R0001"],
            "is_inferred": False,
        },
    ]

    sanitized, meta = sanitize_screening_payload(
        _payload(dims, total=0.2, match=40),
        _schema(rules, max_possible=0.5),
        raw_resume_text=raw,
    )

    dimension = sanitized["score"]["dimensions"][0]
    assert dimension["score"] == 0.2
    assert dimension["evidence"] == ["期望城市：南昌"]
    assert dimension["reason"] == "候选人期望城市为南昌；依据当前岗位城市覆盖规则，本维度得 0.2/0.5 分。"
    assert not any("否定性陈述" in warning for warning in meta["warnings"])
    assert not any("城市覆盖范围" in warning and "相关性" in warning for warning in meta["warnings"])

    historical = _normalize_city_dimension_reasons(
        [
            {
                "label": "城市覆盖范围",
                "score": 0.2,
                "max_score": 0.5,
                "reason": "岗位列表包含南昌，但南昌不在当前城市列表中。",
                "evidence": ["期望城市：南昌"],
            }
        ]
    )
    assert historical[0]["reason"] == dimension["reason"], "历史评分读取时也必须消除冲突说明"


def test_relevance_aware_contested_evidence_assignment():
    """jg IV：同一证据被多维度引用时不再"规则顺序先到先得"——相关维度优先持有，
    无关的先序维度转人工复核（不归零、不计入重复证据）。"""
    raw = "持有C1驾驶证并负责设备运输调试工作。"
    rules = [
        {"label": "测试工具使用", "max_score": 5.0, "is_core": False, "note": "评估示波器、万用表等工具使用"},
        {"label": "驾驶资质", "max_score": 5.0, "is_core": False, "note": "评估驾驶证、驾照与设备运输能力"},
    ]
    evidence_text = "持有C1驾驶证并负责设备运输调试工作"
    dims = [
        {"label": "测试工具使用", "score": 3.0, "max_score": 5.0, "reason": "有工具经验",
         "evidence": [evidence_text], "is_inferred": False},
        {"label": "驾驶资质", "score": 4.0, "max_score": 5.0, "reason": "有驾照",
         "evidence": [evidence_text], "is_inferred": False},
    ]
    sanitized, meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    by_label = {d["label"]: d for d in sanitized["score"]["dimensions"]}
    assert by_label["驾驶资质"]["evidence"], "相关维度应持有该证据"
    assert by_label["驾驶资质"]["score"] == 4.0
    assert by_label["测试工具使用"]["score"] == 3.0, "无关先序维度不归零"
    assert by_label["测试工具使用"]["evidence"] == []
    assert "测试工具使用" in (sanitized["score"].get("evidence_review_labels") or [])
    assert any("同一证据不得撑起多个维度" in w for w in meta["warnings"])


def test_evidence_refs_resolve_to_original_paragraphs():
    """段落引用协议：evidence_refs 指向的原文行由后端解回作为权威证据（文本证据可缺省）。"""
    raw = "第一行其他内容\n负责嵌入式固件烧录与整机联调测试\n第三行其他内容"
    rules = [{"label": "嵌入式测试", "max_score": 5.0, "is_core": True,
              "note": "评估嵌入式固件与整机联调测试经验"}]
    dims = [{"label": "嵌入式测试", "score": 4.5, "max_score": 5.0, "reason": "嵌入式经验扎实",
             "evidence": [], "evidence_refs": ["R0002"], "is_inferred": False}]
    sanitized, _meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    dim = sanitized["score"]["dimensions"][0]
    assert dim["score"] == 4.5
    assert dim["evidence"] == ["负责嵌入式固件烧录与整机联调测试"]
    assert "evidence_refs" not in dim, "refs 消费后不进入最终维度字段"


def test_invalid_evidence_refs_are_ignored_with_warning():
    """无效行号引用被忽略并告警；无任何可证实证据时维度仍 fail-closed 归零。"""
    raw = "负责嵌入式固件烧录与整机联调测试"
    rules = [{"label": "嵌入式测试", "max_score": 5.0, "is_core": True,
              "note": "评估嵌入式固件与整机联调测试经验"}]
    dims = [{"label": "嵌入式测试", "score": 4.5, "max_score": 5.0, "reason": "嵌入式经验",
             "evidence": [], "evidence_refs": ["R9999", "X01"], "is_inferred": False}]
    sanitized, meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    dim = sanitized["score"]["dimensions"][0]
    assert dim["score"] == 0.0
    assert any("evidence_refs 含无效引用" in w for w in meta["warnings"])


def test_same_evidence_ref_cannot_support_two_dimensions():
    """段落引用唯一性：同一行号被两个维度引用 → 后者转人工复核（行身份判重）。"""
    raw = "负责嵌入式固件烧录与整机联调测试"
    rules = [
        {"label": "嵌入式测试", "max_score": 5.0, "is_core": True, "note": "评估嵌入式固件测试经验"},
        {"label": "整机联调", "max_score": 5.0, "is_core": False, "note": "评估整机联调经验"},
    ]
    dims = [
        {"label": "嵌入式测试", "score": 4.0, "max_score": 5.0, "reason": "a",
         "evidence": [], "evidence_refs": ["R0001"], "is_inferred": False},
        {"label": "整机联调", "score": 3.0, "max_score": 5.0, "reason": "b",
         "evidence": [], "evidence_refs": ["R0001"], "is_inferred": False},
    ]
    sanitized, _meta = sanitize_screening_payload(_payload(dims), _schema(rules), raw_resume_text=raw)
    by_label = {d["label"]: d for d in sanitized["score"]["dimensions"]}
    assert by_label["嵌入式测试"]["evidence"]
    assert by_label["整机联调"]["evidence"] == []
    assert "整机联调" in (sanitized["score"].get("evidence_review_labels") or [])


def test_review_required_survives_validation_and_storage_chain():
    """P0（jg 复审）：review_required/evidence_review_labels 必须穿过
    fast sanitize → _validate_primary_screening_response 白名单 → 落库 payload 全链——
    此前在白名单被剥掉，导致 evidence_review_required 永远不生效。"""
    raw = "7.了解Web自动化测试工具Selenium、Pytest及流程。"
    rules = [{"label": "自动化测试能力", "max_score": 5.0, "is_core": True,
              "note": "评估自动化测试脚本与框架经验，重点看 Selenium、Pytest 等工具"}]
    dims = [{"label": "自动化测试能力", "score": 4.0, "max_score": 5.0, "reason": "熟悉自动化",
             "evidence": ["熟悉Web自动化测试工具Selenium、Pytest及流程"], "is_inferred": False}]
    sanitized_payload, meta = sanitize_screening_payload_fast(
        _payload(dims), _schema(rules), raw_resume_text=raw
    )
    assert sanitized_payload["score"]["review_required"] is True
    _parsed_resume, validated_score = _validate_primary_screening_response(sanitized_payload)
    assert validated_score.get("review_required") is True, "白名单校验层必须保留复核标记"
    assert validated_score.get("evidence_review_labels") == ["自动化测试能力"]
    storage = _build_raw_screening_storage_payload(
        score_payload=validated_score,
        score_source="primary_screening_model",
        primary_model_call_succeeded=True,
        final_response_source="primary_screening_model",
        validation_warnings=meta["warnings"],
        raw_response_text="x",
        parsed_response_payload=None,
        sanitized_score_payload=validated_score,
    )
    # _save_score_result 从 storage["score"] 读 review_required → evidence_review_required
    assert storage["score"].get("review_required") is True
    assert storage["score"].get("evidence_review_labels") == ["自动化测试能力"]


def test_warning_levels_classified_and_validation_passed_semantics():
    """jg P1：信息性自动校正不再把评分标成"校验未通过"；风险级告警才置 False。"""
    raw = "负责嵌入式固件烧录与整机联调测试，输出测试报告。"
    rules = [{"label": "嵌入式测试", "max_score": 5.0, "is_core": True,
              "note": "评估嵌入式固件与整机联调测试经验"}]
    clean_dims = [{"label": "嵌入式测试", "score": 5.0, "max_score": 5.0, "reason": "扎实",
                   "evidence": ["负责嵌入式固件烧录与整机联调测试"], "is_inferred": False}]
    # 模型 total 算错（5.0 → 4.2）：仅触发信息性自动校正
    sanitized_payload, meta = sanitize_screening_payload_fast(
        _payload(clean_dims, suggested="screening_passed", total=4.2, match=42),
        _schema(rules),
        raw_resume_text=raw,
    )
    storage = _build_raw_screening_storage_payload(
        score_payload=sanitized_payload["score"],
        score_source="primary_screening_model",
        primary_model_call_succeeded=True,
        final_response_source="primary_screening_model",
        validation_warnings=meta["warnings"],
        raw_response_text="x",
        parsed_response_payload=None,
        sanitized_score_payload=sanitized_payload["score"],
    )
    levels = storage["debug"]["validation_warning_levels"]
    assert levels, "应有信息性校正记录"
    assert all(item["level"] == "info" for item in levels), meta["warnings"]
    assert storage["debug"]["score_validation_passed"] is True

    # 对照：证据编造归零属风险级 → validation_passed False
    forged_dims = [{"label": "嵌入式测试", "score": 5.0, "max_score": 5.0, "reason": "扎实",
                    "evidence": ["精通FPGA时序收敛与射频校准"], "is_inferred": False}]
    sanitized_payload2, meta2 = sanitize_screening_payload_fast(
        _payload(forged_dims), _schema(rules), raw_resume_text=raw
    )
    storage2 = _build_raw_screening_storage_payload(
        score_payload=sanitized_payload2["score"],
        score_source="primary_screening_model",
        primary_model_call_succeeded=True,
        final_response_source="primary_screening_model",
        validation_warnings=meta2["warnings"],
        raw_response_text="x",
        parsed_response_payload=None,
        sanitized_score_payload=sanitized_payload2["score"],
    )
    assert storage2["debug"]["score_validation_passed"] is False
    assert any(item["level"] == "risk" for item in storage2["debug"]["validation_warning_levels"])


def test_rejected_candidate_relevance_wording_has_no_review_language():
    """jg P1：自动拒绝的候选人不得挂"需人工复核"字样（不会有人复核）；
    相关性存疑改用"未能自动确认（已计分，未改变状态判定）"措辞。"""
    raw = "使用 Python 编写自动化测试脚本，参与测试平台建设。"
    rules = [
        {"label": "银行核心系统经验", "max_score": 8.0, "is_core": True, "note": "评估银行核心系统项目经验"},
        {"label": "自动化测试", "max_score": 2.0, "is_core": False, "note": "评估自动化脚本经验，重点看 Python 脚本"},
    ]
    dims = [
        {"label": "银行核心系统经验", "score": 0.0, "max_score": 8.0, "reason": "简历未提及",
         "evidence": [], "is_inferred": False},
        # 真实但与银行无关的引用撑小分维度 → 总分仍在拒绝区间
        {"label": "自动化测试", "score": 2.0, "max_score": 2.0, "reason": "自动化扎实",
         "evidence": ["参与测试平台建设"], "is_inferred": False},
    ]
    sanitized, meta = sanitize_screening_payload(
        _payload(dims, suggested="screening_rejected"), _schema(rules), raw_resume_text=raw
    )
    assert sanitized["score"]["suggested_status"] == "screening_rejected"
    relevance_warnings = [w for w in meta["warnings"] if "相关性" in w]
    assert relevance_warnings, "相关性存疑仍应留痕"
    assert all("需人工复核" not in w for w in relevance_warnings)
    assert sanitized["score"].get("review_required") is not True


def test_education_period_is_stripped_not_deleted():
    """jg P1：学历带修学时段不再整串误删（真实案例：哈工程 CS 本科被清成 NULL）。"""
    assert (
        _sanitize_candidate_education_value("哈尔滨工程大学 计算机科学与技术 本科（2023.9-2025.7）")
        == "哈尔滨工程大学 计算机科学与技术 本科"
    )
    assert _sanitize_candidate_education_value("北京大学 本科 2019-2023") == "北京大学 本科"
    assert _sanitize_candidate_education_value("燕京理工学院 本科 软件工程 2019- 2023") == "燕京理工学院 本科 软件工程"
    assert _sanitize_candidate_education_value("本科") == "本科"
    # 真噪声（联系方式/简历套话）仍整串拒绝
    assert _sanitize_candidate_education_value("个人简历 联系电话13800000000") == ""
