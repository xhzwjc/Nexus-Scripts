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
        <div className="overflow-x-auto rounded-[8px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
            <Table className="w-full min-w-[1060px] table-fixed text-[12px]">
                <colgroup>
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                </colgroup>
                <TableHeader>
                    <TableRow className="h-10 border-b border-[#F2F3F5] bg-white hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-950">
                        <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.auditTime}</TableHead>
                        <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.auditActor}</TableHead>
                        <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.auditAction} / {labels.auditTarget}</TableHead>
                        <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.auditDetails}</TableHead>
                        <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.sensitivity}</TableHead>
                        <TableHead className="px-4 text-[11px] font-normal text-[#86888F]">{labels.auditResult}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {logs.map((log, index) => {
                        const actorName = log.actor_display_name || log.actor_user_code || labels.auditUnknownActor;
                        return (
                            <TableRow key={log.id} className="h-[54px] border-b border-[#F2F3F5] text-[#0F1014] hover:bg-[#F8F8F9] dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900/60">
                                <TableCell className="whitespace-nowrap px-4 py-1 text-[11px] tabular-nums text-[#86888F]">
                                    {formatDateTime(log.created_at) || '-'}
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white ${index % 3 === 0 ? 'bg-[#7B61FF]' : index % 3 === 1 ? 'bg-[#1E3BFA]' : 'bg-[#0CC991]'}`}>
                                            {actorName.slice(0, 1)}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-[12px] font-medium" title={actorName}>{actorName}</p>
                                            {log.actor_user_code && <p className="mt-0.5 truncate font-mono text-[10px] text-[#B0B2B8]">{log.actor_user_code}</p>}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                    <p className="truncate text-[12px] font-medium text-[#0E1114] dark:text-white">{formatAuditAction(log.action, labels)}</p>
                                    <p className="mt-0.5 truncate font-mono text-[10px] text-[#B0B2B8]" title={`${log.target_type} · ${log.target_code}`}>{log.target_type} · {log.target_code}</p>
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                    <p className="line-clamp-2 text-[11px] leading-5 text-[#5E5F66] dark:text-slate-400">{summarizeAuditDetails(log.details || {}) || '-'}</p>
                                    {log.target_org_code && <p className="truncate font-mono text-[10px] text-[#B0B2B8]">{labels.organization}: {log.target_org_code}</p>}
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                    <SensitivityBadge value={log.sensitivity} labels={labels} />
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                    <Badge variant="outline" className={`h-[22px] rounded-[4px] border-transparent px-2 text-[10px] font-normal shadow-none ${log.result === 'success' ? 'bg-[rgba(12,201,145,0.1)] text-[#0A9C71]' : 'bg-[rgba(245,63,63,0.08)] text-[#F53F3F]'}`}>
                                        <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${log.result === 'success' ? 'bg-[#0CC991]' : 'bg-[#F53F3F]'}`} />
                                        {log.result === 'success' ? labels.auditResultSuccess : labels.auditResultFailed}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
