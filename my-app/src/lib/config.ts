import React from 'react';
import {
    Settings,
    Calculator,
    Database,
    Users,
    Send,
    FileText,
    Percent,
    BarChart3
} from 'lucide-react';
import type { User, Script, SystemConfig } from './types';

// ============== 认证配置 ==============
export const keyUserMap: Record<string, User> = {
    // 超管密钥 - 拥有所有权限
    'K3^%w4qPz@!5RZ#hT7*eF1nD8~L0bV&cXoM9uA2j': {
        role: 'admin',
        permissions: {
            'settlement': true,
            'commission': true,
            'balance': true,
            'task-automation': true,
            'sms_operations_center': true,
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true,
            'dev-tools': true,
            'cert-health': true
        },
        name: '系统管理员'
    },
    // 运营人员密钥 - 仅税务报表权限
    'pE7#tV4^Rk!2zF1&B@8cU5*mO~yW6%LxJ3dQ0nHa': {
        role: 'operator',
        permissions: {
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true
        },
        name: '运营人员'
    },
    // 自定义角色
    'wjc': {
        role: 'QA',
        permissions: {
            'settlement': true,
            'commission': true,
            'balance': true,
            'task-automation': true,
            'sms_operations_center': true,
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true,
            'dev-tools': true,
            'cert-health': true
        },
        name: 'JC'
    },
    // 经理
    'U5*mO~yW6%LxJ3dQ0nHaD8~L0bV&cXoM9uA2j': {
        role: 'PM',
        permissions: {
            'settlement': true,
            'commission': true,
            'balance': true,
            'task-automation': true,
            'sms_operations_center': true,
            'tax-reporting': true,
            'tax-calculation': true,
            'payment-stats': true,
            'delivery-tool': true,
            'cert-health': true
        },
        name: '**'
    },
};

// ============== 脚本配置 ==============
export const allScripts: Record<string, SystemConfig> = {
    chunmiao: {
        name: 'CM系统',
        description: '一个用于管理企业和渠道业务流程的综合系统',
        scripts: [
            {
                id: 'settlement',
                name: '结算处理脚本',
                description: '批量处理企业结算任务，支持并发执行',
                icon: React.createElement(Settings, { className: "w-5 h-5" }),
                status: 'stable' as const
            },
            {
                id: 'commission',
                name: '渠道佣金计算与验证',
                description: '计算渠道佣金并进行数据校验',
                icon: React.createElement(Calculator, { className: "w-5 h-5" }),
                status: 'stable' as const
            },
            {
                id: 'balance',
                name: '企业账户余额核对',
                description: '核对企业账户余额的准确性',
                icon: React.createElement(Database, { className: "w-5 h-5" }),
                status: 'active' as const
            },
            {
                id: 'task-automation',
                name: '任务自动化管理工具',
                description: '批量执行用户任务流程操作',
                icon: React.createElement(Users, { className: "w-5 h-5" }),
                status: 'beta' as const
            },
            {
                id: 'sms_operations_center',
                name: '短信运营中心',
                description: '模板管理与批量发送、补发综合工具',
                icon: React.createElement(Send, { className: "w-5 h-5" }),
                status: 'beta' as const
            },
            {
                id: 'tax-reporting',
                name: '税务报表生成',
                description: '按企业和月份生成完税数据报表并导出',
                icon: React.createElement(FileText, { className: "w-5 h-5" }),
                status: 'beta' as const
            },
            {
                id: 'tax-calculation',
                name: '税额计算工具',
                description: '计算个人所得税明细，支持模拟数据与跨年计算',
                icon: React.createElement(Percent, { className: "w-5 h-5" }),
                status: 'stable' as const
            },
            {
                id: 'payment-stats',
                name: '结算与开票统计',
                description: '统计已开票/未开票金额及平台总结算',
                icon: React.createElement(BarChart3, { className: "w-5 h-5" }),
                status: 'beta' as const
            },
            {
                id: 'delivery-tool',
                name: '交付物提交工具',
                description: '协助运营人员为指定用户快速提交任务交付物',
                icon: React.createElement(FileText, { className: "w-5 h-5" }),
                status: 'beta' as const
            }
        ]
    },
    haoshi: {
        name: 'HS系统',
        description: '即将上线更多脚本功能',
        scripts: []
    }
};

// ============== 天气缓存配置 ==============
export const WEATHER_CACHE_KEY = 'heweather_bj_cache';
export const WEATHER_TTL = 10 * 60 * 1000; // 10 分钟

// ============== 工具函数 ==============
export const getEndOfDayTimestamp = (): number => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now.getTime();
};
