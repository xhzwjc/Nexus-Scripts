'use client';

import { useMemo, useState } from 'react';
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
import type { ScriptHubAuditLogEntry, ScriptHubRbacOverview } from '@/lib/types';
import { AuditTable } from './AuditTable';
import { filterAuditLogs } from './utils';

interface AccessControlAuditPageProps {
    overview: ScriptHubRbacOverview | null;
    loading: boolean;
    error: string | null;
    onReload: () => Promise<void>;
}

const EMPTY_AUDIT_LOGS: ScriptHubAuditLogEntry[] = [];

export function AccessControlAuditPage({
    overview,
    loading,
    error,
    onReload,
}: AccessControlAuditPageProps) {
    const { t } = useI18n();
    const labels = t.accessControl;
    const [query, setQuery] = useState('');
    const [actor, setActor] = useState('');
    const [targetType, setTargetType] = useState('');
    const [result, setResult] = useState('');
    const [sensitivity, setSensitivity] = useState('');

    const logs = overview?.audit_logs ?? EMPTY_AUDIT_LOGS;
    const targetTypes = useMemo(() => {
        return [...new Set(logs.map((log) => log.target_type).filter(Boolean))].sort();
    }, [logs]);
    const filteredLogs = useMemo(() => filterAuditLogs(logs, {
        query,
        actor,
        targetType,
        result,
        sensitivity,
    }), [actor, logs, query, result, sensitivity, targetType]);

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
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                    <Input
                        className="h-9 rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-950"
                        placeholder={labels.auditActorFilter}
                        value={actor}
                        onChange={(event) => setActor(event.target.value)}
                    />
                    <Select value={targetType || 'all'} onValueChange={(value) => setTargetType(value === 'all' ? '' : value)}>
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
                    <Select value={result || 'all'} onValueChange={(value) => setResult(value === 'all' ? '' : value)}>
                        <SelectTrigger className="h-9 rounded-[4px] border-[#E6E7EB] bg-white text-[12px] shadow-none focus:ring-0 dark:border-slate-700 dark:bg-slate-950">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{labels.auditAllResults}</SelectItem>
                            <SelectItem value="success">{labels.auditResultSuccess}</SelectItem>
                            <SelectItem value="failed">{labels.auditResultFailed}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sensitivity || 'all'} onValueChange={(value) => setSensitivity(value === 'all' ? '' : value)}>
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
                    }}>
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {labels.resetFilters}
                    </Button>
                </div>
            </div>
            <div>
                {loading ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] text-[12px] text-[#86888F]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.loading}
                    </div>
                ) : error ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[#EBEEF5] text-center">
                        <p className="max-w-md text-[12px] text-[#F53F3F]">{error}</p>
                        <Button variant="outline" className="h-8 rounded-[6px] border-[#E6E7EB] bg-white px-3 text-[12px] font-normal text-[#0F23D9] shadow-none" onClick={() => void onReload()}>{labels.refresh}</Button>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] text-[12px] text-[#86888F]">
                        {labels.noAuditLogs}
                    </div>
                ) : (
                    <AuditTable logs={filteredLogs} labels={labels} />
                )}
            </div>
        </section>
    );
}
