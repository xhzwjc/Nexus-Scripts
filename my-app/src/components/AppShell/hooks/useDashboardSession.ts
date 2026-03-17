'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
    clearScriptHubSession,
    persistScriptHubSession,
    requestScriptHubSession,
    validateStoredScriptHubSession,
} from '@/lib/auth';
import { allScripts } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import type { SystemConfig, User } from '@/lib/types';

const APP_LOCKED_STORAGE_KEY = 'app_is_locked';
const APP_LAST_ACTIVITY_STORAGE_KEY = 'app_last_activity';
const TEAM_RESOURCES_UNLOCKED_KEY = 'team_resources_unlocked';
const TEAM_RESOURCES_ADMIN_KEY = 'team_resources_admin';
const TEAM_RESOURCES_LAST_ACTIVITY_KEY = 'team_resources_last_activity';
const TEAM_RESOURCES_USER_ID_KEY = 'team_resources_user_id';
const AUTO_LOCK_MS = 5 * 60 * 60 * 1000;

interface UseDashboardSessionOptions {
    healthCheckCacheKey: string;
    onLogoutReset: () => void;
}

interface UseDashboardSessionResult {
    currentUser: User | null;
    userKey: string;
    systems: Record<string, SystemConfig>;
    isLoading: boolean;
    isVerifying: boolean;
    isLocked: boolean;
    lockKey: string;
    isFreshLogin: boolean;
    loginKeyInputRef: React.RefObject<HTMLInputElement | null>;
    lockKeyInputRef: React.RefObject<HTMLInputElement | null>;
    setUserKey: (value: string) => void;
    setLockKey: (value: string) => void;
    setIsLocked: React.Dispatch<React.SetStateAction<boolean>>;
    validateKey: () => void;
    handleUnlock: () => void;
    handleLock: () => void;
    logout: () => void;
}

function showInputValidationMessage(input: HTMLInputElement | null, message: string) {
    if (!input) return;

    input.setCustomValidity(message);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            input.focus();
            input.reportValidity();
        });
    });
}

