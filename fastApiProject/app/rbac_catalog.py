from dataclasses import dataclass
from typing import Dict, Tuple


@dataclass(frozen=True)
class PermissionDefinition:
    key: str
    name: str
    category: str
    description: str
    sort_order: int


@dataclass(frozen=True)
class RoleDefinition:
    code: str
    name: str
    description: str
    sort_order: int
    permissions: Tuple[str, ...]
    landing_page: str = "home"  # "home" | "welcome"
    recruitment_menu_grouped: bool = True


PERMISSION_DEFINITIONS: Tuple[PermissionDefinition, ...] = (
    PermissionDefinition("settlement", "结算处理", "finance", "可执行企业结算处理脚本", 10),
    PermissionDefinition("commission", "佣金计算", "finance", "可执行渠道佣金计算与校验", 20),
    PermissionDefinition("balance", "余额核对", "finance", "可执行企业账户余额核对", 30),
    PermissionDefinition("settlement-sim", "结算状态模拟", "finance", "可执行结算状态模拟工具", 40),
    PermissionDefinition("tax-reporting", "税务报表", "tax", "可生成税务报表", 50),
    PermissionDefinition("tax-calculation", "税额计算", "tax", "可执行税额计算工具", 60),
    PermissionDefinition("payment-stats", "结算与开票统计", "tax", "可查看结算与开票统计", 70),
    PermissionDefinition("task-automation", "任务自动化", "ops", "可执行任务自动化工具", 80),
    PermissionDefinition("delivery-tool", "交付物提交", "ops", "可执行交付物提交工具", 90),
    PermissionDefinition("ocr-tool", "OCR 工具", "ops", "可使用 OCR 工具", 100),
    PermissionDefinition("sms_operations_center", "短信运营中心", "sms", "可使用短信运营中心", 110),
    PermissionDefinition("sms-admin-login", "短信管理后台登录", "sms", "可执行短信管理后台免密登录能力", 120),
    PermissionDefinition("team-resources", "团队资源查看", "resources", "可查看团队资源", 120),
    PermissionDefinition("team-resources-manage", "团队资源管理", "resources", "可编辑团队资源", 130),
    PermissionDefinition("ai-resources", "AI 资源查看", "resources", "可查看 AI 资源库", 140),
    PermissionDefinition("ai-resources-manage", "AI 资源管理", "resources", "可编辑 AI 资源库", 150),
    PermissionDefinition("cert-health", "系统健康检测", "platform", "可查看系统健康与证书状态", 160),
    PermissionDefinition("server-monitoring", "运维中心", "platform", "可访问服务器监控与指标", 170),
    PermissionDefinition("dev-tools", "开发工具", "platform", "可访问开发工具页面", 180),
    PermissionDefinition("rbac-manage", "权限管理中心", "platform", "可管理用户、角色与权限", 190),
    PermissionDefinition("resource-sharing-manage", "资源共享治理", "platform", "可管理跨组织资源共享策略", 195),
    PermissionDefinition("audit-log-view", "审计日志查看", "platform", "可按数据范围查看审计日志", 196),
    PermissionDefinition("audit-log-sensitive-view", "敏感审计查看", "platform", "可查看敏感配置变更审计详情", 197),
    PermissionDefinition("agent-chat", "Agent 助手", "collaboration", "可使用 Agent Chat", 200),
    PermissionDefinition("recruitment-dashboard-view", "招聘看板查看", "recruitment", "可查看招聘看板和统计", 210),
    PermissionDefinition("recruitment-position-manage", "岗位管理", "recruitment", "可创建、编辑、删除招聘岗位", 211),
    PermissionDefinition("recruitment-candidate-manage", "候选人管理", "recruitment", "可上传、编辑、推进候选人", 212),
    PermissionDefinition("recruitment-process-execute", "招聘流程执行", "recruitment", "可执行 JD 生成、初筛、面试题和发布任务", 213),
    PermissionDefinition("recruitment-talent-pool-view", "人才库查看", "recruitment", "可查看 AI 招聘人才库", 213),
    PermissionDefinition("recruitment-assistant-view", "招聘助手使用", "recruitment", "可使用 AI 招聘助手", 213),
    PermissionDefinition("recruitment-log-view", "招聘日志查看", "recruitment", "可查看招聘 AI 任务和流程日志", 214),
    PermissionDefinition("recruitment-review-view", "部门评审查看", "recruitment", "可查看部门评审任务和结果", 215),
    PermissionDefinition("recruitment-review-act", "部门评审处理", "recruitment", "可处理分配给自己的部门评审任务", 216),
    PermissionDefinition("recruitment-review-manage", "部门评审发起", "recruitment", "可向用人部门发起候选人评审", 217),
    PermissionDefinition("recruitment-interview-view", "面试协同查看", "recruitment", "可查看自己的面试任务和可面试时间", 218),
    PermissionDefinition("recruitment-interview-act", "面试执行处理", "recruitment", "可维护自己的可面试时间并提交面试反馈", 219),
    PermissionDefinition("recruitment-interview-manage", "面试安排管理", "recruitment", "可根据面试官时间安排、调整和取消面试", 220),
    PermissionDefinition("recruitment-skill-view", "Skill 查看", "recruitment-config", "可查看招聘 Skill 配置", 221),
    PermissionDefinition("recruitment-skill-bind", "Skill 绑定", "recruitment-config", "可将 Skill 绑定到岗位或任务", 222),
    PermissionDefinition("recruitment-skill-manage", "Skill 管理", "recruitment-config", "可创建、编辑、删除招聘 Skill", 223),
    PermissionDefinition("recruitment-mail-view", "邮件中心查看", "recruitment-config", "可查看邮件中心配置和发送记录", 230),
    PermissionDefinition("recruitment-mail-send", "邮件发送", "recruitment-config", "可发送候选人邮件", 231),
    PermissionDefinition("recruitment-mail-config-manage", "邮件配置管理", "recruitment-config", "可管理收件人、模板和自动推送规则", 232),
    PermissionDefinition("recruitment-mail-sender-manage", "发件箱管理", "recruitment-config", "可管理 SMTP 发件箱配置", 233),
    PermissionDefinition("recruitment-llm-config-view", "模型配置查看", "recruitment-config", "可查看招聘模型配置", 240),
    PermissionDefinition("recruitment-llm-config-manage", "模型配置管理", "recruitment-config", "可创建、编辑、删除招聘模型配置", 241),
    PermissionDefinition("biz-scene", "业务场景管理", "biz", "可初始化业务场景数据", 260),
    PermissionDefinition("biz-task", "任务管理", "biz", "可初始化任务数据", 270),
)


