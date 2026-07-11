# AI 招聘系统业务闭环分析报告

> 生成时间:2026-07-08
> 范围:`my-app/src/components/Recruitment`(前端)+ `fastApiProject/app`(后端 recruitment 相关)
> 性质:仅分析与建议,未实施任何业务闭环改动,等待评审确认。

---

## 一、当前架构概览

- **前端**:Next.js 15 + React 19,单容器组件 `RecruitmentAutomationContainer.tsx`(15,595 行,255 个 useState)承载全部页面状态,页面组件按 `pages/` 拆分(工作台 / 招聘需求 / 候选人 / 评审工作台 / 面试 / 人才库 / 审计 / 助手 / 三个设置页)。
- **后端**:FastAPI,`routers/recruitment.py`(约 130 个端点)→ `services/recruitment_service_impl.py`(21,347 行)单服务类,SQLAlchemy 模型,任务事件 SSE 总线 + worker pool 并发执行 AI 任务。
- **权限**:每个端点均有细粒度 RBAC 权限(dashboard-view / candidate-manage / review-act / interview-act 等),含组织范围(org_code)隔离。
- **AI 网关**:多供应商(Gemini/OpenAI/Claude/DeepSeek/Kimi/GLM/MiniMax)按任务类型路由,带并发限流、兜底(fallback)、审计日志。

## 二、已完整闭环的业务流程

| # | 流程 | 闭环路径 | 结论 |
|---|------|---------|------|
| 1 | 简历导入与识别 | 批量上传 → staging → 解析 → AI 岗位匹配 → 命中岗位 / 落入人才库(可重识别、可批量分配) | ✅ 闭环 |
| 2 | AI 简历初筛 | 单个/批量入队 → worker 并发执行 → SSE 实时推进度 → 评分落库 → 自动/手动状态流转;支持取消、失败自动重试、结果复用、兜底 | ✅ 闭环 |
| 3 | 用人部门评审 | HR 创建评审批次分配 reviewer → 评审工作台(仅看到授权片段)→ 通过/驳回/暂缓 → 候选人状态自动流转 + 留痕 | ✅ 闭环 |
| 4 | 面试执行 | 面试官维护可用时段 → HR 创建面试安排(占用时段)→ 面试工作台提交结果(passed / next_round / hold / rejected / no_show)→ 候选人状态自动流转 + 面试结果留痕 + 时段释放 | ✅ 闭环 |
| 5 | JD 生成与版本 | 结构化表单 → 流式生成 → 版本保存 / 切换生效版本 | ✅ 闭环 |
| 6 | 简历内部推送 | 发件箱(SMTP)/ 收件人管理 → 单发 / 批量 / 按状态自动推送(去重模式、抄送、全局与岗位级配置)→ 发送记录 | ✅ 闭环(仅内部方向) |
| 7 | AI 审计 | 全部 AI 任务留痕(模型、耗时、输入输出、失败原因)→ 可排查、可停止 | ✅ 闭环 |
| 8 | 状态留痕 | 每次状态流转写入 status_history(actor、来源、原因) | ✅ 闭环 |

## 三、断点与缺失(按严重度排序)

### 1. 职位发布是 Mock(渠道闭环未打通)⚠️ 最大断点
`recruitment_publish_adapters.py` 中 Boss直聘 / 智联适配器均继承 `MockPublishAdapter`,发布 URL 为 `mock.example.com`。意味着:
- "自动发布"开关和发布任务在业务上是空转的;
- 候选人来源只有手动上传,渠道回流(平台投递自动进简历池)完全缺失,来源分布统计只会有 manual_upload。

### 2. Offer 双状态机脱钩
`RecruitmentOffer.status`(draft/sent/accepted/rejected/cancelled)与候选人状态(pending_offer/offer_sent/hired)互不联动(`create_offer`/`update_offer` 不触发 `_apply_candidate_status_transition`)。HR 必须手工双重维护,极易出现"Offer 已接受但候选人还停在待 Offer"的脏数据。且 Offer 无法真正发送给候选人(见第 3 条),没有 Offer letter 模板、有效期与到期提醒。

### 3. 候选人侧沟通完全缺失
邮件系统只有"把简历推给内部用人部门"一个方向。面试邀约不通知候选人、无拒信/感谢信、无 Offer 发送。对候选人而言整个系统是"哑"的——这是企业级 ATS 的标配能力缺口。

### 4. hired 之后无承接
无入职办理清单、试用期/转正跟踪,也没有向员工/花名册系统的导出或标记。"已入职"是流程的终点墙。

