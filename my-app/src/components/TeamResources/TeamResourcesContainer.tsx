import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ResourceLock } from './ResourceLock';
import { ResourceViewer } from './ResourceViewer';
import { ResourceEditor } from './ResourceEditor';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResourceGroup, INITIAL_RESOURCE_DATA } from '@/lib/team-resources-data';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { TeamResourceSkeleton } from './TeamResourceSkeleton';
import { authenticatedFetch, getStoredScriptHubSession } from '@/lib/auth';


// 30分钟超时（毫秒）
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const TEAM_RESOURCES_UNLOCKED_KEY = 'team_resources_unlocked';
const TEAM_RESOURCES_ADMIN_KEY = 'team_resources_admin';
const TEAM_RESOURCES_LAST_ACTIVITY_KEY = 'team_resources_last_activity';
const TEAM_RESOURCES_USER_ID_KEY = 'team_resources_user_id';

interface TeamResourcesContainerProps {
    onBack: () => void;
}

function getCurrentTeamResourceSessionContext() {
    if (typeof window === 'undefined') {
        return {
            userId: null as string | null,
            canView: false,
            canManage: false,
            canHealthCheck: false,
        };
    }

    const session = getStoredScriptHubSession();
    return {
        userId: session?.user.id ?? null,
        canView: !!session?.user.permissions?.['team-resources'],
        canManage: !!session?.user.permissions?.['team-resources-manage'],
        canHealthCheck: !!session?.user.permissions?.['cert-health'],
    };
}

function clearTeamResourceSessionStorage() {
    if (typeof window === 'undefined') return;

    sessionStorage.removeItem(TEAM_RESOURCES_UNLOCKED_KEY);
    sessionStorage.removeItem(TEAM_RESOURCES_ADMIN_KEY);
    sessionStorage.removeItem(TEAM_RESOURCES_LAST_ACTIVITY_KEY);
    sessionStorage.removeItem(TEAM_RESOURCES_USER_ID_KEY);
}

