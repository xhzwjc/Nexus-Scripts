import React, { useState } from 'react';
import { Lock, Key, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ACCESS_KEYS } from '@/lib/team-resources-data';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

interface ResourceLockProps {
    onUnlock: (isAdmin: boolean) => void;
}

export function ResourceLock({ onUnlock }: ResourceLockProps) {
    const { t } = useI18n();
    const tr = t.teamResources;
    const [key, setKey] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleUnlock = () => {
        if (!key) return;
        setLoading(true);
        setError(false);

        // 验证密钥
        setTimeout(() => {
            if (ACCESS_KEYS.includes(key)) {
                toast.success(tr.verifySuccess);
                // wjc 是管理员密钥
                const isAdmin = key === 'wjc';
                onUnlock(isAdmin);
            } else {
                setError(true);
                toast.error(tr.invalidKey);
            }
            setLoading(false);
        }, 300);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleUnlock();
    };

    return (
        <div className="flex items-center justify-center h-full min-h-[60vh] animate-in zoom-in-95 duration-500">
            <Card className="w-full max-w-md p-8 bg-white/80 backdrop-blur-md shadow-xl border-slate-200">
                <div className="flex flex-col items-center gap-6">
                    <div className={`p-4 rounded-full bg-slate-50 transition-colors duration-300 ${error ? 'bg-red-50' : ''}`}>
                        {error ? (
                            <Lock className="w-8 h-8 text-red-500" />
                        ) : (
                            <Key className="w-8 h-8 text-blue-600" />
                        )}
                    </div>

                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold text-slate-800">{tr.title}</h2>
                        <p className="text-slate-500 text-sm">
                            {tr.lockDescription}
                        </p>
                    </div>

                    <div className="w-full space-y-4">
                        <div className="relative">
                            <Input
                                type="password"
                                placeholder={tr.keyPlaceholder}
                                value={key}
                                onChange={(e) => { setKey(e.target.value); setError(false); }}
                                onKeyDown={handleKeyDown}
                                className={`pl-10 h-11 text-lg transition-all ${error ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
                                autoFocus
                            />
                            <Lock className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                        </div>

                        <Button
                            className="w-full h-11 text-base font-medium bg-blue-600 hover:bg-blue-700 transition-all"
                            onClick={handleUnlock}
                            disabled={loading || !key}
                        >
                            {loading ? tr.verifying : tr.unlock}
                            {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
