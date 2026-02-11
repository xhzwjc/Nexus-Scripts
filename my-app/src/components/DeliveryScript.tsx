import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription } from './ui/card';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

import { Badge } from './ui/badge';
import {
    ArrowLeft, Loader2, Upload, File as FileIcon, X, CheckCircle, AlertCircle,
    Image as ImageIcon, User, ChevronRight, ChevronDown, LogOut, RefreshCw, Sparkles
} from 'lucide-react';
import { getApiBaseUrl } from '../lib/api';
import { useI18n } from '@/lib/i18n';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Separator } from './ui/separator';

interface DeliveryScriptProps {
    onBack: () => void;
}

// Data Interfaces
interface Task {
    taskId: string;
    taskName: string;
    taskDesc: string;
    status: number;
    myStatus: number;
    minCost: string;
    maxCost: string;
    enterpriseName: string | null;
    taskType: number;
    taskStaffId: string;
    taskAssignId: string;
}

interface UserData {
    mobile: string;
    token: string;
    realname: string;
    tasks: Task[];
    loading?: boolean;
}

interface Attachment {
    fileName: string;
    tempPath: string;
    fileType: string;
    uploadTime: number;
    fileLength: number;
    isPic: number;
    isWx: number;
    filePath: string;
    uploading?: boolean;
    error?: string;
    fileObj?: File;
    previewUrl?: string;
}

interface FormDraft {
    reportName: string;
    reportContent: string;
    reportAddress: string;
    supplement: string;
    attachments: Attachment[];
}