export function TeamResourcesContainer({ onBack }: TeamResourcesContainerProps) {
    const { t } = useI18n();
    const tr = t.teamResources;

    // 检查会话是否有效
    const isSessionValid = useCallback(() => {
        if (typeof window === 'undefined') return false;
        const { userId, canView } = getCurrentTeamResourceSessionContext();
        const storedUserId = sessionStorage.getItem(TEAM_RESOURCES_USER_ID_KEY);
        const lastActivity = sessionStorage.getItem(TEAM_RESOURCES_LAST_ACTIVITY_KEY);
        const sessionUnlocked = sessionStorage.getItem(TEAM_RESOURCES_UNLOCKED_KEY);

        if (!canView || !userId || storedUserId !== userId) return false;
        if (sessionUnlocked !== 'true') return false;
        if (!lastActivity) return false;

        const lastTime = parseInt(lastActivity, 10);
        if (isNaN(lastTime)) return false;

        return Date.now() - lastTime <= SESSION_TIMEOUT_MS;
    }, []);

    const [isLocked, setIsLocked] = useState(() => !isSessionValid());
    const [isAdmin, setIsAdmin] = useState(() => {
        if (typeof window === 'undefined') return false;
        const { userId, canManage } = getCurrentTeamResourceSessionContext();
        return (
            canManage &&
            !!userId &&
            sessionStorage.getItem(TEAM_RESOURCES_USER_ID_KEY) === userId &&
            sessionStorage.getItem(TEAM_RESOURCES_ADMIN_KEY) === 'true'
        );
    });

    const [data, setData] = useState<ResourceGroup[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null); // 新增：加载错误状态
    const [logoVersion, setLogoVersion] = useState(Date.now()); // 新增：用于刷新 Logo 缓存的标识
    const lastActivityRef = useRef<number>(Date.now());

    // 更新最后活动时间
    const updateActivity = useCallback(() => {
        const now = Date.now();
        lastActivityRef.current = now;
        sessionStorage.setItem(TEAM_RESOURCES_LAST_ACTIVITY_KEY, now.toString());
    }, []);

    useEffect(() => {
        const { userId, canView, canManage } = getCurrentTeamResourceSessionContext();
        const valid = isSessionValid();

        if (!canView || !userId || !valid) {
            clearTeamResourceSessionStorage();
            setIsLocked(true);
            setIsAdmin(false);
            return;
        }

        setIsLocked(false);
        setIsAdmin(
            canManage &&
            sessionStorage.getItem(TEAM_RESOURCES_ADMIN_KEY) === 'true' &&
            sessionStorage.getItem(TEAM_RESOURCES_USER_ID_KEY) === userId
        );
    }, [isSessionValid]);

    // 加载数据
    useEffect(() => {
        if (isLocked) return;

        let isMounted = true; // 追踪组件是否已挂载
        const controller = new AbortController();
        let isTimeout = false; // 追踪是否是超时导致的abort

        const timeoutId = setTimeout(() => {
            isTimeout = true;
            controller.abort();
        }, 20000); // 20秒超时

        const loadData = async () => {
            try {
                setLoadError(null);
                // 通过 Next.js API 路由获取数据
                const res = await authenticatedFetch('/api/team-resources/data', { signal: controller.signal });
                const json = await res.json();

                if (!isMounted) return;

                if (!res.ok) {
                    throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to load team resources');
                }

                if (json.success && Array.isArray(json.data)) {
                    setData(json.data);
                } else {
                    throw new Error('Invalid team resources response');
                }
            } catch (error) {
                if (!isMounted) return;

                console.error('Failed to load resources:', error);
                if (error instanceof Error && error.name === 'AbortError' && isTimeout) {
                    setLoadError(tr.networkTimeout);
                } else if (!(error instanceof Error && error.name === 'AbortError')) {
                    setData(INITIAL_RESOURCE_DATA);
                    setLoadError(error instanceof Error ? error.message : tr.loadError);
                }
            } finally {
                clearTimeout(timeoutId);
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        // 仅负责清理旧会话，状态初始化已经由 useState 完成
        if (!isLocked) {
            updateActivity();
        }

        loadData();

        return () => {
            isMounted = false;
            controller.abort();
            clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLocked, updateActivity]);

    // 监听用户活动，更新最后活动时间
    useEffect(() => {
        if (isLocked) return;

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        const handleActivity = () => updateActivity();

        events.forEach(event => window.addEventListener(event, handleActivity));

        // 定时检查是否超时
        const intervalId = setInterval(() => {
            if (!isSessionValid()) {
                handleLock();
                toast.info(tr.sessionTimeout);
            }
        }, 60000); // 每分钟检查一次

        return () => {
            events.forEach(event => window.removeEventListener(event, handleActivity));
            clearInterval(intervalId);
        };
    }, [isLocked, updateActivity, tr.sessionTimeout, isSessionValid]);

    const handleUnlock = (admin: boolean) => {
        const { userId, canManage } = getCurrentTeamResourceSessionContext();
        setIsLocked(false);
        setIsAdmin(admin && canManage);
        sessionStorage.setItem(TEAM_RESOURCES_UNLOCKED_KEY, 'true');
        sessionStorage.setItem(TEAM_RESOURCES_ADMIN_KEY, admin && canManage ? 'true' : 'false');
        if (userId) {
            sessionStorage.setItem(TEAM_RESOURCES_USER_ID_KEY, userId);
        }
        updateActivity();
    };

    const handleLock = () => {
        setIsLocked(true);
        setIsAdmin(false);
        clearTeamResourceSessionStorage();
    };

    const handleSave = async (updatedGroups: ResourceGroup[]) => {
        try {
            // 通过 Next.js API 路由保存数据
            const res = await authenticatedFetch('/api/team-resources/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groups: updatedGroups })
            });

            if (res.ok) {
                setData(updatedGroups);
                setLogoVersion(Date.now()); // 更新 Logo 版本，强制刷新图片
                setIsEditing(false);
                toast.success(tr.saveSuccess);
            } else {
                throw new Error('Save failed');
            }
        } catch (error) {
            console.error('Failed to save:', error);
            toast.error(tr.saveFail);
        }
    };

    if (isLocked) {
        return (
            <div className="relative h-full bg-[var(--page-bg)] p-6">
                <Button
                    variant="ghost"
                    onClick={onBack}
                    className="absolute top-6 left-6 z-10 gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {tr.back}
                </Button>
                <ResourceLock onUnlock={handleUnlock} />
            </div>
        );
    }

    // 加载中或加载错误
    if (isLoading || loadError) {
        if (isLoading) {
            return <TeamResourceSkeleton />;
        }
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4">
                <div className="text-red-500">{loadError}</div>
                <Button variant="outline" onClick={() => window.location.reload()}>
                    {tr.reload}
                </Button>
            </div>
        );
    }

    if (isEditing) {
        return (
            <ResourceEditor
                groups={data}
                onCancel={() => setIsEditing(false)}
                onSave={handleSave}
                logoVersion={logoVersion}
            />
        );
    }

    return (
        <div className="h-full flex flex-col">
            <ResourceViewer
                data={data}
                onBack={onBack}
                onLock={handleLock}
                onManage={() => setIsEditing(true)}
                isAdmin={isAdmin}
                canHealthCheck={getCurrentTeamResourceSessionContext().canHealthCheck}
                logoVersion={logoVersion}
            />
        </div>
    );
}
