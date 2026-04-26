'use client';

import { ChevronRight } from 'lucide-react';
import React from 'react';

import { useI18n } from '@/lib/i18n';

interface LockScreenOverlayProps {
    currentUserName?: string;
    lockKey: string;
    lockKeyInputRef: React.RefObject<HTMLInputElement | null>;
    setLockKey: (value: string) => void;
    onUnlock: () => void;
    onSwitchAccount: () => void;
}

export function LockScreenOverlay({
    currentUserName,
    lockKey,
    lockKeyInputRef,
    setLockKey,
    onUnlock,
    onSwitchAccount,
}: LockScreenOverlayProps) {
    const { t } = useI18n();

    return (
        <div className="lock-screen z-[2147483647] animate-sunlight-reveal" aria-modal="true" role="dialog">
            <div className="lock-avatar">
                {currentUserName?.charAt(0) || 'U'}
            </div>

            <div className="lock-user-info">
                <h2>{currentUserName}</h2>
                <p>{t.lock.description}</p>
            </div>

            <div className="lock-input-group">
                <div className="lock-input-wrapper">
                    <input
                        ref={lockKeyInputRef}
                        type="password"
                        placeholder={t.lock.unlockPlaceholder}
                        value={lockKey}
                        onChange={(event) => {
                            setLockKey(event.target.value);
                            if (lockKeyInputRef.current) {
                                lockKeyInputRef.current.setCustomValidity('');
                            }
                        }}
                        onKeyDown={(event) => event.key === 'Enter' && onUnlock()}
                        className="transition-all"
                    />
                    <button onClick={onUnlock}>
                        {t.lock.unlockButton}
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <button
                    className="mt-8 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors active:scale-95 transform"
                    onClick={onSwitchAccount}
                >
                    {t.lock.switchAccount}
                </button>
            </div>
        </div>
    );
}
