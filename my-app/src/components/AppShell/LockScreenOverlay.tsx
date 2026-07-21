'use client';

import { ChevronRight, Loader2 } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '@/lib/i18n';

interface LockScreenOverlayProps {
    currentUserName?: string;
    lockKey: string;
    lockKeyInputRef: React.RefObject<HTMLInputElement | null>;
    setLockKey: (value: string) => void;
    onUnlock: () => void;
    onSwitchAccount: () => void;
    isUnlocking?: boolean;
}

export function LockScreenOverlay({
    currentUserName,
    lockKey,
    lockKeyInputRef,
    setLockKey,
    onUnlock,
    onSwitchAccount,
    isUnlocking = false,
}: LockScreenOverlayProps) {
    const { t } = useI18n();

    // 页面保活：锁屏期间用 rAF 心跳防止浏览器降频
    const rafRef = useRef<number>(0);
    useEffect(() => {
        const tick = () => {
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
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
                        onKeyDown={(event) => event.key === 'Enter' && !isUnlocking && onUnlock()}
                        className="transition-all"
                        disabled={isUnlocking}
                    />
                    <button onClick={onUnlock} disabled={isUnlocking}>
                        {isUnlocking ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {t.lock.unlockButton}
                                <ChevronRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>

                <button
                    className="mt-8 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors active:scale-95 transform"
                    onClick={onSwitchAccount}
                    disabled={isUnlocking}
                >
                    {t.lock.switchAccount}
                </button>
            </div>
        </div>,
        document.body,
    );
}
