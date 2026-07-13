'use client';

import { ShieldCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AccessControlView } from '@/lib/types';
import { ACCESS_CONTROL_VIEWS } from './constants';
import type { AccessControlLabels } from './utils';

interface AccessControlTabsProps {
    value: AccessControlView;
    labels: AccessControlLabels;
    onChange: (view: AccessControlView) => void;
}

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
        <Tabs value={value} onValueChange={(next) => onChange(next as AccessControlView)} className="min-w-0 flex-1 gap-0">
            <TabsList
                aria-label={labels.title}
                className="flex h-12 w-full min-w-max justify-start gap-1 overflow-visible rounded-none bg-transparent p-0 text-[#33353D]"
            >
                <span className="mr-1 flex h-12 shrink-0 items-center" aria-hidden="true">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-white">
                        <ShieldCheck className="h-4 w-4" />
                    </span>
                </span>
                {ACCESS_CONTROL_VIEWS.map((view) => {
                    return (
                        <TabsTrigger
                            key={view}
                            value={view}
                            className="relative h-12 flex-none rounded-none border-0 bg-transparent px-4 text-[15px] font-normal text-[#33353D] shadow-none outline-none transition-colors after:absolute after:bottom-0 after:left-1/2 after:h-[3px] after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-transparent hover:text-[#0F23D9] focus-visible:ring-0 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[#0E1114] data-[state=active]:shadow-none data-[state=active]:after:bg-[#1E3BFA] dark:text-slate-300 dark:hover:text-blue-300 dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-white"
                        >
                            {getLabel(view, labels)}
                        </TabsTrigger>
                    );
                })}
            </TabsList>
        </Tabs>
    );
}
