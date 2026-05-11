'use client';

import { KeyRound, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
        <div className="overflow-x-auto rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead>{labels.userCode}</TableHead>
                        <TableHead>{labels.displayName}</TableHead>
                        <TableHead>{labels.organization}</TableHead>
                        <TableHead>{labels.roles}</TableHead>
                        <TableHead>{labels.dataScope}</TableHead>
                        <TableHead>{labels.configPermission}</TableHead>
                        <TableHead>{labels.status}</TableHead>
                        <TableHead>{labels.effectivePermissions}</TableHead>
                        <TableHead>{labels.lastLogin}</TableHead>
                        <TableHead className="text-right">{labels.actions}</TableHead>
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
                            <TableRow key={user.userCode}>
                                <TableCell>
                                    <span className="font-mono text-xs">{user.userCode}</span>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <p className="font-medium">{user.displayName}</p>
                                        {user.isSuperAdmin && (
                                            <Badge variant="outline">{labels.superAdmin}</Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <p className="text-sm">{user.primaryOrgName}</p>
                                        <p className="font-mono text-xs text-muted-foreground">{user.primaryOrgCode}</p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <CompactBadgeList items={user.roleNames} max={3} />
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1.5">
                                        <Badge variant="outline">{getDataScopeLabel(user.dataScope, labels)}</Badge>
                                        {user.customOrgCodes.length > 0 && (
                                            <CompactBadgeList items={user.customOrgCodes} max={2} variant="outline" />
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <ConfigPermissionBadge state={user.configPermissionState} labels={labels} />
                                </TableCell>
                                <TableCell>
                                    <StatusBadge active={user.isActive} labels={labels} />
                                </TableCell>
                                <TableCell>
                                    <CompactBadgeList items={permissionNames} max={3} variant="outline" />
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {formatDateTime(user.lastLoginAt) || labels.neverLoggedIn}
                                </TableCell>
                                <TableCell className="text-right">
                                    {user.userCode === 'admin' && currentUserId !== 'admin' ? null : (
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => {
                                            if (!canManageUsers) { toast.warning(labels.adminOnlyTooltip); return; }
                                            onEdit(rawUser);
                                        }}>
                                            <Pencil className="h-4 w-4" />
                                            {labels.editUser}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => {
                                            if (!canManageUsers) { toast.warning(labels.adminOnlyTooltip); return; }
                                            onRotateKey(rawUser);
                                        }}>
                                            <KeyRound className="h-4 w-4" />
                                            {labels.rotateUserKey}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => {
                                                if (!canManageUsers) { toast.warning(labels.adminOnlyTooltip); return; }
                                                onDelete(rawUser);
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            {labels.deleteUser}
                                        </Button>
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