### 5. 占位模块
- 候选人详情"考试"tab 是显式 disabled 占位;
- "背调"tab 实际渲染的是跟进记录(follow-ups),并非真实背调流程;
- `workflowStages.ts` 中 `RECRUITMENT_EXPANSION_MODULES`(招聘需求审批 / 面试日历 / Offer 管理 / 报表,phase2/phase3)已定义但无任何引用。

### 6. 状态机无转移图校验
`_apply_candidate_status_transition` 只校验状态值在枚举内,不校验 from→to 是否合法。手工批量改状态可产生"已入职→待初筛"这类倒流脏数据,且不需要任何 override 理由。

### 7. 统计口径不一致
后端 `rejected_count` = screening_failed + screening_rejected + interview_first_rejected + interview_second_rejected:
- 不含 department_review_rejected 与旧值 interview_rejected(面试提交淘汰时写入的正是 interview_rejected);
- screening_failed 同时被计入"待初筛"桶 → 同一候选人同时出现在"待处理"和"已淘汰"两个数字里。
(前端工作台"已淘汰"入口原来用的 `["rejected","eliminated"]` 根本不是合法状态值,点击永远空列表——本次已按后端口径修复;口径本身建议后端统一后前后端同步。)

### 8. 其他
- 面试无整体日历视图、无时段冲突提示、无开始前提醒;
- 报表中心未建:无时间趋势、阶段转化率、渠道 ROI、招聘周期(TTF)、面试官负载;
- 招聘需求无审批环节(编制/预算审批),职位创建即生效。

## 四、补全闭环的建议方案(待评审,未实施)

| 优先级 | 方案 | 说明 | 成本 |
|-------|------|------|------|
| P0 | Offer ↔ 候选人状态联动 | offer status→sent 时提示/自动流转 offer_sent;accepted→引导流转 hired;复用现有 `_apply_candidate_status_transition`,一处改动 | 低 |
| P0 | 状态机转移白名单 | 定义合法转移图,非法转移要求显式 override 原因(仍允许,但强制留痕),不破坏现有任何流程 | 低 |
| P0 | 统一"淘汰"口径 | 后端补 department_review_rejected / interview_rejected,决定 screening_failed 归属(建议归"待处理"),前后端同步 | 低 |
| P1 | 候选人侧邮件通道 | 复用现有 mailer + 模板体系,新增三类模板:面试邀约(创建面试安排时可选发送)、拒信(淘汰时可选发送)、Offer letter(offer→sent 时发送);全部"可选+预览"以免误发 | 中 |
| P1 | Offer 管理页(phase2 已规划) | 到期提醒、接受率统计,把候选人详情里的 Offer 面板升级为独立管理视图 | 中 |
| P2 | 简历邮箱自动收件 | 比平台 API 对接更现实:监听招聘邮箱,自动拉取附件简历进现有解析管道(解析/匹配/初筛全部可复用),即可打通"渠道→简历池"回流 | 中 |
| P2 | 真实发布适配器 | Boss/智联无公开 API,通常走 RPA 或人工回填;建议先做"发布状态人工回填 + 发布链接登记",把 Mock 变成可信数据 | 中-高 |
| P2 | 入职交接 | hired 时生成入职清单(材料/日期/负责人),支持导出;后续再考虑与员工系统打通 | 中 |
| P3 | 报表中心(phase3 已规划) | 转化漏斗趋势、TTF、渠道质量、面试官负载;数据都已在库,纯读端 | 中 |
| P3 | 面试日历视图 + 冲突检测 + 提醒 | availability 数据已具备,补日历 UI 和提醒任务 | 中 |
| P3 | 考试/测评集成 | 占位 tab 落地:笔试题库或第三方测评回调 | 高 |

## 五、工程债(未动,建议专门迭代)

1. `RecruitmentAutomationContainer.tsx` 15,595 行 / 255 个 useState 的神组件:建议按页面域拆 context/reducer,分阶段迁移(每次只迁一个页面的状态,typecheck + 回归验证)。
2. `CandidatesPage.tsx` 7,471 行:候选人详情抽屉(约 4,000 行)可拆为独立文件簇。
3. `recruitment_service_impl.py` 21,347 行单类:按领域拆分(candidate / screening / interview / review / mail / publish / skill),`recruitment_service.py` 已是 re-export 门面,拆分对调用方零影响。
4. `data/zwlx.json`(265KB Boss 职类目录)被静态 import 打进首屏 bundle:建议 dynamic import 或移至 public 按需 fetch。
5. `RECRUITMENT_EXPANSION_MODULES` 无引用:建议移入文档或在导航中真正使用。
