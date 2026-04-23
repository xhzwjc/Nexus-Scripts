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
        <Tabs value={value} onValueChange={(next) => onChange(next as AccessControlView)}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
                {ACCESS_CONTROL_VIEWS.map((view) => {
                    const Icon = ICONS[view];
                    return (
                        <TabsTrigger
                            key={view}
                            value={view}
                            className="h-11 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                        >
                            <Icon className="h-4 w-4" />
                            {getLabel(view, labels)}
                        </TabsTrigger>
                    );
                })}
            </TabsList>
        </Tabs>
    );
}
