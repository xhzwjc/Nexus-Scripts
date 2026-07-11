# 全局框架 Design QA

## 对照范围

- source visual truth path: `AI Recruitment Redesign Project/design_handoff_ai_recruitment/prototypes/工作台 Workspace.dc.html`
- implementation screenshot path: `design-qa-screenshots/global-shell-implementation-1920x1080.png`
- reference screenshot path: `design-qa-screenshots/global-shell-reference-1920x1080.png`
- viewport: `1920 × 1080`
- state: 浅色主题、AI 招聘工作台、左侧导航固定展开、顶部菜单与头像菜单关闭；实现截图额外保留工作台导航的键盘焦点圈，用于验证无障碍状态
- scope: 仅验收系统级顶部栏、左侧导航、产品入口和账号菜单；主内容区仍是现有业务页面，不纳入本页视觉一致性判定

## 对照证据

- full-view comparison evidence: `design-qa-screenshots/global-shell-full-comparison.png`（左：原型；右：实现）
- focused topbar comparison evidence: `design-qa-screenshots/global-shell-topbar-comparison.png`（上：原型；下：实现）
- focused sidebar comparison evidence: `design-qa-screenshots/global-shell-sidebar-comparison.png`（左：原型；右：实现）
- 采用顶部栏和侧栏聚焦对照，因为主内容区不属于本阶段改造范围；两处聚焦图已覆盖本页全部高密度视觉细节。

## 必检项

- 字体与排版：顶部栏、侧栏统一使用 Inter、PingFang SC、Microsoft YaHei 回退链；字号、字重、行高、字距和截断方式与原型一致，无异常换行或拥挤。
- 间距与布局：顶部栏 56px，侧栏展开 268px、收起 72px，导航项 40px，激活圆角 8px，搜索框 280 × 32px；1024 和 1366 宽度无横向溢出。
- 颜色与视觉令牌：主色 `#1E3BFA`、搜索背景 `#F7F8FA`、分隔线 `#F2F3F5`、正文及次级文字色与原型令牌一致；激活、悬停、焦点状态可辨识。
- 图像与资产：产品四色图标直接提取自参考原型并以 16px 原尺寸使用，无占位图、CSS 绘图或自制 SVG 替代；其余标准功能图标使用同一 Lucide 线性图标体系。
- 文案与内容：只采用当前系统的真实菜单、权限、用户信息和业务入口；没有复制原型中的示例账号、未读数或业务数据。
- 交互与可访问性：产品切换、账号菜单、桌面/窄屏全局搜索、日历弹层、侧栏收起/展开均已在浏览器中操作；搜索支持 Tab、方向键与 Escape，按钮具备语义名称和高对比键盘焦点样式。

## Findings

- 最终未发现可执行的 P0、P1 或 P2 问题。
- 可接受差异：右侧使用当前系统已有日历入口而非原型示例邮件未读入口；侧栏保留当前用户真实权限下的“欢迎”“权限中心”等菜单；头像与名称使用当前登录用户数据。这些均属于业务内容约束，不是设计漂移。
- 实现截图中的白色内焦点圈是已验证的键盘焦点状态；参考原型未提供该状态，按可访问性增强接受为 P3 状态差异。
- 开发截图左下角的 Next.js Dev Tools 浮标只存在于开发环境，不属于产品界面。

## Comparison history

1. 首轮对照发现两个 P2：产品入口使用单色线框图标，且首页触发区宽度与产品按钮内边距导致顶部左侧整体偏移。
2. 修复：替换为原型四色产品图标；首页触发区改为 20px 宽；产品按钮移除额外水平内边距。
3. 功能回归审查发现：常见桌面宽度隐藏健康入口、窄屏无搜索替代、搜索结果无法可靠键盘进入、HS 被误标为 CM、设置类独立角色会落到无权限招聘页、招聘分组收起后父级无激活态、活动项焦点圈不可见。
4. 修复：健康入口在常见宽度保持可见；1024 使用搜索图标弹层；补齐搜索焦点管理和键盘模型；按 `selectedSystem` 显示 HS；顶部进入招聘时解析首个有权限页面；恢复招聘父级激活态；焦点圈改为高对比样式；日历改用 Radix Popover。
5. 最终复检：`global-shell-topbar-comparison.png`、`global-shell-sidebar-comparison.png`、1024/1366 浏览器截图及无缓存控制台均未发现新的 P0/P1/P2 问题。

## 浏览器验证

- primary interactions tested: 产品菜单打开/关闭、头像菜单打开/关闭、桌面搜索输入/清空、1024 搜索弹层输入/方向键选择/Escape、日历打开/Escape、侧栏 268px → 72px → 268px、HS 产品名识别、权限中心与 AI 招聘工作台双向导航。
- responsive checks: `1024 × 768` 与 `1366 × 768` 均无页面横向溢出；1024 显示紧凑搜索入口，1366 显示 280px 搜索框。
- console errors checked: 新开无缓存页面后错误日志为 `[]`。
- code checks: `npm run typecheck`、变更组件定向 `eslint`、`git diff --check`。

final result: passed
