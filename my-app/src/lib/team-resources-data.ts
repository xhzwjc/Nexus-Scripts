// 团队资源数据类型和配置
// Team Resources Data Types and Configuration

export type Environment = 'dev' | 'test' | 'prod';

// 凭证信息
export interface Credential {
    id: string;
    label: string;      // "管理员"、"普通用户"
    username: string;
    password?: string;  // 可为空
    note?: string;
}

// 系统环境配置
export interface SystemEnvironment {
    url: string;
    adminUrl?: string;
    creds: Credential[];
    skipHealthCheck?: boolean;  // 忽略检测 - 完全跳过此 URL
    skipCertCheck?: boolean;    // 忽略证书检测 - 只检查可访问性
}

// 系统资源
export interface SystemResource {
    id: string;
    name: string;
    description?: string;
    environments: {
        dev?: SystemEnvironment;
        test?: SystemEnvironment;
        prod?: SystemEnvironment;
    };
}

// 资源分组（集团）
export interface ResourceGroup {
    id: string;
    name: string;
    logo?: string;  // Base64 编码的图片或图片 URL（可选）
    systems: SystemResource[];
}

// 固定访问密钥
export const ACCESS_KEYS = [
    "U5*mO~yW6%LxJ3dQ0nHaD8~L0bV&cXoM9uA2j",
    "wjc",
    "pE7#tV4^Rk!2zF1&B@8cU5*mO~yW6%LxJ3dQ0nHa",
    "K3^%w4qPz@!5RZ#hT7*eF1nD8~L0bV&cXoM9uA2j"
];

// AES 加密密钥（前端解密用，实际生产环境应更安全处理）
export const ENCRYPTION_KEY = "ScriptHub@TeamResources#2024!Secure";

// 初始化为空数组，用户通过界面添加真实数据
export const INITIAL_RESOURCE_DATA: ResourceGroup[] = [];
