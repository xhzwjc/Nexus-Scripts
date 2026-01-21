import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ResourceLock } from './ResourceLock';
import { ResourceViewer } from './ResourceViewer';
import { ResourceEditor } from './ResourceEditor';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResourceGroup, INITIAL_RESOURCE_DATA, ENCRYPTION_KEY } from '@/lib/team-resources-data';
import CryptoJS from 'crypto-js';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

// 30分钟超时（毫秒）
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface TeamResourcesContainerProps {
    onBack: () => void;
}

export function TeamResourcesContainer({ onBack }: TeamResourcesContainerProps) {
    const { t } = useI18n();
    const tr = t.teamResources;
    const [isLocked, setIsLocked] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [data, setData] = useState<ResourceGroup[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null); // 新增：加载错误状态
    const lastActivityRef = useRef<number>(Date.now());

    // 检查会话是否过期
    const checkSessionExpiry = useCallback(() => {
        const lastActivity = sessionStorage.getItem('team_resources_last_activity');
        if (!lastActivity) return true; // 没有记录，需要重新登录

        const lastTime = parseInt(lastActivity, 10);
        if (isNaN(lastTime)) return true;

        return Date.now() - lastTime > SESSION_TIMEOUT_MS;
    }, []);

    // 更新最后活动时间
    const updateActivity = useCallback(() => {
        const now = Date.now();
        lastActivityRef.current = now;
        sessionStorage.setItem('team_resources_last_activity', now.toString());
    }, []);

    // 加载数据
    useEffect(() => {
        let isMounted = true; // 追踪组件是否已挂载
        const controller = new AbortController();
        let isTimeout = false; // 追踪是否是超时导致的abort

        const timeoutId = setTimeout(() => {
            isTimeout = true;
            controller.abort();
        }, 120000); // 120秒超时，解决远程访问慢的问题

        const loadData = async () => {
            try {
                setLoadError(null);
                const res = await fetch('/api/resources/data', { signal: controller.signal });
                const json = await res.json();

                if (!isMounted) return; // 组件已卸载，不更新状态

                if (json.encrypted) {
                    // 解密数据
                    const bytes = CryptoJS.AES.decrypt(json.encrypted, ENCRYPTION_KEY);
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    if (decrypted) {
                        setData(JSON.parse(decrypted));
                    } else {
                        // 解密失败，使用初始数据
                        setData(INITIAL_RESOURCE_DATA);
                    }
                } else {
                    // 无数据，使用初始数据
                    setData(INITIAL_RESOURCE_DATA);
                }
            } catch (error) {
                if (!isMounted) return; // 组件已卸载，不更新状态

                console.error('Failed to load resources:', error);
                // 只有真正的超时才显示错误，组件卸载导致的abort忽略
                if (error instanceof Error && error.name === 'AbortError' && isTimeout) {
                    setLoadError('网络超时，请检查网络连接后重试');
                } else if (!(error instanceof Error && error.name === 'AbortError')) {
                    // 非abort错误，使用初始数据
                    setData(INITIAL_RESOURCE_DATA);
                }
            } finally {
                clearTimeout(timeoutId);
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };
        // 检查会话状态（带超时验证）
        const sessionUnlocked = sessionStorage.getItem('team_resources_unlocked');
        const sessionAdmin = sessionStorage.getItem('team_resources_admin');

        if (sessionUnlocked === 'true' && !checkSessionExpiry()) {
            setIsLocked(false);
            setIsAdmin(sessionAdmin === 'true');
            updateActivity(); // 刷新活动时间
        } else {
            // 清理过期会话
            sessionStorage.removeItem('team_resources_unlocked');
            sessionStorage.removeItem('team_resources_admin');
            sessionStorage.removeItem('team_resources_last_activity');
        }

        loadData();

        return () => {
            isMounted = false;
            controller.abort();
            clearTimeout(timeoutId);
        };
    }, [checkSessionExpiry, updateActivity]);

    // 监听用户活动，更新最后活动时间
    useEffect(() => {
        if (isLocked) return;

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        const handleActivity = () => updateActivity();

        events.forEach(event => window.addEventListener(event, handleActivity));

        // 定时检查是否超时
        const intervalId = setInterval(() => {
            if (checkSessionExpiry()) {
                handleLock();
                toast.info(tr.sessionTimeout);
            }
        }, 60000); // 每分钟检查一次

        return () => {
            events.forEach(event => window.removeEventListener(event, handleActivity));
            clearInterval(intervalId);
        };
    }, [isLocked, checkSessionExpiry, updateActivity, tr.sessionTimeout]);

    const handleUnlock = (admin: boolean) => {
        setIsLocked(false);
        setIsAdmin(admin);
        sessionStorage.setItem('team_resources_unlocked', 'true');
        sessionStorage.setItem('team_resources_admin', admin ? 'true' : 'false');
        updateActivity();
    };

    const handleLock = () => {
        setIsLocked(true);
        setIsAdmin(false);
        sessionStorage.removeItem('team_resources_unlocked');
        sessionStorage.removeItem('team_resources_admin');
        sessionStorage.removeItem('team_resources_last_activity');
    };

    const handleSave = async (updatedGroups: ResourceGroup[]) => {
        try {
            // 加密数据
            const jsonStr = JSON.stringify(updatedGroups);
            const encrypted = CryptoJS.AES.encrypt(jsonStr, ENCRYPTION_KEY).toString();

            // 保存到后端
            const res = await fetch('/api/resources/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ encrypted })
            });

            if (res.ok) {
                setData(updatedGroups);
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

    // 加载中或加载错误
    if (isLoading || loadError) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4">
                {isLoading ? (
                    <div className="text-slate-500">{tr.loading}</div>
                ) : (
                    <>
                        <div className="text-red-500">{loadError}</div>
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            重新加载
                        </Button>
                    </>
                )}
            </div>
        );
    }

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

    if (isEditing) {
        return (
            <ResourceEditor
                groups={data}
                onCancel={() => setIsEditing(false)}
                onSave={handleSave}
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
            />
        </div>
    );
}
