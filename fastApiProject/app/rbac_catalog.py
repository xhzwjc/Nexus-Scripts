from dataclasses import dataclass
from typing import Dict, List, Tuple


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


PERMISSION_DEFINITIONS: Tuple[PermissionDefinition, ...] = (
    PermissionDefinition("settlement", "结算处理", "business", "可执行企业结算处理脚本", 10),
    PermissionDefinition("commission", "佣金计算", "business", "可执行渠道佣金计算与校验", 20),
    PermissionDefinition("balance", "余额核对", "business", "可执行企业账户余额核对", 30),
    PermissionDefinition("task-automation", "任务自动化", "business", "可执行任务自动化工具", 40),
    PermissionDefinition("sms_operations_center", "短信运营中心", "business", "可使用短信运营中心", 50),
    PermissionDefinition("sms-admin-login", "短信管理后台登录", "business", "可执行短信管理后台免密登录能力", 60),
    PermissionDefinition("tax-reporting", "税务报表", "business", "可生成税务报表", 70),
    PermissionDefinition("tax-calculation", "税额计算", "business", "可执行税额计算工具", 80),
    PermissionDefinition("payment-stats", "结算与开票统计", "business", "可查看结算与开票统计", 90),
    PermissionDefinition("delivery-tool", "交付物提交", "business", "可执行交付物提交工具", 100),
    PermissionDefinition("ocr-tool", "OCR 工具", "business", "可使用 OCR 工具", 110),
    PermissionDefinition("team-resources", "团队资源查看", "resources", "可查看团队资源", 120),
    PermissionDefinition("team-resources-manage", "团队资源管理", "resources", "可编辑团队资源", 130),
    PermissionDefinition("ai-resources", "AI 资源查看", "resources", "可查看 AI 资源库", 140),
    PermissionDefinition("ai-resources-manage", "AI 资源管理", "resources", "可编辑 AI 资源库", 150),
    PermissionDefinition("cert-health", "系统健康检测", "platform", "可查看系统健康与证书状态", 160),
    PermissionDefinition("server-monitoring", "运维中心", "platform", "可访问服务器监控与指标", 170),
    PermissionDefinition("dev-tools", "开发工具", "platform", "可访问开发工具页面", 180),
    PermissionDefinition("rbac-manage", "权限管理中心", "platform", "可管理用户、角色与权限", 190),
    PermissionDefinition("agent-chat", "Agent 助手", "collaboration", "可使用 Agent Chat", 200),
)


ALL_PERMISSION_KEYS: Tuple[str, ...] = tuple(permission.key for permission in PERMISSION_DEFINITIONS)
PERMISSION_INDEX: Dict[str, PermissionDefinition] = {permission.key: permission for permission in PERMISSION_DEFINITIONS}


ROLE_DEFINITIONS: Tuple[RoleDefinition, ...] = (
    RoleDefinition(
        "admin",
        "系统超管",
        "拥有所有权限的系统管理员，可管理平台、资源和全部业务工具",
        10,
        ALL_PERMISSION_KEYS,
    ),
    RoleDefinition(
        "operations-manager",
        "业务管理员",
        "负责核心业务流程执行与协同，不包含平台级危险操作",
        20,
        (
            "settlement",
            "commission",
            "balance",
            "task-automation",
            "sms_operations_center",
            "tax-reporting",
            "tax-calculation",
            "payment-stats",
            "delivery-tool",
            "ocr-tool",
            "team-resources",
            "ai-resources",
            "agent-chat",
        ),
    ),
    RoleDefinition(
        "operator",
        "运营专员",
        "负责日常运营、交付和查询类工作，不能修改资源配置与平台设置",
        30,
        (
            "tax-reporting",
            "tax-calculation",
            "payment-stats",
            "delivery-tool",
            "ocr-tool",
            "team-resources",
            "ai-resources",
            "agent-chat",
        ),
    ),
    RoleDefinition(
        "finance-analyst",
        "财务分析",
        "负责财务校验、分析与报表工具，不直接执行高风险业务操作",
        40,
        (
            "commission",
            "balance",
            "tax-reporting",
            "tax-calculation",
            "payment-stats",
            "team-resources",
            "ai-resources",
        ),
    ),
    RoleDefinition(
        "resource-manager",
        "资源管理员",
        "负责维护团队资源、AI 资源及相关健康检测配置",
        50,
        (
            "team-resources",
            "team-resources-manage",
            "ai-resources",
            "ai-resources-manage",
            "cert-health",
            "agent-chat",
            "ocr-tool",
        ),
    ),
    RoleDefinition(
        "platform-engineer",
        "平台运维",
        "负责运维中心、系统健康、排障和平台工具",
        60,
        (
            "server-monitoring",
            "cert-health",
            "dev-tools",
            "team-resources",
            "ai-resources",
            "agent-chat",
            "ocr-tool",
        ),
    ),
    RoleDefinition(
        "product-manager",
        "产品经理",
        "负责跨模块跟进与业务观察，可查看平台状态但不直接管理资源",
        70,
        (
            "settlement",
            "commission",
            "balance",
            "task-automation",
            "tax-reporting",
            "tax-calculation",
            "payment-stats",
            "delivery-tool",
            "ocr-tool",
            "cert-health",
            "server-monitoring",
            "team-resources",
            "ai-resources",
            "agent-chat",
        ),
    ),
    RoleDefinition(
        "qa-engineer",
        "测试与质保",
        "负责回归验证、平台排障与资源维护，接近管理员但不直接拥有超管身份",
        80,
        (
            "settlement",
            "commission",
            "balance",
            "task-automation",
            "sms_operations_center",
            "sms-admin-login",
            "tax-reporting",
            "tax-calculation",
            "payment-stats",
            "delivery-tool",
            "ocr-tool",
            "dev-tools",
            "cert-health",
            "server-monitoring",
            "team-resources",
            "team-resources-manage",
            "ai-resources",
            "ai-resources-manage",
            "agent-chat",
        ),
    ),
    RoleDefinition(
        "auditor",
        "审计/只读",
        "用于只读检查与巡视，避免执行写操作",
        90,
        (
            "payment-stats",
            "team-resources",
            "ai-resources",
            "cert-health",
            "server-monitoring",
        ),
    ),
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
