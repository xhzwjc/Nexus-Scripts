'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { ScriptHubAuditLogEntry } from '@/lib/types';
import { AuditTable } from './AuditTable';
import { useDebouncedValue, useRbacQuery } from './accessControlQuery';
import type { RbacAuditLogsResponse } from './types';

interface AccessControlAuditPageProps {
    refreshToken: number;
}

const AUDIT_PAGE_SIZE = 50;
const EMPTY_AUDIT_LOGS: ScriptHubAuditLogEntry[] = [];

export function AccessControlAuditPage({
    refreshToken,
}: AccessControlAuditPageProps) {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [query, setQuery] = useState('');
    const [actor, setActor] = useState('');
    const [targetType, setTargetType] = useState('');
    const [result, setResult] = useState('');
    const [sensitivity, setSensitivity] = useState('');
    const [page, setPage] = useState(1);
    const debouncedQuery = useDebouncedValue(query, 300);
    const debouncedActor = useDebouncedValue(actor, 300);
    const requestPath = useMemo(() => {
        const params = new URLSearchParams({
            page: String(page),
            page_size: String(AUDIT_PAGE_SIZE),
        });
        if (debouncedQuery.trim()) params.set('search', debouncedQuery.trim());
        if (debouncedActor.trim()) params.set('actor', debouncedActor.trim());
        if (targetType) params.set('target_type', targetType);
        if (result) params.set('result', result);
        if (sensitivity) params.set('sensitivity', sensitivity);
        return `/api/admin/rbac/audit-logs?${params.toString()}`;
    }, [debouncedActor, debouncedQuery, page, result, sensitivity, targetType]);
    const auditQuery = useRbacQuery<RbacAuditLogsResponse>(requestPath, labels.loadFailed, refreshToken);
    const logs = auditQuery.data?.items ?? EMPTY_AUDIT_LOGS;
    const total = auditQuery.data?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);
    const targetTypes = useMemo(() => {
        return auditQuery.data?.target_types || [...new Set(logs.map((log) => log.target_type).filter(Boolean))].sort();
    }, [auditQuery.data?.target_types, logs]);

    return (
        <section aria-labelledby="access-control-audit-title" className="space-y-5">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h2 id="access-control-audit-title" className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{labels.auditPageTitle}</h2>
                    <p className="text-[12px] leading-5 text-[#B0B2B8]">{labels.auditPageDesc}</p>
            </div>

            <div>
                <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_180px_150px_170px_auto]">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]" />
                        <Input
                            className="h-9 rounded-[4px] border-[#E6E7EB] bg-white pl-9 text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-950"
                            placeholder={labels.auditSearchPlaceholder}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                    <Input
                        className="h-9 rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-950"
                        placeholder={labels.auditActorFilter}
                        value={actor}
                        onChange={(event) => {
                            setActor(event.target.value);
                            setPage(1);
                        }}
                    />
                    <Select value={targetType || 'all'} onValueChange={(value) => {
                        setTargetType(value === 'all' ? '' : value);
                        setPage(1);
                    }}>
                        <SelectTrigger className="h-9 rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{labels.auditAllTargetTypes}</SelectItem>
                            {targetTypes.map((item) => (
                                <SelectItem key={item} value={item}>{item}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={result || 'all'} onValueChange={(value) => {
                        setResult(value === 'all' ? '' : value);
                        setPage(1);
                    }}>
                        <SelectTrigger className="h-9 rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{labels.auditAllResults}</SelectItem>
                            <SelectItem value="success">{labels.auditResultSuccess}</SelectItem>
                            <SelectItem value="failed">{labels.auditResultFailed}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sensitivity || 'all'} onValueChange={(value) => {
                        setSensitivity(value === 'all' ? '' : value);
                        setPage(1);
                    }}>
                        <SelectTrigger className="h-9 rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{labels.auditAllSensitivity}</SelectItem>
                            <SelectItem value="normal">{labels.sensitivityNormal}</SelectItem>
                            <SelectItem value="sensitive">{labels.sensitivitySensitive}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" className="h-9 rounded-[4px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#5E5F66] shadow-none hover:border-[#1E3BFA] hover:bg-white hover:text-[#0F23D9]" onClick={() => {
                        setQuery('');
                        setActor('');
                        setTargetType('');
                        setResult('');
                        setSensitivity('');
                        setPage(1);
                    }}>
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {labels.resetFilters}
                    </Button>
                </div>
            </div>
            <div>
                {auditQuery.loading ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] text-[12px] text-[#86888F]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.loading}
                    </div>
                ) : auditQuery.error ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[#EBEEF5] text-center">
                        <p className="max-w-md text-[12px] text-[#F53F3F]">{auditQuery.error}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={auditQuery.reload}>{labels.refresh}</Button>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] text-[12px] text-[#86888F]">
                        {labels.noAuditLogs}
                    </div>
                ) : (
                    <>
                        <AuditTable logs={logs} labels={labels} />
                        <div className="mt-3 flex items-center justify-end gap-3 text-[12px] text-[#86888F]">
                            <span>{page} / {totalPages} · {total}</span>
                            <Button variant="outline" className="h-8 rounded-[6px] px-3 text-[12px]" disabled={page <= 1 || auditQuery.loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t.common.prev}</Button>
                            <Button variant="outline" className="h-8 rounded-[6px] px-3 text-[12px]" disabled={page >= totalPages || auditQuery.loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{t.common.next}</Button>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
