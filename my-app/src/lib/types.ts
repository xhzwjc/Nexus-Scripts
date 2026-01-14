import React from 'react';

// ============== 认证类型 ==============
export type Role = 'admin' | 'operator' | 'custom' | 'QA' | 'PM';

export interface Permission {
    [scriptId: string]: boolean;
}

export interface User {
    role: Role;
    permissions: Permission;
    name?: string;
}

// ============== 视图类型 ==============
export type ViewType = 'home' | 'system' | 'script' | 'ocr-tool' | 'help';

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
