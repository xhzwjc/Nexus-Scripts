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
        <div className="rounded-lg border bg-card">
            <div className="border-b px-5 py-4">
                <div>
                    <h2 className="text-lg font-semibold">{labels.auditPageTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{labels.auditPageDesc}</p>
                </div>
            </div>
            <div className="border-b bg-muted/20 px-5 py-4">
                <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_180px_160px_170px_auto]">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="pl-9"
                            placeholder={labels.auditSearchPlaceholder}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                    <Input
                        placeholder={labels.auditActorFilter}
                        value={actor}
                        onChange={(event) => setActor(event.target.value)}
                    />
                    <Select value={targetType || 'all'} onValueChange={(value) => setTargetType(value === 'all' ? '' : value)}>
                        <SelectTrigger>
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
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{labels.auditAllResults}</SelectItem>
                            <SelectItem value="success">{labels.auditResultSuccess}</SelectItem>
                            <SelectItem value="failed">{labels.auditResultFailed}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sensitivity || 'all'} onValueChange={(value) => setSensitivity(value === 'all' ? '' : value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{labels.auditAllSensitivity}</SelectItem>
                            <SelectItem value="normal">{labels.sensitivityNormal}</SelectItem>
                            <SelectItem value="sensitive">{labels.sensitivitySensitive}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => {
                        setQuery('');
                        setActor('');
                        setTargetType('');
                        setResult('');
                        setSensitivity('');
                    }}>
                        <SlidersHorizontal className="h-4 w-4" />
                        {labels.resetFilters}
                    </Button>
                </div>
            </div>
            <div className="p-5">
                {loading ? (
                    <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {t.common.loading}
                    </div>
                ) : error ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                        <p className="max-w-md text-sm text-destructive">{error}</p>
                        <Button variant="outline" onClick={() => void onReload()}>{labels.refresh}</Button>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                        {labels.noAuditLogs}
                    </div>
                ) : (
                    <AuditTable logs={filteredLogs} labels={labels} />
                )}
            </div>
        </div>
    );
}