export default function DeliveryScript({ onBack }: DeliveryScriptProps) {
    const apiBaseUrl = getApiBaseUrl();
    const { t } = useI18n();
    const dt = t.scripts.delivery;
    const dm = dt.messages;

    // -- Global State --
    const [step, setStep] = useState<'login' | 'process'>('login');
    const [environment, setEnvironment] = useState('prod');

    // -- Login State --
    const [mobileInput, setMobileInput] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // -- Process State --
    const [users, setUsers] = useState<UserData[]>([]);
    const [drafts, setDrafts] = useState<Record<string, FormDraft>>({});

    // Selection
    const [expandedUserMobiles, setExpandedUserMobiles] = useState<string[]>([]);
    const [activeTaskAssignId, setActiveTaskAssignId] = useState<string | null>(null);
    const [activeUserMobile, setActiveUserMobile] = useState<string | null>(null);

    // -- Current Task/User Helpers --
    const activeUser = users.find(u => u.mobile === activeUserMobile);

    // Composite key for drafts: mobile_taskAssignId
    const draftKey = (activeUser && activeTaskAssignId) ? `${activeUser.mobile}_${activeTaskAssignId}` : null;

    const activeTask = activeUser?.tasks.find(t => t.taskAssignId === activeTaskAssignId);
    const currentDraft = draftKey ? drafts[draftKey] : null;

    // -- Submitting State --
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Keep track of drafts for cleanup
    const draftsRef = useRef<Record<string, FormDraft>>({});
    useEffect(() => {
        draftsRef.current = drafts;
    }, [drafts]);

    // Cleanup preview URLs on unmount
    useEffect(() => {
        return () => {
            Object.values(draftsRef.current).forEach(draft => {
                draft.attachments.forEach(a => {
                    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
                });
            });
        };
    }, []);

    // -------------------------------------------------------------------------
    // Login Logic
    // -------------------------------------------------------------------------
    const handleLogin = async () => {
        // Parse mobiles: support comma, newline, space
        const rawMobiles = mobileInput
            .split(/[\n,，\s]+/)
            .map(s => s.trim())
            .filter(s => /^\d{11}$/.test(s));

        const uniqueMobiles = Array.from(new Set(rawMobiles));

        if (uniqueMobiles.length === 0) {
            toast.error(dm.mobileInvalid);
            return;
        }

        setIsLoggingIn(true);
        const newUsers: UserData[] = [];
        const BATCH_SIZE = 5;

        try {
            // Process in batches to balance speed and server load
            for (let i = 0; i < uniqueMobiles.length; i += BATCH_SIZE) {
                const batch = uniqueMobiles.slice(i, i + BATCH_SIZE);

                const batchResults = await Promise.all(batch.map(async (mobile) => {
                    try {
                        // 1. Login
                        const loginRes = await axios.post(`${apiBaseUrl}/delivery/login`, {
                            mobile, environment, code: '987654'
                        });

                        if (!loginRes.data.success) {
                            return { error: dm.loginFailed.replace('{mobile}', mobile).replace('{msg}', loginRes.data.msg) };
                        }

                        const token = loginRes.data.token;

                        // 2. Get Worker Info and Tasks in parallel
                        const [infoRes, taskRes] = await Promise.allSettled([
                            axios.post(`${apiBaseUrl}/delivery/worker-info`, { environment, token }),
                            axios.post(`${apiBaseUrl}/delivery/tasks`, { environment, token, status: 0 })
                        ]);

                        let realname = mobile;
                        if (infoRes.status === 'fulfilled' && infoRes.value.data && infoRes.value.data.code === 0 && infoRes.value.data.data) {
                            realname = infoRes.value.data.data.realname || mobile;
                        }

                        let userTasks: Task[] = [];
                        if (taskRes.status === 'fulfilled' && taskRes.value.data && taskRes.value.data.code === 0 && taskRes.value.data.data?.list) {
                            userTasks = (taskRes.value.data.data.list as Task[]).filter(t => t.myStatus === 4 && !t.taskName?.includes('【测试'));
                        }

                        return {
                            user: {
                                mobile,
                                token,
                                realname,
                                tasks: userTasks
                            }
                        };
                    } catch (e) {
                        console.error(`Process mobile ${mobile} failed`, e);
                        return { error: dm.processError.replace('{mobile}', mobile) };
                    }
                }));

                // Collect results and show errors
                batchResults.forEach(res => {
                    if (res.user) {
                        newUsers.push(res.user);
                    } else if (res.error) {
                        toast.error(res.error);
                    }
                });
            }

            if (newUsers.length > 0) {
                setUsers(newUsers);
                setStep('process');

                // 只展开有任务的用户
                const usersWithTasks = newUsers.filter(u => u.tasks.length > 0);
                setExpandedUserMobiles(usersWithTasks.map(u => u.mobile));

                // 选中第一个有任务的用户的第一个任务
                const firstUserWithTasks = newUsers.find(u => u.tasks.length > 0);
                if (firstUserWithTasks) {
                    const tId = firstUserWithTasks.tasks[0].taskAssignId;
                    setActiveTaskAssignId(tId);
                    setActiveUserMobile(firstUserWithTasks.mobile);
                    // Initialize draft
                    initDraft(firstUserWithTasks.mobile, tId);
                }

                toast.success(dm.loginSuccess.replace('{count}', String(newUsers.length)));
            } else {
                toast.error(dm.noLogin);
            }

        } finally {
            setIsLoggingIn(false);
        }
    };

    // Refresh Logic (Silent update using existing tokens)
    const handleRefreshTasks = async () => {
        if (users.length === 0) return;
        setIsLoggingIn(true);

        try {
            const updatedUsers = [...users];
            let successCount = 0;
            const BATCH_SIZE = 5;

            for (let i = 0; i < updatedUsers.length; i += BATCH_SIZE) {
                const batchIndices = Array.from({ length: Math.min(BATCH_SIZE, updatedUsers.length - i) }, (_, idx) => i + idx);

                await Promise.all(batchIndices.map(async (idx) => {
                    const user = updatedUsers[idx];
                    try {
                        const taskRes = await axios.post(`${apiBaseUrl}/delivery/tasks`, {
                            environment, token: user.token, status: 0
                        });
                        if (taskRes.data && taskRes.data.code === 0 && taskRes.data.data?.list) {
                            // Filter myStatus=4
                            const newTasks = (taskRes.data.data.list as Task[]).filter(t => t.myStatus === 4);
                            updatedUsers[idx] = { ...user, tasks: newTasks };
                            successCount++;
                        }
                    } catch (e) {
                        console.error(`Refresh tasks failed for ${user.mobile}`, e);
                    }
                }));
            }

            setUsers(updatedUsers);
            toast.success(dm.refreshSuccess.replace('{count}', String(successCount)).replace('{total}', String(updatedUsers.length)));

        } finally {
            setIsLoggingIn(false);
        }
    };

    const initDraft = (mobile: string, taskAssignId: string) => {
        const key = `${mobile}_${taskAssignId}`;
        setDrafts(prev => {
            if (prev[key]) return prev;
            return {
                ...prev,
                [key]: {
                    reportName: '',
                    reportContent: '',
                    reportAddress: '',
                    supplement: '',
                    attachments: []
                }
            };
        });
    };

    // -------------------------------------------------------------------------
    // Draft / Form Manipulation
    // -------------------------------------------------------------------------
    const updateDraft = (key: string, field: keyof FormDraft, value: FormDraft[keyof FormDraft]) => {
        setDrafts(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [field]: value
            }
        }));
    };

    const toggleUserExpand = (mobile: string) => {
        setExpandedUserMobiles(prev => {
            if (prev.includes(mobile)) return prev.filter(m => m !== mobile);
            return [...prev, mobile];
        });
    };

    const handleSelectTask = (userMobile: string, taskAssignId: string) => {
        // Ensure user is expanded
        if (!expandedUserMobiles.includes(userMobile)) {
            setExpandedUserMobiles(prev => [...prev, userMobile]);
        }
        setActiveUserMobile(userMobile);
        setActiveTaskAssignId(taskAssignId);
        initDraft(userMobile, taskAssignId);
        setShowValidation(false);
    };

    // -------------------------------------------------------------------------
    // File Upload Logic (Adapted for Multi-User)
    // -------------------------------------------------------------------------
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isPic: boolean) => {
        if (!activeTaskAssignId || !activeUser || !currentDraft || !draftKey) return;

        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Current draft attachments
        const currentAtts = currentDraft.attachments;
        const currentPics = currentAtts.filter(a => a.isPic === 1).length;
        const currentFiles = currentAtts.filter(a => a.isPic === 0).length;

        const newAttachments: Attachment[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > 10 * 1024 * 1024) {
                toast.error(dm.fileSizeLimit.replace('{name}', file.name));
                continue;
            }
            if (isPic && (currentPics + newAttachments.filter(a => a.isPic === 1).length >= 9)) {
                toast.error(dm.picLimit);
                break;
            }
            if (!isPic && (currentFiles + newAttachments.filter(a => a.isPic === 0).length >= 6)) {
                toast.error(dm.fileLimit);
                break;
            }

            newAttachments.push({
                fileName: file.name,
                tempPath: '',
                fileType: '.' + file.name.split('.').pop()?.toLowerCase(),
                uploadTime: Date.now(),
                fileLength: file.size,
                isPic: isPic ? 1 : 0,
                isWx: 0,
                filePath: '',
                uploading: true,
                fileObj: file,
                previewUrl: isPic ? URL.createObjectURL(file) : undefined
            });
        }

        // Add to draft immediately
        const updatedList = [...currentAtts, ...newAttachments];
        updateDraft(draftKey, 'attachments', updatedList);

        // Upload triggers
        // NOTE: We need to use the token of the *Active User*
        for (const item of newAttachments) {
            await uploadSingleFile(item, activeUser.token, draftKey);
        }
        e.target.value = '';
    };

    const uploadSingleFile = async (item: Attachment, userToken: string, dKey: string) => {
        if (!item.fileObj) return;
        const formData = new FormData();
        formData.append('environment', environment);
        formData.append('token', userToken);
        formData.append('file', item.fileObj);

        try {
            const res = await axios.post(`${apiBaseUrl}/delivery/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data && res.data.code === 0) {
                let finalPath = '';
                if (typeof res.data.data === 'string') {
                    finalPath = res.data.data;
                } else if (typeof res.data.data === 'object') {
                    finalPath = res.data.data.fileName || res.data.data.url || '';
                }

                // Update draft state async
                setDrafts(prev => {
                    const draft = prev[dKey];
                    if (!draft) return prev;

                    const newAtts = draft.attachments.map(a => {
                        // Match by reference or some ID. Using reference here since `item` is from scope.
                        // Ideally we generate a clean ID, but object ref works if unchanged.
                        // BUT: `item` is from `newAttachments` array which we pushed.
                        // We need to match it in the *current state*.
                        // A safer way is to match by uploadTime + fileName + fileLength
                        if (a.uploadTime === item.uploadTime && a.fileName === item.fileName) {
                            return { ...a, uploading: false, filePath: finalPath, tempPath: finalPath };
                        }
                        return a;
                    });
                    return { ...prev, [dKey]: { ...draft, attachments: newAtts } };
                });
                toast.success(dm.uploadSuccess.replace('{name}', item.fileName));
            } else {
                throw new Error(res.data.msg || 'Upload failed');
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : dm.uploadFailed.replace('{name}', item.fileName);
            setDrafts(prev => {
                const draft = prev[dKey];
                if (!draft) return prev;
                const newAtts = draft.attachments.map(a => {
                    if (a.uploadTime === item.uploadTime && a.fileName === item.fileName) {
                        return { ...a, uploading: false, error: errorMsg };
                    }
                    return a;
                });
                return { ...prev, [dKey]: { ...draft, attachments: newAtts } };
            });
            toast.error(dm.uploadFailed.replace('{name}', item.fileName));
        }
    };

    const removeAttachment = (index: number) => {
        if (!activeTaskAssignId || !currentDraft || !draftKey) return;
        const newAtts = [...currentDraft.attachments];
        const removed = newAtts.splice(index, 1)[0];
        if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        updateDraft(draftKey, 'attachments', newAtts);
    };

    // -------------------------------------------------------------------------
    // Submit
    // -------------------------------------------------------------------------
    const handleSubmit = async () => {
        setShowValidation(true);
        if (!activeTaskAssignId || !activeUser || !currentDraft || !draftKey) return;

        // Validation
        let isValid = true;
        if (!currentDraft.reportName || currentDraft.reportName.length > 20) isValid = false;
        if (!currentDraft.reportContent || currentDraft.reportContent.length > 300) isValid = false;
        if (!currentDraft.reportAddress || currentDraft.reportAddress.length > 100) isValid = false;
        if (currentDraft.supplement.length > 50) isValid = false;
        if (currentDraft.attachments.length === 0) {
            toast.error(dm.minAttachment);
            return;
        }
        if (!isValid) return;

        const uploadingItem = currentDraft.attachments.find(a => a.uploading);
        if (uploadingItem) return toast.error(dm.waitUpload);
        const errorItem = currentDraft.attachments.find(a => a.error);
        if (errorItem) return toast.error(dm.deleteFailed);
        const emptyItem = currentDraft.attachments.find(a => !a.filePath);
        if (emptyItem) return toast.error(dm.pathFailed);

        const activeTaskObj = activeUser.tasks.find(t => t.taskAssignId === activeTaskAssignId);
        if (!activeTaskObj) return;

        setIsSubmitting(true);
        const payload = {
            taskId: activeTaskObj.taskId,
            taskStaffId: activeTaskObj.taskStaffId,
            taskAssignId: activeTaskObj.taskAssignId,
            taskContent: currentDraft.reportContent,
            reportName: currentDraft.reportName,
            reportAddress: currentDraft.reportAddress,
            supplement: currentDraft.supplement || '',
            attachments: currentDraft.attachments.map(a => ({
                fileName: a.fileName,
                tempPath: a.tempPath || `wxfile://${a.fileName}`,
                fileType: a.fileType,
                uploadTime: a.uploadTime,
                fileLength: a.fileLength,
                isPic: a.isPic,
                isWx: 0,
                filePath: a.filePath
            }))
        };

        try {
            const res = await axios.post(`${apiBaseUrl}/delivery/submit`, {
                environment,
                token: activeUser.token,
                payload
            });

            if (res.data && res.data.code == 0) {
                toast.success(dm.submitSuccess);

                // Clear draft
                setDrafts(prev => {
                    const next = { ...prev };
                    delete next[draftKey];
                    return next;
                });

                // Remove task from user list locally to reflect "Done" state
                setUsers(prev => {
                    const newUsers = prev.map(u => {
                        if (u.mobile === activeUser.mobile) {
                            return {
                                ...u,
                                tasks: u.tasks.filter(t => t.taskAssignId !== activeTaskAssignId)
                            };
                        }
                        return u;
                    });
                    return newUsers;
                });

                // Since setUsers updater is pure, we need to replicate the logic to set other states accurately
                // OR adapt the logic above to run on 'users' (current state) before setUsers?
                // 'users' is the state from closure, which IS the previous state.
                // So we can calculate the 'next' users list based on 'users' variable directly.

                const currentUsersList = users;
                const nextUsersList = currentUsersList.map(u => {
                    if (u.mobile === activeUser.mobile) {
                        return {
                            ...u,
                            tasks: u.tasks.filter(t => t.taskAssignId !== activeTaskAssignId)
                        };
                    }
                    return u;
                });

                // Determine next selection
                let nextTId: string | null = null;
                let nextMobile: string | null = null;

                const nextCurrentUser = nextUsersList.find(u => u.mobile === activeUser.mobile);
                if (nextCurrentUser && nextCurrentUser.tasks.length > 0) {
                    nextTId = nextCurrentUser.tasks[0].taskAssignId;
                    nextMobile = nextCurrentUser.mobile;
                } else {
                    const firstUserWithTasks = nextUsersList.find(u => u.tasks.length > 0);
                    if (firstUserWithTasks) {
                        nextTId = firstUserWithTasks.tasks[0].taskAssignId;
                        nextMobile = firstUserWithTasks.mobile;
                    }
                }

                if (nextTId && nextMobile) {
                    setActiveTaskAssignId(nextTId);
                    setActiveUserMobile(nextMobile);
                    // Also init draft for the new task
                    initDraft(nextMobile, nextTId);
                    // Ensure the new user is expanded (if switching users)
                    setExpandedUserMobiles(prev => prev.includes(nextMobile!) ? prev : [...prev, nextMobile!]);
                } else {
                    setActiveTaskAssignId(null);
                    setActiveUserMobile(null);
                }


                setShowValidation(false);

            } else {
                toast.error(res.data.msg || dm.submitFailed);
            }
        } catch (e) {
            toast.error(dm.requestError);
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    // -------------------------------------------------------------------------
    // Renders
    // -------------------------------------------------------------------------

    // 1. Navigation Header
    const renderHeader = () => (
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
                <Button variant="ghost" size="icon" onClick={() => {
                    if (step === 'process') {
                        setStep('login');
                        setUsers([]);
                    } else {
                        onBack();
                    }
                }}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{dt.title} {step === 'process' && dt.multiUserMode}</h2>
                    <p className="text-muted-foreground">
                        {step === 'login' ? dt.subTitleLogin : dt.subTitleProcess}
                    </p>
                </div>
            </div>
            {step === 'process' && (
                <Button variant="outline" size="sm" onClick={() => {
                    setStep('login');
                    setUsers([]);
                }}>
                    <LogOut className="mr-2 h-4 w-4" /> {dt.exitLogin}
                </Button>
            )}
        </div>
    );

    // 2. Login View
    const renderLogin = () => (
        <div className="flex flex-col md:flex-row w-full max-w-5xl mx-auto mt-10 md:mt-20 overflow-hidden bg-[var(--card-bg)] border border-[var(--border-subtle)]/40 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-500">
            {/* Left: Brand Area */}
            <div className="md:w-5/12 bg-[var(--surface-brand)]/5 p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                <div className="relative z-10">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                        <Sparkles className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">
                        {dt.login.title}
                    </h3>
                    <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
                        {dt.subTitleLogin}
                    </p>

                    <div className="space-y-4">
                        {[dt.login.brandFeature1, dt.login.brandFeature2, dt.login.brandFeature3].map((feature, idx) => (
                            <div key={idx} className="flex items-center space-x-3 text-sm font-medium text-[var(--text-secondary)]">
                                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <CheckCircle className="w-3 h-3 text-primary" />
                                </div>
                                <span>{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative z-10 mt-12">
                    <p className="text-xs text-[var(--text-tertiary)] opacity-60">
                        &copy; 2026 Delivery Tool. Internal Use Only.
                    </p>
                </div>
            </div>

            {/* Right: Login Form */}
            <div className="md:w-7/12 p-8 md:p-12 bg-[var(--card-bg)] flex flex-col justify-center">
                <div className="max-w-md mx-auto w-full space-y-8">
                    <div className="space-y-2">
                        <Label className="text-[var(--text-secondary)] font-semibold text-xs uppercase tracking-wider ml-1">
                            {dt.login.envLabel}
                        </Label>
                        <div className="bg-[var(--background-secondary)] p-1 rounded-xl flex space-x-1">
                            {['prod', 'test'].map((env) => (
                                <button
                                    key={env}
                                    onClick={() => setEnvironment(env)}
                                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${environment === env
                                        ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                        }`}
                                >
                                    {env === 'prod' ? 'Prod Env' : 'Test Env'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[var(--text-secondary)] font-semibold text-xs uppercase tracking-wider ml-1">
                            {dt.login.mobileLabel}
                        </Label>
                        <div className="relative">
                            <Textarea
                                placeholder={dt.login.mobilePlaceholder}
                                rows={5}
                                className="rounded-xl border-[var(--border-subtle)] bg-[var(--background-secondary)]/30 font-mono text-sm resize-none ring-0 focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all p-4 max-h-[300px] overflow-y-auto"
                                value={mobileInput}
                                onChange={e => setMobileInput(e.target.value)}
                            />
                            <div className="absolute bottom-3 right-3 text-[10px] text-[var(--text-tertiary)] bg-[var(--card-bg)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]/50">
                                {dt.login.mobileHint}
                            </div>
                        </div>
                    </div>

                    <Button
                        className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all duration-300 font-medium text-base group"
                        onClick={handleLogin}
                        disabled={isLoggingIn}
                    >
                        {isLoggingIn ? (
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                            <span className="flex items-center">
                                {dt.login.submitBtn}
                                <ArrowLeft className="ml-2 h-4 w-4 rotate-180 transition-transform group-hover:translate-x-1" />
                            </span>
                        )}
                        {isLoggingIn && dt.login.submitting}
                    </Button>
                </div>
            </div>
        </div>
    );


    const renderProcess = () => (
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-4 gap-4 p-1 h-full">
            {/* Sidebar: Users Tree */}
            <Card
                className="lg:col-span-1 flex flex-col h-full sticky top-2 max-h-[calc(100vh-230px)] border-0 bg-[var(--glass-bg)] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] ring-1 ring-[var(--border-subtle)]/20 rounded-[32px] overflow-hidden transition-all duration-500 hover:shadow-[0_12px_48px_rgba(0,0,0,0.06)]">
                <CardHeader className="py-5 px-5 border-b border-[var(--border-subtle)]/50 bg-[var(--card-bg)]/40 backdrop-blur-md shrink-0">
                    <CardTitle className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">{dt.process.teamTitle}
                        ({users.length})</CardTitle>
                </CardHeader>
                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-2 space-y-1">
                        {users.map(user => {
                            const isExpanded = expandedUserMobiles.includes(user.mobile);
                            return (
                                <div key={user.mobile} className="space-y-1">
                                    {/* User Header */}
                                    <div
                                        className={`group flex items-center p-3 mx-2 mt-2 rounded-2xl cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] border border-transparent ${isExpanded
                                            ? 'bg-[var(--card-bg)]/80 shadow-[0_8px_16px_rgba(0,0,0,0.06)] backdrop-blur-md border-[var(--border-subtle)]/40'
                                            : 'hover:bg-[var(--card-bg)]/50 hover:shadow-sm text-[var(--text-secondary)]'
                                            }`}
                                        onClick={() => toggleUserExpand(user.mobile)}
                                    >
                                        <Avatar
                                            className="h-9 w-9 mr-3 border-2 border-white shadow-sm transition-transform duration-300 group-hover:scale-105">
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                {user.realname.slice(-2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div
                                                className="font-medium text-sm truncate text-[var(--text-primary)] tracking-tight">{user.realname}</div>
                                            <div
                                                className="text-[11px] text-[var(--text-tertiary)] truncate font-medium">{user.mobile}</div>
                                        </div>
                                        <Badge variant="secondary"
                                            className="ml-1 text-[10px] h-5 bg-[var(--background-secondary)]/50 text-[var(--text-secondary)] backdrop-blur-sm border-0">{user.tasks.length}</Badge>
                                        {isExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] ml-1" /> :
                                            <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] ml-1" />}
                                    </div>

                                    {/* Task List (Accordion) */}
                                    <div
                                        className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isExpanded ? 'max-h-[500px] opacity-100 py-1' : 'max-h-0 opacity-0 py-0'}`}>
                                        <div className="ml-3 pl-3 border-l-2 border-[var(--border-subtle)]/50 space-y-1">
                                            {user.tasks.length === 0 ? (
                                                <div
                                                    className="py-2 text-xs text-muted-foreground pl-2 italic">{dt.process.noTasks}</div>
                                            ) : (
                                                user.tasks.map((task, idx) => (
                                                    <div
                                                        key={`${task.taskId}-${task.taskAssignId}-${idx}`}
                                                        style={{ animationDelay: `${idx * 30}ms` }}
                                                        className={`group relative p-3 rounded-2xl text-xs cursor-pointer border transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${activeTaskAssignId === task.taskAssignId && activeUserMobile === user.mobile
                                                            ? 'bg-primary/10 border-primary/20 text-primary shadow-[0_4px_12px_rgba(var(--primary-rgb),0.15)] backdrop-blur-md'
                                                            : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--card-bg)]/60 hover:text-[var(--text-primary)] hover:shadow-sm'
                                                            }`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSelectTask(user.mobile, task.taskAssignId);
                                                        }}
                                                        title={task.taskDesc}
                                                    >
                                                        {/* Active Indicator (Glowing Dot) */}
                                                        {activeTaskAssignId === task.taskAssignId && activeUserMobile === user.mobile && (
                                                            <div
                                                                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-3 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]" />
                                                        )}
                                                        <div
                                                            className={`font-semibold line-clamp-1 break-all pr-1 text-[13px] ${activeTaskAssignId === task.taskAssignId && activeUserMobile === user.mobile ? 'pl-2' : ''} transition-[padding] duration-300`}>{task.taskName}</div>
                                                        <div
                                                            className={`mt-1 opacity-80 text-[11px] line-clamp-2 leading-tight break-all text-muted-foreground/90 ${activeTaskAssignId === task.taskAssignId && activeUserMobile === user.mobile ? 'pl-2' : ''} transition-[padding] duration-300`}>
                                                            {task.taskDesc || dt.process.form.descPlaceholder}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="p-4 border-t border-[var(--border-subtle)]/20 bg-[var(--card-bg)]/40 backdrop-blur-md shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-9 rounded-xl border-[var(--border-subtle)]/40 bg-[var(--card-bg)]/50 hover:bg-[var(--card-bg)]/80 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 shadow-sm hover:shadow-md text-[var(--text-primary)]"
                        onClick={handleRefreshTasks}
                        disabled={isLoggingIn}
                    >
                        {isLoggingIn ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-primary" /> :
                            <RefreshCw className="mr-2 h-3.5 w-3.5 text-primary" />}
                        {dt.process.refreshBtn}
                    </Button>
                </div>
            </Card>

            {/* Main: Form Area */}
            <Card
                className="lg:col-span-3 flex flex-col h-full bg-[var(--glass-bg)] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] ring-1 ring-[var(--border-subtle)]/20 rounded-[32px] border-0 transition-all duration-500 hover:shadow-[0_16px_64px_rgba(0,0,0,0.06)]">
                <CardHeader
                    className="py-5 px-6 border-b border-[var(--border-subtle)]/50 bg-[var(--card-bg)]/40 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center justify-between overflow-hidden">
                        <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-center space-x-2">
                                <CardTitle
                                    className="text-xl font-bold tracking-tight text-[var(--text-primary)] truncate leading-relaxed"
                                    title={activeTask ? activeTask.taskName : ''}>
                                    {activeTask ? activeTask.taskName : dt.process.selectTask}
                                </CardTitle>
                                {activeTask && <Badge variant="outline"
                                    className="text-[10px] px-1.5 h-5 border-primary/30 text-primary bg-primary/5 rounded-md shrink-0">{dt.process.statusRunning}</Badge>}
                            </div>
                            <CardDescription className="truncate font-medium text-muted-foreground mt-1"
                                title={activeTask ? `${activeUser?.realname} - ${activeTask.taskDesc}` : ''}>
                                {activeTask ? (
                                    <span className="flex items-center">
                                        <User className="w-3 h-3 mr-1 inline-block" /> {activeUser?.realname}
                                        <span className="mx-2 opacity-30">|</span>
                                        {activeTask.taskDesc}
                                    </span>
                                ) : dt.process.noSelectTask}
                            </CardDescription>
                        </div>
                        {activeTask && (
                            <>
                                <Badge variant="outline" className="font-mono flex-shrink-0 ml-2">
                                    MyStatus: {activeTask.myStatus}
                                </Badge>
                                {/* <Button
                                    variant="outline"
                                    size="sm"
                                    className="ml-2 h-7 px-2.5 text-xs bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-violet-300/50 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 hover:from-violet-500/20 hover:to-purple-500/20 transition-all"
                                    onClick={() => {
                                        // Trigger AI assistant with auto-screenshot and specific prompt
                                        const event = new CustomEvent('ai-assistant-trigger', {
                                            detail: {
                                                prompt: '请结合页面中的交付物标题，帮我生成“交付标题”和“详细说明”。为了避免重复，请给我写 3 个不同版本的文案供我选择： 版本 1：【极简风】（一针见血，字数最少） 版本 2：【专业风】（用词高大上，强调技术价值） 版本 3：【结果导向】（强调解决了什么问题，提升了什么指标）',
                                                autoScreenshot: true
                                            }
                                        });
                                        window.dispatchEvent(event);
                                    }}
                                >
                                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                                    AI填表
                                </Button> */}
                            </>
                        )}
                    </div>
                </CardHeader>

                {activeTaskAssignId && activeUser && currentDraft && draftKey ? (
                    <div className="flex-1 p-0" key={draftKey}>
                        <div className="p-6 space-y-6">
                            {/* Form Inputs */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>{dt.process.form.title} <span className="text-red-500">*</span></Label>
                                    <Input
                                        maxLength={20}
                                        placeholder={dt.process.form.titlePlaceholder}
                                        value={currentDraft.reportName}
                                        onChange={e => updateDraft(draftKey, 'reportName', e.target.value)}
                                        className={showValidation && !currentDraft.reportName ? 'border-red-500' : ''}
                                    />
                                    {showValidation && !currentDraft.reportName &&
                                        <span className="text-xs text-red-500">{t.common.required}</span>}
                                </div>
                                <div className="space-y-2">
                                    <Label>{dt.process.form.address} <span className="text-red-500">*</span></Label>
                                    <Input
                                        maxLength={100}
                                        placeholder={dt.process.form.addressPlaceholder}
                                        value={currentDraft.reportAddress}
                                        onChange={e => updateDraft(draftKey, 'reportAddress', e.target.value)}
                                        className={showValidation && !currentDraft.reportAddress ? 'border-red-500' : ''}
                                    />
                                    {showValidation && !currentDraft.reportAddress &&
                                        <span className="text-xs text-red-500">{t.common.required}</span>}
                                </div>
                            </div>

                            <div className="space-y-2 relative">
                                <Label>{dt.process.form.desc} <span className="text-red-500">*</span></Label>
                                <div className="relative">
                                    <Textarea
                                        maxLength={300}
                                        placeholder={dt.process.form.descPlaceholder}
                                        className={`h-32 pb-6 resize-none ${showValidation && !currentDraft.reportContent ? 'border-red-500' : ''}`}
                                        value={currentDraft.reportContent}
                                        onChange={e => updateDraft(draftKey, 'reportContent', e.target.value)}
                                    />
                                    <span
                                        className="absolute bottom-2 right-3 text-xs text-muted-foreground/70">
                                        {currentDraft.reportContent.length}/300
                                    </span>
                                </div>
                                {showValidation && !currentDraft.reportContent &&
                                    <span className="text-xs text-red-500">{t.common.required}</span>}
                            </div>

                            <div className="space-y-2">
                                <Label>{dt.process.form.supplement}</Label>
                                <Input
                                    maxLength={50}
                                    placeholder={dt.process.form.supplementPlaceholder}
                                    value={currentDraft.supplement}
                                    onChange={e => updateDraft(draftKey, 'supplement', e.target.value)}
                                />
                            </div>

                            <Separator />

                            {/* Attachments */}
                            <div className="space-y-6">
                                {/* Images */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <Label className="font-medium">{dt.process.form.uploadImg} ({dt.process.form.supportedFormats})</Label>
                                        <span className="text-xs text-muted-foreground">{dt.process.form.imageHint.replace('{count}', String(currentDraft.attachments.filter(a => a.isPic === 1).length))}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {currentDraft.attachments.filter(a => a.isPic === 1).map((item, idx) => (
                                            <div key={idx}
                                                className="relative w-24 h-24 border border-border rounded-lg flex items-center justify-center bg-muted/50 group overflow-hidden shadow-sm">
                                                {item.uploading ? (
                                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                                ) : item.error ? (
                                                    <div className="flex flex-col items-center">
                                                        <AlertCircle className="h-6 w-6 text-red-500 mb-1" />
                                                        <span className="text-[10px] text-red-500">{t.common.failed}</span>
                                                    </div>
                                                ) : item.previewUrl ? (
                                                    <img
                                                        src={item.previewUrl}
                                                        alt="preview"
                                                        className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                                                        onClick={() => item.previewUrl && setPreviewImage(item.previewUrl)}
                                                    />
                                                ) : (
                                                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                                                )}
                                                <button
                                                    className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5 shadow border border-border opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-50 hover:border-red-200"
                                                    onClick={() => removeAttachment(currentDraft.attachments.indexOf(item))}
                                                >
                                                    <X className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                                                </button>
                                                {!item.previewUrl && !item.uploading && !item.error && <span
                                                    className="absolute bottom-0 text-[8px] w-full text-center truncate px-1 bg-white/80">{item.fileName}</span>}
                                            </div>
                                        ))}
                                        {currentDraft.attachments.filter(a => a.isPic === 1).length < 9 && (
                                            <Label htmlFor="upload-pic"
                                                className="w-24 h-24 border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors border-border">
                                                <Upload className="h-6 w-6 text-muted-foreground/50 mb-1" />
                                                <span className="text-xs text-muted-foreground">{dt.process.form.uploadImg}</span>
                                                <input id="upload-pic" type="file" accept="image/*" multiple
                                                    className="hidden" onChange={e => handleFileUpload(e, true)} />
                                            </Label>
                                        )}
                                    </div>
                                </div>

                                {/* Files */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <Label className="font-medium">{dt.process.form.uploadFile}</Label>
                                        <span className="text-xs text-muted-foreground">{dt.process.form.fileHint.replace('{count}', String(currentDraft.attachments.filter(a => a.isPic === 0).length))}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {currentDraft.attachments.filter(a => a.isPic === 0).map((item, idx) => (
                                            <div key={idx}
                                                className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
                                                <div className="flex items-center space-x-3 overflow-hidden">
                                                    <div
                                                        className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                                                        <FileIcon className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span
                                                            className="text-sm font-medium truncate pr-2">{item.fileName}</span>
                                                        <span
                                                            className="text-xs text-muted-foreground">{(item.fileLength / 1024).toFixed(1)} KB</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center">
                                                    {item.uploading && <Loader2
                                                        className="h-4 w-4 animate-spin text-muted-foreground mr-2" />}
                                                    {item.error &&
                                                        <span className="text-red-500 text-xs mr-2">{item.error}</span>}
                                                    <Button variant="ghost" size="icon"
                                                        className="h-8 w-8 text-muted-foreground/50 hover:text-red-500"
                                                        onClick={() => removeAttachment(currentDraft.attachments.indexOf(item))}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        {currentDraft.attachments.filter(a => a.isPic === 0).length < 6 && (
                                            <Label htmlFor="upload-file" className="block w-full">
                                                <div
                                                    className="w-full h-12 border border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors border-border">
                                                    <span className="text-sm text-muted-foreground flex items-center"><Upload
                                                        className="h-4 w-4 mr-2" /> {dt.process.form.uploadFile}</span>
                                                </div>
                                                <input id="upload-file" type="file" accept="*" multiple
                                                    className="hidden" onChange={e => handleFileUpload(e, false)} />
                                            </Label>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                        <p>{dt.process.noSelectTask}</p>
                    </div>
                )}

                {/* Footer Action */}
                {activeTaskAssignId && (
                    <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-end">
                        <Button className="w-40" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                                <CheckCircle className="mr-2 h-4 w-4" />}
                            {dt.process.form.submit}
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );

    return (
        <div className="container max-w-7xl mx-auto py-4 animate-in fade-in duration-500 flex flex-col min-h-[calc(100vh-140px)]">

            {/* Modal */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-5xl max-h-[90vh] p-4 outline-none"
                        onClick={e => e.stopPropagation()}>
                        <img
                            src={previewImage}
                            alt="Full Preview"
                            className="w-full h-full object-contain rounded-lg shadow-2xl bg-black"
                        />
                        <button
                            className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors p-2"
                            onClick={() => setPreviewImage(null)}
                        >
                            <X className="h-8 w-8" />
                        </button>
                    </div>
                </div>
            )}

            {renderHeader()}
            {step === 'login' ? renderLogin() : renderProcess()}
        </div>
    );
}
