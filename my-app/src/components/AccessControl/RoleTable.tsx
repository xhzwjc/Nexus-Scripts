'use client';

import { Badge } from '@/components/ui/badge';
import type { ScriptHubPermissionDefinition, ScriptHubRoleDefinition } from '@/lib/types';
import { CompactBadgeList, StatusBadge } from './AccessControlBadges';
import type { AccessControlLabels } from './utils';
import { categoryLabel } from './utils';

interface RoleTableProps {
    roles: ScriptHubRoleDefinition[];
    permissionMap: Map<string, ScriptHubPermissionDefinition>;
    labels: AccessControlLabels;
    onView: (role: ScriptHubRoleDefinition) => void;
    onEdit: (role: ScriptHubRoleDefinition) => void;
    onDelete: (role: ScriptHubRoleDefinition) => void;
}

export function RoleTable({ roles, permissionMap, labels, onView, onEdit, onDelete }: RoleTableProps) {
    return (
        <div className="grid gap-4 xl:grid-cols-2">
            {roles.map((role) => {
                const permissionNames = role.permission_keys.map((permissionKey) => (
                    permissionMap.get(permissionKey)?.name || permissionKey
                ));
                const permissionCategories = [...new Set(role.permission_keys.map((permissionKey) => (
                    permissionMap.get(permissionKey)?.category || ''
                )).filter(Boolean))].map((category) => categoryLabel(category, labels));
                const canDelete = !role.is_system && role.assigned_user_count === 0;

                return (
                    <article key={role.code} className="flex min-h-[178px] min-w-0 flex-col rounded-[8px] border border-[#EBEEF5] bg-white px-5 py-4 transition-shadow hover:shadow-[0_4px_12px_rgba(14,17,20,0.06)] dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex min-w-0 items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <h3 className="truncate text-[14px] font-semibold text-[#0E1114] dark:text-white" title={role.name}>{role.name}</h3>
                                    <Badge variant="outline" className={`h-[20px] shrink-0 rounded-[4px] border-transparent px-1.5 text-[10px] font-normal shadow-none ${role.is_system ? 'bg-[#F2F3F5] text-[#86888F]' : 'bg-[rgba(46,156,255,0.1)] text-[#2E9CFF]'}`}>
                                        {role.is_system ? labels.systemRole : labels.customRole}
                                    </Badge>
                                    <StatusBadge active={role.is_active} labels={labels} />
                                </div>
                                <p className="mt-1 truncate font-mono text-[10px] text-[#B0B2B8]" title={role.code}>{role.code}</p>
                            </div>
                            <span className="shrink-0 rounded-[4px] bg-[rgba(30,59,250,0.06)] px-2 py-1 text-[11px] tabular-nums text-[#0F23D9]">
                                {role.permission_keys.length} {labels.permissionsTitle}
                            </span>
                        </div>

                        <p className="mt-3 line-clamp-2 min-h-10 text-[12px] leading-5 text-[#86888F]" title={role.description || ''}>{role.description || '-'}</p>

                        <div className="mt-3 min-h-[22px]">
                            <CompactBadgeList items={permissionCategories.length ? permissionCategories : permissionNames} max={5} variant="outline" />
                        </div>

                        <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t border-[#F2F3F5] pt-3 dark:border-slate-800">
                            <p className="min-w-0 truncate text-[11px] text-[#B0B2B8]">
                                {labels.assignedUsers} {role.assigned_user_count} · {labels.landingPageLabel} {role.landing_page === 'welcome' ? labels.landingPageWelcome : labels.landingPageHome}
                            </p>
                            <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-[11px]">
                                <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => onView(role)}>
                                    {labels.viewPermissions}
                                </button>
                                {!role.is_system && (
                                    <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => onEdit(role)}>
                                        {labels.editRole}
                                    </button>
                                )}
                                {!role.is_system && (
                                    <button
                                        type="button"
                                        className={canDelete ? 'text-[#F53F3F] hover:text-[#D9363E]' : 'cursor-not-allowed text-[#B0B2B8]'}
                                        onClick={() => { if (canDelete) onDelete(role); }}
                                        disabled={!canDelete}
                                        title={!canDelete ? labels.validationRoleAssignedUsers : undefined}
                                    >
                                        {labels.deleteRole}
                                    </button>
                                )}
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
