'use client';

import { useMemo, useState } from 'react';

import type { Language, Translations } from '@/lib/i18n';
import type { User } from '@/lib/types';

export interface DashboardSearchResult {
    id: string;
    name: string;
    desc: string;
    type: 'cm' | 'hs' | 'script' | 'tool';
}

interface UseDashboardSearchOptions {
    currentUser: User | null;
    language: Language;
    t: Translations;
}

export function useDashboardSearch({
    currentUser,
    language,
    t,
}: UseDashboardSearchOptions) {
    const [homeSearchQuery, setHomeSearchQuery] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);

    const searchResults = useMemo<DashboardSearchResult[]>(() => {
        if (!homeSearchQuery.trim()) return [];

        const query = homeSearchQuery.toLowerCase();
        const results: DashboardSearchResult[] = [];

        if ('cm核心业务系统'.includes(query) || 'cm'.includes(query) || '核心'.includes(query) || '业务'.includes(query)) {
            results.push({ id: 'chunmiao', name: t.home.search.cm.name, desc: t.home.search.cm.desc, type: 'cm' });
        }
        if ('hs辅助系统'.includes(query) || 'hs'.includes(query) || '辅助'.includes(query)) {
            results.push({ id: 'haoshi', name: t.home.search.hs.name, desc: t.home.search.hs.desc, type: 'hs' });
        }

        if (currentUser?.permissions['server-monitoring']) {
            const opsName = t.home.search.ops.name.toLowerCase();
            const opsDesc = t.home.search.ops.desc.toLowerCase();
            const keywords = ['ops', 'monitor', 'server', 'System', '运维', '监控', '服务器', '系统'];

            if (opsName.includes(query) || opsDesc.includes(query) || keywords.some((keyword) => keyword.includes(query))) {
                results.push({
                    id: 'ops-center',
                    name: t.home.search.ops.name,
                    desc: t.home.search.ops.desc,
                    type: 'tool',
                });
            }
        }

        const scriptItems = [
            { key: 'settlement', configKey: 'settlement', keywords: ['结算', '处理', 'settlement', '批量'] },
            { key: 'commission', configKey: 'commission', keywords: ['佣金', '渠道', 'commission', '验证', '计算'] },
            { key: 'balance', configKey: 'balance', keywords: ['余额', '核对', 'balance', '账户'] },
            { key: 'task-automation', configKey: 'taskAutomation', keywords: ['任务', '自动化', 'task', 'automation', '批量'] },
            { key: 'sms_operations_center', configKey: 'smsOperationsCenter', keywords: ['短信', 'sms', '发送', '补发', '模板'] },
            { key: 'tax-reporting', configKey: 'taxReporting', keywords: ['税务', '报表', 'tax', 'report', '完税'] },
            { key: 'tax-calculation', configKey: 'taxCalculation', keywords: ['税额', '计算', 'tax', 'calc', '个税'] },
            { key: 'payment-stats', configKey: 'paymentStats', keywords: ['开票', '统计', 'payment', '结算', 'stats'] },
            { key: 'delivery-tool', configKey: 'deliveryTool', keywords: ['交付', '提交', 'delivery', '交付物'] },
        ] as const;

        scriptItems.forEach((item) => {
            const cfg = t.scriptConfig.items[item.configKey];
            if (cfg && (cfg.name.toLowerCase().includes(query) || cfg.description.toLowerCase().includes(query) || item.keywords.some((keyword) => keyword.includes(query)))) {
                if (!results.find((result) => result.id === item.key)) {
                    results.push({ id: item.key, name: cfg.name, desc: cfg.description, type: 'script' });
                }
            }
        });

        const isZh = language === 'zh-CN';
        const toolItems = [
            { id: 'ocr', name: isZh ? 'OCR智能比对' : 'OCR Smart Matching', desc: isZh ? '自动化身份信息核验' : 'Automated identity verification', keywords: ['ocr', '比对', '识别', '身份', 'identity', 'verification'] },
            { id: 'devtools', name: t.devTools?.title || 'Developer Tools', desc: isZh ? 'JSON格式化、时间戳等实用工具' : 'JSON formatting, timestamp tools', keywords: ['开发者', 'dev', 'json', '工具', 'uuid', 'base64', 'developer', 'tools'] },
            { id: 'teamResources', name: t.teamResources?.viewerTitle || 'Team Resources', desc: isZh ? '系统账号与环境配置管理' : 'System account & environment management', keywords: ['团队', '资源', 'team', '账号', '环境', 'resources', 'account'] },
            { id: 'aiResources', name: t.aiResources?.title || 'AI Tools', desc: isZh ? '常用AI工具与资源导航' : 'AI tool resources navigation', keywords: ['ai', '人工智能', '工具库', 'chatgpt', 'artificial', 'intelligence'] },
            { id: 'agent-chat', name: t.agentChat?.title || 'AI Agent', desc: isZh ? 'AI智能对话助手，简历筛选等预设工作流' : 'AI chat assistant with preset workflows', keywords: ['agent', '助手', 'ai', '对话', '简历', 'chat', 'resume', 'assistant'] },
            { id: 'accessControl', name: t.nav.accessControl, desc: t.home.search.accessControl.desc, keywords: ['权限', '角色', '用户', 'rbac', 'iam', 'access', 'role', 'permission'] },
            { id: 'help', name: t.helpPage?.title || 'Help Center', desc: isZh ? '使用指南与文档' : 'User guide & documentation', keywords: ['帮助', 'help', '文档', '指南', 'guide', 'documentation'] },
        ];

        toolItems.forEach((item) => {
            if (item.id === 'devtools' && !currentUser?.permissions['dev-tools']) return;
            if (item.id === 'teamResources' && !currentUser?.permissions['team-resources']) return;
            if (item.id === 'aiResources' && !currentUser?.permissions['ai-resources']) return;
            if (item.id === 'agent-chat' && !currentUser?.permissions['agent-chat']) return;
            if (item.id === 'accessControl' && !currentUser?.permissions['rbac-manage']) return;

            if (item.name.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query) || item.keywords.some((keyword) => keyword.includes(query))) {
                if (!results.find((result) => result.id === item.id)) {
                    results.push({ id: item.id, name: item.name, desc: item.desc, type: 'tool' });
                }
            }
        });

        return results.slice(0, 8);
    }, [currentUser, homeSearchQuery, language, t]);

    return {
        homeSearchQuery,
        setHomeSearchQuery,
        showSearchResults,
        setShowSearchResults,
        searchResults,
    };
}