ALL_PERMISSION_KEYS: Tuple[str, ...] = tuple(permission.key for permission in PERMISSION_DEFINITIONS)
PERMISSION_INDEX: Dict[str, PermissionDefinition] = {permission.key: permission for permission in PERMISSION_DEFINITIONS}

# Deprecated permission keys that have been removed from the catalog.
# These are no longer assignable to roles, but may still exist in legacy database records.
# The permission expansion layer (expand_permission_aliases) handles backward compatibility
# by automatically deriving these from fine-grained permissions.
DEPRECATED_PERMISSION_KEYS: Tuple[str, ...] = ("ai-recruitment", "ai-recruitment-manage")


ROLE_DEFINITIONS: Tuple[RoleDefinition, ...] = (
    RoleDefinition("admin", "系统超管", "拥有所有权限的系统管理员，可管理平台、资源和全部业务工具", 10, ALL_PERMISSION_KEYS, "home"),
    RoleDefinition("operations-manager", "业务管理员", "负责核心业务流程执行与协同，不包含平台级危险操作", 20, ("settlement", "commission", "balance", "task-automation", "sms_operations_center", "tax-reporting", "tax-calculation", "settlement-sim", "payment-stats", "delivery-tool", "ocr-tool", "team-resources", "ai-resources", "agent-chat", "recruitment-dashboard-view", "recruitment-position-manage", "recruitment-candidate-manage", "recruitment-process-execute", "recruitment-talent-pool-view", "recruitment-assistant-view", "recruitment-log-view", "recruitment-review-view", "recruitment-review-act", "recruitment-review-manage", "recruitment-interview-view", "recruitment-interview-act", "recruitment-interview-manage", "recruitment-skill-view", "recruitment-skill-bind", "recruitment-mail-view", "recruitment-mail-send", "biz-scene", "biz-task"), "home"),
    RoleDefinition("operator", "运营专员", "负责日常运营、交付和查询类工作，不修改资源配置与平台设置", 30, ("tax-reporting", "tax-calculation", "payment-stats", "delivery-tool", "ocr-tool", "team-resources", "ai-resources", "agent-chat", "recruitment-dashboard-view", "recruitment-candidate-manage", "recruitment-process-execute", "recruitment-talent-pool-view", "recruitment-assistant-view", "recruitment-review-view", "recruitment-review-act", "recruitment-review-manage", "recruitment-interview-view", "recruitment-interview-act", "recruitment-interview-manage", "recruitment-skill-view", "recruitment-skill-bind", "recruitment-mail-view", "recruitment-mail-send"), "home"),
    RoleDefinition("recruitment-reviewer", "用人部门评审", "处理候选人部门评审、面试协同和评审意见回写", 35, ("recruitment-review-view", "recruitment-review-act", "recruitment-interview-view", "recruitment-interview-act"), "home", False),
    RoleDefinition("recruitment-interviewer", "面试官", "维护自己的可面试时间并处理分配给自己的面试任务", 36, ("recruitment-interview-view", "recruitment-interview-act"), "home", False),
    RoleDefinition("finance-analyst", "财务分析", "负责财务核验、分析与报表工具，不直接执行高风险业务操作", 40, ("commission", "balance", "tax-reporting", "tax-calculation", "payment-stats", "team-resources", "ai-resources"), "home"),
    RoleDefinition("resource-manager", "资源管理员", "负责维护团队资源、AI 资源及相关健康检测配置", 50, ("team-resources", "team-resources-manage", "ai-resources", "ai-resources-manage", "cert-health", "agent-chat", "ocr-tool", "resource-sharing-manage"), "home"),
    RoleDefinition("platform-engineer", "平台运维", "负责运维中心、系统健康、排障和平台工具", 60, ("server-monitoring", "cert-health", "dev-tools", "team-resources", "ai-resources", "agent-chat", "ocr-tool"), "home"),
    RoleDefinition("product-manager", "产品经理", "负责跨模块跟进与业务观察，可查看平台状态但不直接管理资源", 70, ("settlement", "commission", "balance", "task-automation", "tax-reporting", "tax-calculation", "settlement-sim", "payment-stats", "delivery-tool", "ocr-tool", "cert-health", "server-monitoring", "team-resources", "ai-resources", "agent-chat", "recruitment-dashboard-view", "recruitment-assistant-view", "recruitment-log-view", "recruitment-review-view", "recruitment-skill-view", "recruitment-mail-view"), "home"),
    RoleDefinition("qa-engineer", "测试与质保", "负责回归验证、平台排障与资源维护，接近管理员但不直接拥有超管身份", 80, ("settlement", "commission", "balance", "task-automation", "sms_operations_center", "sms-admin-login", "tax-reporting", "tax-calculation", "settlement-sim", "payment-stats", "delivery-tool", "ocr-tool", "dev-tools", "cert-health", "server-monitoring", "team-resources", "team-resources-manage", "ai-resources", "ai-resources-manage", "agent-chat", "recruitment-dashboard-view", "recruitment-position-manage", "recruitment-candidate-manage", "recruitment-process-execute", "recruitment-talent-pool-view", "recruitment-assistant-view", "recruitment-log-view", "recruitment-review-view", "recruitment-review-act", "recruitment-review-manage", "recruitment-interview-view", "recruitment-interview-act", "recruitment-interview-manage", "recruitment-skill-view", "recruitment-skill-bind", "recruitment-skill-manage", "recruitment-mail-view", "recruitment-mail-send", "recruitment-mail-config-manage", "recruitment-mail-sender-manage", "recruitment-llm-config-view", "recruitment-llm-config-manage", "resource-sharing-manage", "audit-log-view"), "home"),
    RoleDefinition("auditor", "审计/只读", "用于只读检查与巡视，避免执行写操作", 90, ("payment-stats", "team-resources", "ai-resources", "cert-health", "server-monitoring", "audit-log-view", "recruitment-dashboard-view", "recruitment-assistant-view", "recruitment-log-view", "recruitment-review-view"), "home"),
)


ROLE_INDEX: Dict[str, RoleDefinition] = {role.code: role for role in ROLE_DEFINITIONS}

LEGACY_ROLE_MAPPING: Dict[str, str] = {
    "admin": "admin",
    "operator": "operator",
    "QA": "qa-engineer",
    "PM": "product-manager",
    "custom": "operator",
}



def normalize_role_code(role_code: str) -> str:
    normalized = (role_code or "").strip()
    if normalized in ROLE_INDEX:
        return normalized
    return LEGACY_ROLE_MAPPING.get(normalized, "operator")
