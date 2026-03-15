import React from 'react';

// ============== 认证类型 ==============
export type Role = string;

export interface Permission {
    [scriptId: string]: boolean;
}

export interface User {
    id?: string;
    role: Role;
    roles?: string[];
    permissions: Permission;
    name?: string;
    teamResourcesLoginKeyEnabled?: boolean;
}

export interface ScriptHubPermissionDefinition {
    key: string;
    name: string;
    category: string;
    description: string;
    sort_order: number;
}

export interface ScriptHubRoleDefinition {
    code: string;
    name: string;
    description: string;
    sort_order: number;
    permission_keys: string[];
    is_system: boolean;
    is_active: boolean;
    assigned_user_count: number;
}

export interface ScriptHubManagedUser {
    user_code: string;
    display_name: string;
    primary_role: string;
    role_codes: string[];
    role_permission_keys: string[];
    granted_overrides: string[];
    revoked_overrides: string[];
    effective_permission_keys: string[];
    team_resources_login_key_enabled: boolean;
    is_active: boolean;
    is_super_admin: boolean;
    notes?: string | null;
    last_login_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface ScriptHubAuditLogEntry {
    id: number;
    actor_user_code?: string | null;
    actor_display_name?: string | null;
    action: string;
    target_type: string;
    target_code: string;
    result: string;
    ip_address?: string | null;
    user_agent?: string | null;
    details: Record<string, unknown>;
    created_at?: string | null;
}

export interface ScriptHubRbacOverview {
    catalog: {
        permissions: ScriptHubPermissionDefinition[];
        roles: ScriptHubRoleDefinition[];
    };
    users: ScriptHubManagedUser[];
    audit_logs: ScriptHubAuditLogEntry[];
}

// ============== 视图类型 ==============
export type ViewType = 'home' | 'system' | 'script' | 'ocr-tool' | 'help' | 'dev-tools' | 'team-resources' | 'ai-resources' | 'ops-center' | 'agent-chat' | 'access-control';

// ============== 脚本类型 ==============
export interface Script {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    status: 'active' | 'beta' | 'stable';
}

export interface SystemConfig {
    name: string;
    description: string;
    scripts: Script[];
}

// ============== 天气类型 ==============
export interface WeatherData {
    temp: number;
    desc: string;
    wind: number;
    humidity: number;
    code: string;
}

export interface WeatherState {
    loading: boolean;
    error?: string;
    data?: WeatherData;
}
