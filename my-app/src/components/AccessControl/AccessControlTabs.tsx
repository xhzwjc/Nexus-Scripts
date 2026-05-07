'use client';

import { BarChart3, Building2, ClipboardList, DatabaseZap, ShieldCheck, UsersRound } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AccessControlView } from '@/lib/types';
import { ACCESS_CONTROL_VIEWS } from './constants';
import type { AccessControlLabels } from './utils';

interface AccessControlTabsProps {
    value: AccessControlView;
    labels: AccessControlLabels;
    onChange: (view: AccessControlView) => void;
}

const ICONS = {
    overview: BarChart3,
    organizations: Building2,
    users: UsersRound,
    roles: ShieldCheck,
    resources: DatabaseZap,
    audit: ClipboardList,
};

function getLabel(view: AccessControlView, labels: AccessControlLabels) {
    switch (view) {
        case 'overview':
            return labels.navOverview;
        case 'users':
            return labels.navUsers;
        case 'organizations':
            return labels.navOrganizations;
        case 'roles':
            return labels.navRoles;
        case 'resources':
            return labels.navResources;
        case 'audit':
            return labels.navAudit;
        default:
            return view;
    }
}

export function AccessControlTabs({ value, labels, onChange }: AccessControlTabsProps) {
    return (
        <Tabs value={value} onValueChange={(next) => onChange(next as AccessControlView)} className="w-full">
            <TabsList
                aria-label={labels.title}
                className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-white/70 bg-white/55 p-1.5 shadow-[0_1px_8px_rgba(15,23,42,0.05)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/45 dark:shadow-none sm:grid-cols-3 xl:grid-cols-6"
            >
                {ACCESS_CONTROL_VIEWS.map((view) => {
                    const Icon = ICONS[view];
                    return (
                        <TabsTrigger
                            key={view}
                            value={view}
                            className="h-9 min-w-0 rounded-xl border border-transparent px-3 text-xs font-medium text-slate-600 shadow-none transition-all hover:bg-white/55 hover:text-slate-950 data-[state=active]:border-slate-200/80 data-[state=active]:bg-white/85 data-[state=active]:text-slate-950 data-[state=active]:shadow-[0_1px_6px_rgba(15,23,42,0.07)] dark:text-slate-400 dark:hover:bg-slate-900/55 dark:hover:text-slate-100 dark:data-[state=active]:border-slate-700/80 dark:data-[state=active]:bg-slate-900/80 dark:data-[state=active]:text-slate-50 dark:data-[state=active]:shadow-none"
                        >
                            <Icon className="h-4 w-4 opacity-75" />
                            <span className="truncate">{getLabel(view, labels)}</span>
                        </TabsTrigger>
                    );
                })}
            </TabsList>
        </Tabs>
    );
}
