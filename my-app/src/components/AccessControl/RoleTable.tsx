'use client';

import { Pencil, Trash2 } from 'lucide-react';
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
import type { ScriptHubPermissionDefinition, ScriptHubRoleDefinition } from '@/lib/types';
import { CompactBadgeList, StatusBadge } from './AccessControlBadges';
import type { AccessControlLabels } from './utils';

interface RoleTableProps {
    roles: ScriptHubRoleDefinition[];
    permissionMap: Map<string, ScriptHubPermissionDefinition>;
    labels: AccessControlLabels;
    onEdit: (role: ScriptHubRoleDefinition) => void;
    onDelete: (role: ScriptHubRoleDefinition) => void;
}

export function RoleTable({ roles, permissionMap, labels, onEdit, onDelete }: RoleTableProps) {
    return (
        <div className="overflow-x-auto rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead>{labels.roleCode}</TableHead>
                        <TableHead>{labels.roleName}</TableHead>
                        <TableHead>{labels.roleType}</TableHead>
                        <TableHead>{labels.permissionsTitle}</TableHead>
                        <TableHead>{labels.assignedUsers}</TableHead>
                        <TableHead>{labels.status}</TableHead>
                        <TableHead>{labels.roleDescription}</TableHead>
                        <TableHead className="text-right">{labels.actions}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {roles.map((role) => {
                        const permissionNames = role.permission_keys.map((permissionKey) => (
                            permissionMap.get(permissionKey)?.name || permissionKey
                        ));

                        return (
                            <TableRow key={role.code}>
                                <TableCell className="font-mono text-xs">{role.code}</TableCell>
                                <TableCell className="font-medium">{role.name}</TableCell>
                                <TableCell>
                                    <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                                        {role.is_system ? labels.systemRole : labels.customRole}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <CompactBadgeList items={permissionNames} max={4} variant="outline" />
                                </TableCell>
                                <TableCell>{role.assigned_user_count}</TableCell>
                                <TableCell>
                                    <StatusBadge active={role.is_active} labels={labels} />
                                </TableCell>
                                <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                                    <span className="line-clamp-2" title={role.description || ''}>
                                        {role.description || '-'}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onEdit(role)}
                                            disabled={role.is_system}
                                        >
                                            <Pencil className="h-4 w-4" />
                                            {labels.editRole}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => onDelete(role)}
                                            disabled={role.is_system || role.assigned_user_count > 0}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            {labels.deleteRole}
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
