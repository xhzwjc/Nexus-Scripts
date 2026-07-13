'use client';

import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ScriptHubRoleDefinition } from '@/lib/types';
import type { AccessControlLabels } from './utils';

export type RoleDirectoryFilter = 'all' | 'system' | 'custom';

interface RoleTableProps {
    roles: ScriptHubRoleDefinition[];
    visibleRoles: ScriptHubRoleDefinition[];
    selectedRoleCode: string | null;
    query: string;
    filter: RoleDirectoryFilter;
    labels: AccessControlLabels;
    onQueryChange: (query: string) => void;
    onFilterChange: (filter: RoleDirectoryFilter) => void;
    onSelect: (role: ScriptHubRoleDefinition) => void;
    onCreate: () => void;
}

export function RoleTable({
    roles,
    visibleRoles,
    selectedRoleCode,
    query,
    filter,
    labels,
    onQueryChange,
    onFilterChange,
    onSelect,
    onCreate,
}: RoleTableProps) {
    const counts = {
        all: roles.length,
        system: roles.filter((role) => role.is_system).length,
        custom: roles.filter((role) => !role.is_system).length,
    };
    const filters: Array<{ value: RoleDirectoryFilter; label: string }> = [
        { value: 'all', label: labels.roleFilterAll },
        { value: 'system', label: labels.systemRole },
        { value: 'custom', label: labels.customRole },
    ];

    return (
        <aside className="flex h-full w-[316px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-[15px] font-semibold text-[#0E1114] dark:text-white">{labels.roleDirectoryTitle}</h2>
                    <span className="text-[11px] text-[#B0B2B8]">{labels.roleDirectoryOnlyPermissions}</span>
                </div>
                <Button className="h-[30px] rounded-[6px] bg-[#1E3BFA] px-3 text-[12px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={onCreate}>
                    <Plus className="h-3 w-3" />
                    {labels.addLabel}
                </Button>
            </div>

            <div className="px-4 pb-2.5">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]" />
                    <Input
                        className="h-8 rounded-[6px] border-[#E6E7EB] bg-white pl-8 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-950"
                        placeholder={labels.rolesSearchPlaceholder}
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                    />
                </div>
            </div>

            <div className="px-4 pb-2.5">
                <div className="flex gap-0.5 rounded-[8px] bg-[#F2F3F5] p-[3px] dark:bg-slate-900">
                    {filters.map((item) => {
                        const active = filter === item.value;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                className={cn(
                                    'flex h-7 flex-1 items-center justify-center rounded-[6px] text-[12px] transition-colors',
                                    active
                                        ? 'bg-white font-semibold text-[#1E3BFA] shadow-[0_1px_2px_rgba(14,17,20,0.1)] dark:bg-slate-800'
                                        : 'font-normal text-[#86888F] hover:text-[#33353D] dark:hover:text-slate-200',
                                )}
                                onClick={() => onFilterChange(item.value)}
                                aria-pressed={active}
                            >
                                {item.label} {counts[item.value]}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {visibleRoles.length === 0 ? (
                    <div className="flex h-full min-h-40 items-center justify-center px-6 text-center text-[12px] text-[#B0B2B8]">
                        {labels.noRoles}
                    </div>
                ) : visibleRoles.map((role) => {
                    const active = selectedRoleCode === role.code;
                    return (
                        <button
                            key={role.code}
                            type="button"
                            className={cn(
                                'group relative flex w-full flex-col gap-1 rounded-[8px] py-[11px] pl-4 pr-3 text-left transition-colors hover:bg-[#F8F8F9] dark:hover:bg-slate-900',
                                active && 'bg-[rgba(30,59,250,0.05)] hover:bg-[rgba(30,59,250,0.05)] dark:bg-blue-950/20 dark:hover:bg-blue-950/20',
                            )}
                            onClick={() => onSelect(role)}
                            aria-current={active ? 'true' : undefined}
                        >
                            <span className={cn(
                                'absolute bottom-3 left-[5px] top-3 w-[3px] rounded-[2px]',
                                active ? 'bg-[#1E3BFA]' : 'bg-transparent',
                            )} />
                            <span className="flex w-full items-center justify-between gap-2">
                                <span className={cn(
                                    'min-w-0 truncate text-[13px] font-medium',
                                    active ? 'text-[#1E3BFA]' : 'text-[#0E1114] dark:text-slate-100',
                                )} title={role.name}>
                                    {role.name}
                                </span>
                                <span className={cn(
                                    'inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-[10px]',
                                    role.is_system
                                        ? 'bg-[rgba(176,178,184,0.14)] text-[#86888F]'
                                        : 'bg-[rgba(46,156,255,0.1)] text-[#2E9CFF]',
                                )}>
                                    {role.is_system ? labels.systemRole : labels.customRole}
                                </span>
                            </span>
                            <span className="flex items-center gap-2 text-[11px] text-[#B0B2B8]">
                                <span>{role.permission_keys.length} {labels.permissionCountUnit}</span>
                                <span>·</span>
                                <span>{role.assigned_user_count} {labels.userCountUnit}</span>
                                {!role.is_active && (
                                    <>
                                        <span>·</span>
                                        <span className="text-[#F53F3F]">{labels.inactive}</span>
                                    </>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}
