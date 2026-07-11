# AI 招聘重构 Design QA

## 检查范围

- 参考原型：`AI Recruitment Redesign Project/工作台 Workspace.dc.html`、`AI Recruitment Redesign Project/岗位管理 Positions.dc.html` 及同目录设计说明。
- 实现地址：`http://localhost:3000/`
- 检查环境：桌面端、1920 × 1080、浅色模式。
- 本轮页面：工作台、岗位管理（列表、详情、新建、编辑及关联弹窗）。
- 左侧菜单右下角折叠/展开图标按用户要求保留并使用新风格，但不作为视觉对比项；除该图标外，其余框架与页面均正常检查。

## 工作台

### 视觉检查

- 已对照原型检查页面结构、蓝色主色、文字层级、卡片、边框、圆角、阴影、间距、按钮、空状态与列表密度。
- 修复空的状态分布区域仍占用高度、导致最新候选人内容被挤出首屏的问题。
- 对照证据：`.design-qa/workspace/00-workspace-source.png`、`.design-qa/workspace/03-workspace-implementation-fixed.png`、`.design-qa/workspace/04-workspace-comparison-fixed.png`。

### 交互检查

- 设置入口、简历上传、搜索与刷新状态可用。
- 简历上传说明和文件选择范围已与后端实际支持格式统一为 PDF、DOCX。
- 空数据、加载中和有数据状态均使用同一套新设计语言。

## 岗位管理

### 页面与状态覆盖

- 岗位列表：统计、搜索、状态筛选、组织筛选、创建人筛选、刷新、新建、上传、设置、行操作及分页/横向信息承载。
- 岗位详情：候选人、岗位信息、JD 工作台、版本与发布四个页签。
- 岗位表单：新建和编辑完整字段、底部操作区、未保存确认。
- 关联弹窗：JD 配置、测评配置、基础/结构化方案、岗位上传、删除确认、发布预演。
- 候选人：列表、展开详情及岗位下候选人入口。

### 视觉检查

- 已对照原型检查页面框架、信息层级、颜色 token、字体、间距、圆角、阴影、表格、表单、标签、按钮、弹窗、选中/悬停、空状态和加载状态。
- 保留系统真实字段、状态、组织结构、权限和业务操作；未复制原型中的业务字段。
- 对照证据：`.design-qa/positions/00-positions-list-source.png`、`.design-qa/positions/21-positions-list-final.png`、`.design-qa/positions/22-positions-list-comparison.png`、`.design-qa/positions/23-position-detail-info-final.png`。

### 业务与交互修复

- 岗位详情上传会绑定当前岗位；列表上传继续使用智能识别模式。
- JD 版本记录不再展示内部系统提示词，只展示用户可理解的版本说明和 JD 内容。
- 发布能力当前后端仅为模拟实现，界面统一为“发布预演”，不再提供会造成误解的 API/RPA 真发布选项，也不展示模拟地址。
- 上传重复处理仅保留后端实际支持的跳过与覆盖。
- 手工编辑 JD 后，切换页签、返回或关闭时均会触发未保存确认，避免草稿静默丢失。
- 列表筛选在进入详情再返回后保持；岗位编号已纳入搜索。
- 测评方案新增入口按真实管理权限显示，避免无权限用户进入必然失败的操作。
- 岗位表单组织名称来自系统真实组织数据，移除硬编码文案。

## 验证结果

- `npm run build`：通过。
- `npm run typecheck`：通过。
- 本轮相关文件 ESLint（errors only）：通过，0 error。
- `git diff --check`：通过。
- 开发服务器重启后重新加载岗位管理，浏览器控制台无新增 error/warning。

final result: passed
