'use client';

import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type {
    AccessControlUserViewModel,
    ScriptHubManagedUser,
    ScriptHubPermissionDefinition,
} from '@/lib/types';
import { CompactBadgeList, ConfigPermissionBadge, StatusBadge } from './AccessControlBadges';
import type { AccessControlLabels } from './utils';
import { formatDateTime, getDataScopeLabel } from './utils';

interface UserTableProps {
    users: ScriptHubManagedUser[];
    viewModels: AccessControlUserViewModel[];
    permissionMap: Map<string, ScriptHubPermissionDefinition>;
    labels: AccessControlLabels;
    canManageUsers: boolean;
    currentUserId?: string;
    onEdit: (user: ScriptHubManagedUser) => void;
    onRotateKey: (user: ScriptHubManagedUser) => void;
    onDelete: (user: ScriptHubManagedUser) => void;
}

export function UserTable({
    users,
    viewModels,
    permissionMap,
    labels,
    canManageUsers,
    currentUserId,
    onEdit,
    onRotateKey,
    onDelete,
}: UserTableProps) {
    const userByCode = new Map(users.map((user) => [user.user_code, user]));

    return (
        <div className="w-full overflow-x-auto">
            <Table className="w-full min-w-[1230px] table-fixed text-[12px]">
                <TableHeader>
                    <TableRow className="h-10 border-b border-[#F2F3F5] bg-white hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-950">
                        <TableHead className="w-[80px] px-3 text-[11px] font-normal text-[#86888F]">{labels.userCode}</TableHead>
                        <TableHead className="w-[105px] px-3 text-[11px] font-normal text-[#86888F]">{labels.displayName}</TableHead>
                        <TableHead className="w-[150px] px-3 text-[11px] font-normal text-[#86888F]">{labels.organization}</TableHead>
                        <TableHead className="w-[115px] px-3 text-[11px] font-normal text-[#86888F]">{labels.roles}</TableHead>
                        <TableHead className="w-[115px] px-3 text-[11px] font-normal text-[#86888F]">{labels.dataScope}</TableHead>
                        <TableHead className="w-[105px] px-3 text-[11px] font-normal text-[#86888F]">{labels.configPermission}</TableHead>
                        <TableHead className="w-[65px] px-3 text-[11px] font-normal text-[#86888F]">{labels.status}</TableHead>
                        <TableHead className="w-[200px] px-3 text-[11px] font-normal text-[#86888F]">{labels.effectivePermissions}</TableHead>
                        <TableHead className="w-[145px] px-3 text-[11px] font-normal text-[#86888F]">{labels.lastLogin}</TableHead>
                        <TableHead className="w-[150px] px-3 text-right text-[11px] font-normal text-[#86888F]">{labels.actions}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {viewModels.map((user) => {
                        const rawUser = userByCode.get(user.userCode);
                        if (!rawUser) {
                            return null;
                        }

                        const permissionNames = user.effectivePermissionKeys.map((permissionKey) => (
                            permissionMap.get(permissionKey)?.name || permissionKey
                        ));

                        return (
                            <TableRow key={user.userCode} className="h-[56px] border-b border-[#F2F3F5] text-[#0F1014] hover:bg-[#F8F8F9] dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900/60">
                                <TableCell className="px-3 py-1">
                                    <span className="font-mono text-[11px] text-[#5E5F66] dark:text-slate-400">{user.userCode}</span>
                                </TableCell>
                                <TableCell className="px-3 py-1">
                                    <div className="space-y-1.5">
                                        <p className="truncate text-[12px] font-medium" title={user.displayName}>{user.displayName}</p>
                                        {user.isSuperAdmin && (
                                            <Badge variant="outline" className="h-[20px] rounded-[4px] border-transparent bg-[rgba(30,59,250,0.08)] px-1.5 text-[10px] font-normal text-[#0F23D9] shadow-none">{labels.superAdmin}</Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="px-3 py-1">
                                    <div className="min-w-0 space-y-1">
                                        <p className="truncate text-[12px]" title={user.primaryOrgName}>{user.primaryOrgName}</p>
                                        <p className="truncate font-mono text-[10px] text-[#B0B2B8]" title={user.primaryOrgCode}>{user.primaryOrgCode}</p>
                                    </div>
                                </TableCell>
                                <TableCell className="px-3 py-1">
                                    <CompactBadgeList items={user.roleNames} max={3} />
                                </TableCell>
                                <TableCell className="px-3 py-1">
                                    <div className="space-y-1">
                                        <Badge variant="outline" className="h-[22px] rounded-[4px] border-[rgba(30,59,250,0.14)] bg-[rgba(30,59,250,0.05)] px-2 text-[10px] font-normal text-[#0F23D9] shadow-none">{getDataScopeLabel(user.dataScope, labels)}</Badge>
                                        {user.customOrgCodes.length > 0 && (
                                            <CompactBadgeList items={user.customOrgCodes} max={2} variant="outline" />
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="px-3 py-1">
                                    <ConfigPermissionBadge state={user.configPermissionState} labels={labels} />
                                </TableCell>
                                <TableCell className="px-3 py-1">
                                    <StatusBadge active={user.isActive} labels={labels} />
                                </TableCell>
                                <TableCell className="px-3 py-1">
                                    <CompactBadgeList items={permissionNames} max={2} variant="outline" />
                                </TableCell>
                                <TableCell className="px-3 py-1 text-[11px] tabular-nums text-[#86888F]">
                                    {formatDateTime(user.lastLoginAt) || labels.neverLoggedIn}
                                </TableCell>
                                <TableCell className="px-3 py-1 text-right">
                                    {user.userCode === 'admin' && currentUserId !== 'admin' ? null : (
                                    <div className="flex items-center justify-end gap-3 whitespace-nowrap text-[11px]">
                                        <button type="button" className="text-[#0F23D9] transition-colors hover:text-[#1E3BFA]" onClick={() => {
                                            if (!canManageUsers) { toast.warning(labels.adminOnlyTooltip); return; }
                                            onEdit(rawUser);
                                        }}>
                                            {labels.editUser}
                                        </button>
                                        <button type="button" className="text-[#0F23D9] transition-colors hover:text-[#1E3BFA]" onClick={() => {
                                            if (!canManageUsers) { toast.warning(labels.adminOnlyTooltip); return; }
                                            onRotateKey(rawUser);
                                        }}>
                                            {labels.rotateUserKey}
                                        </button>
                                        <button
                                            type="button"
                                            className="text-[#F53F3F] transition-colors hover:text-[#D9363E]"
                                            onClick={() => {
                                                if (!canManageUsers) { toast.warning(labels.adminOnlyTooltip); return; }
                                                onDelete(rawUser);
                                            }}
                                        >
                                            {labels.deleteUser}
                                        </button>
                                    </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