export function useDashboardSession({
    healthCheckCacheKey,
    onLogoutReset,
}: UseDashboardSessionOptions): UseDashboardSessionResult {
    const { t } = useI18n();

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userKey, setUserKey] = useState('');
    const [systems, setSystems] = useState<Record<string, SystemConfig>>(allScripts);
    const [isLoading, setIsLoading] = useState(true);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [lockKey, setLockKey] = useState('');
    const [isFreshLogin, setIsFreshLogin] = useState(false);

    const loginKeyInputRef = useRef<HTMLInputElement>(null);
    const lockKeyInputRef = useRef<HTMLInputElement>(null);
    const lastActivityRef = useRef<number>(Date.now());

    const filterScripts = useCallback((user: User) => {
        const filtered = Object.fromEntries(
            Object.entries(allScripts).map(([key, system]) => [
                key,
                { ...system, scripts: system.scripts.filter((script) => user.permissions[script.id]) },
            ]),
        ) as typeof allScripts;

        setSystems(filtered);
    }, []);

    const logout = useCallback(() => {
        setCurrentUser(null);
        setUserKey('');
        setLockKey('');
        setIsFreshLogin(false);
        setSystems(allScripts);
        clearScriptHubSession();
        localStorage.removeItem(APP_LOCKED_STORAGE_KEY);
        localStorage.removeItem(APP_LAST_ACTIVITY_STORAGE_KEY);
        sessionStorage.removeItem(TEAM_RESOURCES_UNLOCKED_KEY);
        sessionStorage.removeItem(TEAM_RESOURCES_ADMIN_KEY);
        sessionStorage.removeItem(TEAM_RESOURCES_LAST_ACTIVITY_KEY);
        sessionStorage.removeItem(TEAM_RESOURCES_USER_ID_KEY);
        sessionStorage.removeItem('health_check_result');
        sessionStorage.removeItem(healthCheckCacheKey);
        onLogoutReset();
    }, [healthCheckCacheKey, onLogoutReset]);

    useEffect(() => {
        const savedLocked = localStorage.getItem(APP_LOCKED_STORAGE_KEY) === 'true';
        if (savedLocked) {
            setIsLocked(true);
        }

        const savedLastActivity = localStorage.getItem(APP_LAST_ACTIVITY_STORAGE_KEY);
        if (!savedLastActivity) {
            return;
        }

        const parsedTime = parseInt(savedLastActivity, 10);
        if (!Number.isNaN(parsedTime)) {
            lastActivityRef.current = parsedTime;
            if (Date.now() - parsedTime > AUTO_LOCK_MS) {
                setIsLocked(true);
            }
        }
    }, []);

    useEffect(() => {
        if (isLocked) {
            localStorage.setItem(APP_LOCKED_STORAGE_KEY, 'true');
        } else {
            localStorage.removeItem(APP_LOCKED_STORAGE_KEY);
        }
    }, [isLocked]);

    useEffect(() => {
        let mounted = true;

        void (async () => {
            const session = await validateStoredScriptHubSession();
            if (!mounted) {
                return;
            }

            if (session) {
                setCurrentUser(session.user);
                setUserKey(session.user.id || '');
                filterScripts(session.user);
            }

            setIsLoading(false);
        })();

        return () => {
            mounted = false;
        };
    }, [filterScripts]);

    useEffect(() => {
        if (!currentUser) {
            return;
        }

        const updateActivity = () => {
            lastActivityRef.current = Date.now();
        };

        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);

        const lockTimer = setInterval(() => {
            localStorage.setItem(APP_LAST_ACTIVITY_STORAGE_KEY, lastActivityRef.current.toString());
            if (Date.now() - lastActivityRef.current > AUTO_LOCK_MS && !isLocked) {
                setIsLocked(true);
                toast.info(t.lock.autoLockMessage);
            }
        }, 60000);

        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            clearInterval(lockTimer);
        };
    }, [currentUser, isLocked, t.lock.autoLockMessage]);

    const validateKey = useCallback(() => {
        const input = userKey.trim();

        if (!input) {
            showInputValidationMessage(loginKeyInputRef.current, t.auth.enterKey);
            return;
        }

        if (loginKeyInputRef.current) {
            loginKeyInputRef.current.setCustomValidity('');
        }

        setIsVerifying(true);
        void (async () => {
            try {
                const session = await requestScriptHubSession(input);
                persistScriptHubSession(session);
                setCurrentUser(session.user);
                setUserKey(session.user.id || '');
                filterScripts(session.user);
                setIsLocked(false);
                setIsFreshLogin(true);
                lastActivityRef.current = Date.now();
                localStorage.setItem(APP_LAST_ACTIVITY_STORAGE_KEY, lastActivityRef.current.toString());
                toast.success(t.auth.verifySuccess);
            } catch {
                showInputValidationMessage(loginKeyInputRef.current, t.auth.invalidKey);
            } finally {
                setIsVerifying(false);
            }
        })();
    }, [filterScripts, t.auth.enterKey, t.auth.invalidKey, t.auth.verifySuccess, userKey]);

    const handleUnlock = useCallback(() => {
        const input = lockKey.trim();

        if (lockKeyInputRef.current) {
            lockKeyInputRef.current.setCustomValidity('');
        }

        if (!input) {
            showInputValidationMessage(lockKeyInputRef.current, t.lock.emptyKey);
            return;
        }

        void (async () => {
            try {
                const session = await requestScriptHubSession(input);
                if (session.user.id !== currentUser?.id) {
                    showInputValidationMessage(lockKeyInputRef.current, t.lock.wrongAccount);
                    return;
                }

                persistScriptHubSession(session);
                setIsLocked(false);
                setLockKey('');
                setUserKey(session.user.id || '');
                lastActivityRef.current = Date.now();
                localStorage.setItem(APP_LAST_ACTIVITY_STORAGE_KEY, lastActivityRef.current.toString());
                toast.success(t.lock.unlockSuccess);
            } catch {
                showInputValidationMessage(lockKeyInputRef.current, t.lock.wrongKey);
            }
        })();
    }, [
        currentUser?.id,
        lockKey,
        t.lock.emptyKey,
        t.lock.unlockSuccess,
        t.lock.wrongAccount,
        t.lock.wrongKey,
    ]);

    const handleLock = useCallback(() => {
        setIsLocked(true);
        setLockKey('');
    }, []);

    return {
        currentUser,
        userKey,
        systems,
        isLoading,
        isVerifying,
        isLocked,
        lockKey,
        isFreshLogin,
        loginKeyInputRef,
        lockKeyInputRef,
        setUserKey,
        setLockKey,
        setIsLocked,
        validateKey,
        handleUnlock,
        handleLock,
        logout,
    };
}
