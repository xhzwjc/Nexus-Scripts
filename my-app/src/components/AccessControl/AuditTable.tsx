'use client';

import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { ScriptHubAuditLogEntry } from '@/lib/types';
import { SensitivityBadge } from './AccessControlBadges';
import type { AccessControlLabels } from './utils';
import { formatAuditAction, formatDateTime, summarizeAuditDetails } from './utils';

interface AuditTableProps {
    logs: ScriptHubAuditLogEntry[];
    labels: AccessControlLabels;
}

export function AuditTable({ logs, labels }: AuditTableProps) {
    return (
        <div className="overflow-x-auto rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead>{labels.auditTime}</TableHead>
                        <TableHead>{labels.auditActor}</TableHead>
                        <TableHead>{labels.auditAction}</TableHead>
                        <TableHead>{labels.auditTargetType}</TableHead>
                        <TableHead>{labels.auditTargetCode}</TableHead>
                        <TableHead>{labels.organization}</TableHead>
                        <TableHead>{labels.sensitivity}</TableHead>
                        <TableHead>{labels.auditResult}</TableHead>
                        <TableHead>{labels.auditDetails}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {logs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {formatDateTime(log.created_at) || '-'}
                            </TableCell>
                            <TableCell>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">
                                        {log.actor_display_name || log.actor_user_code || labels.auditUnknownActor}
                                    </p>
                                    {log.actor_user_code && (
                                        <p className="font-mono text-xs text-muted-foreground">{log.actor_user_code}</p>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>{formatAuditAction(log.action, labels)}</TableCell>
                            <TableCell className="font-mono text-xs">{log.target_type}</TableCell>
                            <TableCell className="font-mono text-xs">{log.target_code}</TableCell>
                            <TableCell className="font-mono text-xs">{log.target_org_code || '-'}</TableCell>
                            <TableCell>
                                <SensitivityBadge value={log.sensitivity} labels={labels} />
                            </TableCell>
                            <TableCell>
                                <Badge variant={log.result === 'success' ? 'default' : 'destructive'}>
                                    {log.result === 'success' ? labels.auditResultSuccess : labels.auditResultFailed}
                                </Badge>
                            </TableCell>
                            <TableCell className="max-w-[360px] text-xs text-muted-foreground">
                                <span className="line-clamp-2">{summarizeAuditDetails(log.details || {}) || '-'}</span>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
