import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, KeyRound, Layers3, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { requestScriptHubSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface ResourceLockProps {
    onUnlock: (isAdmin: boolean) => void;
}

export function ResourceLock({ onUnlock }: ResourceLockProps) {
    const { t } = useI18n();
    const tr = t.teamResources;
    const [key, setKey] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const featureCards = useMemo(() => ([
        {
            icon: Layers3,
            title: tr.overviewCardTitle,
            description: tr.overviewCardDescription,
            accent: 'from-teal-500/20 via-cyan-500/10 to-transparent',
            iconClass: 'text-teal-600 dark:text-teal-300',
        },
        {
            icon: Activity,
            title: tr.healthCheck,
            description: tr.healthCardDescription,
            accent: 'from-sky-500/20 via-blue-500/10 to-transparent',
            iconClass: 'text-sky-600 dark:text-sky-300',
        },
        {
            icon: ShieldCheck,
            title: tr.manageResources,
            description: tr.manageCardDescription,
            accent: 'from-indigo-500/20 via-violet-500/10 to-transparent',
            iconClass: 'text-indigo-600 dark:text-indigo-300',
        },
    ]), [
        tr.healthCardDescription,
        tr.healthCheck,
        tr.manageCardDescription,
        tr.manageResources,
        tr.overviewCardDescription,
        tr.overviewCardTitle,
    ]);

    const handleUnlock = () => {
        if (!key.trim()) return;
        setLoading(true);
        setErrorMessage(null);

        void (async () => {
            try {
                const session = await requestScriptHubSession(key.trim());
                if (
                    !session.user.permissions?.['team-resources']
                    || !session.user.teamResourcesLoginKeyEnabled
                ) {
                    throw new Error('Forbidden');
                }

                const isAdmin = !!session.user.permissions?.['team-resources-manage'];
                onUnlock(isAdmin);
            } catch {
                setErrorMessage(tr.invalidKey);
            } finally {
                setLoading(false);
            }
        })();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleUnlock();
    };

    return (
        <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[0_28px_80px_var(--glass-shadow)] backdrop-blur-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.10),transparent_32%)]" />
                <div className="absolute -left-10 top-10 h-36 w-36 rounded-full bg-teal-400/15 blur-3xl" />
                <div className="absolute -right-12 bottom-8 h-40 w-40 rounded-full bg-sky-400/12 blur-3xl" />

                <div className="relative grid lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                    <div className="border-b border-[var(--glass-border)] px-7 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
                        <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-teal-700 dark:text-teal-200">
                            <Sparkles className="h-3.5 w-3.5" />
                            {tr.accessBadge}
                        </div>

                        <div className="mt-6 flex items-start gap-4">
                            <div
                                className={cn(
                                    'flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition-all duration-300',
                                    errorMessage
                                        ? 'border-red-400/20 bg-red-500/10 text-red-500 dark:border-red-500/20 dark:bg-red-500/10'
                                        : 'border-teal-500/20 bg-[linear-gradient(135deg,rgba(20,184,166,0.18),rgba(59,130,246,0.12))] text-teal-700 dark:text-teal-200'
                                )}
                            >
                                {errorMessage ? <Lock className="h-8 w-8" /> : <KeyRound className="h-8 w-8" />}
                            </div>

                            <div className="min-w-0">
                                <h2 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">{tr.title}</h2>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                                    {tr.lockDescription}
                                </p>
                                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                                    {tr.accessHint}
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 grid gap-3 sm:grid-cols-3">
                            {featureCards.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div
                                        key={item.title}
                                        className="relative overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-white/[0.55] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:bg-white/5"
                                    >
                                        <div className={cn('absolute inset-0 bg-gradient-to-br', item.accent)} />
                                        <div className="relative">
                                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/50 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/10">
                                                <Icon className={cn('h-5 w-5', item.iconClass)} />
                                            </div>
                                            <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                                            <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">{item.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="px-7 py-8 sm:px-8 lg:px-10 lg:py-10">
                        <div className="rounded-[24px] border border-[var(--glass-border)] bg-white/[0.65] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/5 sm:p-7">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                    {tr.unlock}
                                </p>
                                <h3 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                                    {tr.accessFieldLabel}
                                </h3>
                                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                                    {tr.accessFieldHelp}
                                </p>
                            </div>

                            <div className="mt-6 space-y-4">
                                <div className="space-y-2">
                                    <label
                                        htmlFor="team-resource-access-key"
                                        className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]"
                                    >
                                        {tr.accessFieldLabel}
                                    </label>
                                    <div className="relative">
                                        <Input
                                            id="team-resource-access-key"
                                            type="password"
                                            placeholder={tr.keyPlaceholder}
                                            value={key}
                                            onChange={(e) => {
                                                setKey(e.target.value);
                                                setErrorMessage(null);
                                            }}
                                            onKeyDown={handleKeyDown}
                                            aria-invalid={!!errorMessage}
                                            className={cn(
                                                'h-14 rounded-2xl border-white/60 bg-white/[0.80] pl-12 pr-4 text-base shadow-sm transition-all focus-visible:ring-teal-500/20 dark:border-white/10 dark:bg-white/[0.08]',
                                                errorMessage && 'border-red-400/40 bg-red-500/5 focus-visible:ring-red-500/20'
                                            )}
                                            autoFocus
                                        />
                                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                                    </div>
                                    {errorMessage ? (
                                        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                                            {errorMessage}
                                        </div>
                                    ) : (
                                        <p className="text-xs leading-6 text-[var(--text-secondary)]">
                                            {tr.sessionTimeout}
                                        </p>
                                    )}
                                </div>

                                <Button
                                    className="h-14 w-full rounded-2xl border-0 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-base font-semibold text-white shadow-[0_18px_32px_rgba(14,165,233,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(14,165,233,0.30)]"
                                    onClick={handleUnlock}
                                    disabled={loading || !key.trim()}
                                >
                                    {loading ? (
                                        <>
                                            <Lock className="h-4 w-4 animate-pulse" />
                                            {tr.verifying}
                                        </>
                                    ) : (
                                        <>
                                            {tr.unlock}
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
