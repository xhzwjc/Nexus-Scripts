import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import {
    ArrowLeft, Loader2, Upload, File as FileIcon, X, CheckCircle, AlertCircle,
    Image as ImageIcon, User, ChevronRight, ChevronDown, LogOut, RefreshCw
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

    // Cleanup preview URLs on unmount
    useEffect(() => {
        return () => {
            Object.values(drafts).forEach(draft => {
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

        try {
            for (const mobile of uniqueMobiles) {
                // 1. Login
                try {
                    const loginRes = await axios.post(`${apiBaseUrl}/delivery/login`, {
                        mobile, environment, code: '987654'
                    });

                    if (!loginRes.data.success) {
                        toast.error(dm.loginFailed.replace('{mobile}', mobile).replace('{msg}', loginRes.data.msg));
                        continue;
                    }

                    const token = loginRes.data.token;

                    // 2. Get Worker Info (Realname)
                    let realname = mobile;
                    try {
                        const infoRes = await axios.post(`${apiBaseUrl}/delivery/worker-info`, {
                            environment, token
                        });
                        if (infoRes.data && infoRes.data.code === 0 && infoRes.data.data) {
                            realname = infoRes.data.data.realname || mobile;
                        }
                    } catch (e) {
                        console.error(`Get worker info failed for ${mobile}`, e);
                    }

                    // 3. Get Tasks
                    let userTasks: Task[] = [];
                    try {
                        const taskRes = await axios.post(`${apiBaseUrl}/delivery/tasks`, {
                            environment, token, status: 0
                        });
                        if (taskRes.data && taskRes.data.code === 0 && taskRes.data.data?.list) {
                            // Filter myStatus=4 (Wait for delivery)
                            userTasks = (taskRes.data.data.list as Task[]).filter(t => t.myStatus === 4 && !t.taskName?.includes('【测试'));
                        }
                    } catch (e) {
                        console.error(`Get tasks failed for ${mobile}`, e);
                    }

                    newUsers.push({
                        mobile,
                        token,
                        realname,
                        tasks: userTasks
                    });

                } catch (e) {
                    console.error(`Process mobile ${mobile} failed`, e);
                    toast.error(dm.processError.replace('{mobile}', mobile));
                }
            }

            if (newUsers.length > 0) {
                setUsers(newUsers);
                setStep('process');

                // 默认展开所有
                setExpandedUserMobiles(newUsers.map(u => u.mobile));
                // Select first task if exists
                if (newUsers[0] && newUsers[0].tasks.length > 0) {
                    const tId = newUsers[0].tasks[0].taskAssignId;
                    setActiveTaskAssignId(tId);
                    setActiveUserMobile(newUsers[0].mobile);
                    // Initialize draft
                    initDraft(newUsers[0].mobile, tId);
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

            for (let i = 0; i < updatedUsers.length; i++) {
                const user = updatedUsers[i];
                try {
                    const taskRes = await axios.post(`${apiBaseUrl}/delivery/tasks`, {
                        environment, token: user.token, status: 0
                    });
                    if (taskRes.data && taskRes.data.code === 0 && taskRes.data.data?.list) {
                        // Filter myStatus=4
                        const newTasks = (taskRes.data.data.list as Task[]).filter(t => t.myStatus === 4);
                        updatedUsers[i] = { ...user, tasks: newTasks };
                        successCount++;
                    }
                } catch (e) {
                    console.error(`Refresh tasks failed for ${user.mobile}`, e);
                }
            }

            setUsers(updatedUsers);
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
        <div className="flex items-center justify-between mb-6">
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
        <div className="max-w-md mx-auto mt-20 animate-in fade-in zoom-in-95 duration-500">
            <Card
                className="border-0 shadow-2xl bg-white/60 backdrop-blur-3xl ring-1 ring-white/40 rounded-[40px] overflow-hidden">
                <CardHeader className="text-center pb-2 pt-8">
                    <div
                        className="mx-auto w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 shadow-[0_8px_24px_rgba(59,130,246,0.15)]">
                        <User className="h-8 w-8 text-blue-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-800 tracking-tight">{dt.login.title}</CardTitle>
                    <CardDescription className="text-slate-500 font-medium">{dt.login.desc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-8 pb-10">
                    <div className="space-y-2">
                        <Label className="text-slate-600 font-semibold text-xs ml-1">{dt.login.envLabel}</Label>
                        <Select value={environment} onValueChange={setEnvironment}>
                            <SelectTrigger
                                className="rounded-2xl border-white/40 bg-white/50 h-10 ring-0 focus:ring-2 focus:ring-blue-500/10 shadow-sm transition-all hover:bg-white/80">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent
                                className="rounded-xl border-white/20 bg-white/80 backdrop-blur-xl shadow-xl">
                                <SelectItem value="test"
                                    className="rounded-lg my-1 mx-1 focus:bg-blue-50 focus:text-blue-600 cursor-pointer">Test Env</SelectItem>
                                <SelectItem value="prod"
                                    className="rounded-lg my-1 mx-1 focus:bg-blue-50 focus:text-blue-600 cursor-pointer">Prod Env</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-600 font-semibold text-xs ml-1">{dt.login.mobileLabel}</Label>
                        <Textarea
                            placeholder={dt.login.mobilePlaceholder}
                            rows={8}
                            className="rounded-2xl border-white/40 bg-white/50 font-mono text-sm resize-none ring-0 focus:ring-2 focus:ring-blue-500/10 shadow-inner p-4 transition-all focus:bg-white/80"
                            value={mobileInput}
                            onChange={e => setMobileInput(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 text-right pr-2">{dt.login.mobileHint}</p>
                    </div>

                    <Button
                        className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)] hover:shadow-[0_12px_28px_rgba(37,99,235,0.35)] active:scale-[0.97] transition-all duration-300 font-medium text-base"
                        onClick={handleLogin}
                        disabled={isLoggingIn}
                    >
                        {isLoggingIn ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                        {isLoggingIn ? dt.login.submitting : dt.login.submitBtn}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );


    // 3. Main Process View
    const renderProcess = () => (
        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6 lg:h-[calc(100vh-140px)] p-2">
            {/* Sidebar: Users Tree */}
            <Card
                className="lg:col-span-1 flex flex-col min-h-[400px] h-auto lg:h-full border-0 bg-white/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] ring-1 ring-white/20 rounded-[32px] overflow-hidden transition-all duration-500 hover:shadow-[0_12px_48px_rgba(0,0,0,0.06)]">
                <CardHeader className="py-5 px-5 border-b border-slate-200/50 bg-white/40 backdrop-blur-md">
                    <CardTitle className="text-sm font-semibold text-slate-800 tracking-tight">{dt.process.teamTitle}
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
                                            ? 'bg-white/80 shadow-[0_8px_16px_rgba(0,0,0,0.06)] backdrop-blur-md border-white/40'
                                            : 'hover:bg-white/50 hover:shadow-sm text-slate-600'
                                            }`}
                                        onClick={() => toggleUserExpand(user.mobile)}
                                    >
                                        <Avatar
                                            className="h-9 w-9 mr-3 border-2 border-white shadow-sm transition-transform duration-300 group-hover:scale-105">
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                {user.realname.substring(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div
                                                className="font-medium text-sm truncate text-slate-800 tracking-tight">{user.realname}</div>
                                            <div
                                                className="text-[11px] text-slate-500 truncate font-medium">{user.mobile}</div>
                                        </div>
                                        <Badge variant="secondary"
                                            className="ml-1 text-[10px] h-5 bg-slate-100/50 text-slate-600 backdrop-blur-sm border-0">{user.tasks.length}</Badge>
                                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 ml-1" /> :
                                            <ChevronRight className="h-4 w-4 text-slate-400 ml-1" />}
                                    </div>

                                    {/* Task List (Accordion) */}
                                    <div
                                        className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isExpanded ? 'max-h-[500px] opacity-100 py-1' : 'max-h-0 opacity-0 py-0'}`}>
                                        <div className="ml-3 pl-3 border-l-2 border-slate-200/50 space-y-1">
                                            {user.tasks.length === 0 ? (
                                                <div
                                                    className="py-2 text-xs text-muted-foreground pl-2 italic">{dt.process.noTasks}</div>
                                            ) : (
                                                user.tasks.map((task, idx) => (
                                                    <div
                                                        key={`${task.taskId}-${task.taskAssignId}-${idx}`}
                                                        style={{ animationDelay: `${idx * 30}ms` }}
                                                        className={`group relative p-3 rounded-2xl text-xs cursor-pointer border transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${activeTaskAssignId === task.taskAssignId && activeUserMobile === user.mobile
                                                            ? 'bg-blue-500/10 border-blue-200/50 text-blue-700 shadow-[0_4px_12px_rgba(59,130,246,0.15)] backdrop-blur-md'
                                                            : 'border-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900 hover:shadow-sm'
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
                                                                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-3 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
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
                <div className="p-4 border-t border-white/20 bg-white/40 backdrop-blur-md">
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-9 rounded-xl border-white/40 bg-white/50 hover:bg-white/80 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 shadow-sm hover:shadow-md text-slate-700"
                        onClick={handleRefreshTasks}
                        disabled={isLoggingIn}
                    >
                        {isLoggingIn ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-blue-500" /> :
                            <RefreshCw className="mr-2 h-3.5 w-3.5 text-blue-500" />}
                        {dt.process.refreshBtn}
                    </Button>
                </div>
            </Card>

            {/* Main: Form Area */}
            <Card
                className="lg:col-span-3 min-h-[600px] h-auto lg:h-full lg:overflow-hidden flex flex-col bg-white/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] ring-1 ring-white/20 rounded-[32px] border-0 transition-all duration-500 hover:shadow-[0_16px_64px_rgba(0,0,0,0.06)]">
                <CardHeader
                    className="py-5 px-6 border-b border-slate-200/50 bg-white/40 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center justify-between overflow-hidden">
                        <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-center space-x-2">
                                <CardTitle
                                    className="text-xl font-bold tracking-tight text-slate-800 truncate leading-relaxed"
                                    title={activeTask ? (currentDraft?.reportName || activeTask.taskName) : ''}>
                                    {activeTask ? (currentDraft?.reportName || activeTask.taskName) : dt.process.selectTask}
                                </CardTitle>
                                {activeTask && <Badge variant="outline"
                                    className="text-[10px] px-1.5 h-5 border-blue-200 text-blue-600 bg-blue-50/50 rounded-md shrink-0">{dt.process.statusRunning}</Badge>}
                            </div>
                            <CardDescription className="truncate font-medium text-slate-500 mt-1"
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
                            <Badge variant="outline" className="font-mono flex-shrink-0 ml-2">
                                MyStatus: {activeTask.myStatus}
                            </Badge>
                        )}
                    </div>
                </CardHeader>

                {activeTaskAssignId && activeUser && currentDraft && draftKey ? (
                    <div className="flex-1 overflow-y-auto p-0" key={draftKey}>
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
                                        className="absolute bottom-2 right-3 text-xs text-muted-foreground bg-white px-1">
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
                                        <span
                                            className="text-xs text-muted-foreground">{dt.process.form.attachmentHint.replace('{count}', String(currentDraft.attachments.filter(a => a.isPic === 1).length))}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {currentDraft.attachments.filter(a => a.isPic === 1).map((item, idx) => (
                                            <div key={idx}
                                                className="relative w-24 h-24 border rounded-lg flex items-center justify-center bg-slate-50 group overflow-hidden shadow-sm">
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
                                                    <ImageIcon className="h-8 w-8 text-slate-300" />
                                                )}
                                                <button
                                                    className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow border opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-slate-100"
                                                    onClick={() => removeAttachment(currentDraft.attachments.indexOf(item))}
                                                >
                                                    <X className="h-3 w-3 text-slate-500" />
                                                </button>
                                                {!item.previewUrl && !item.uploading && !item.error && <span
                                                    className="absolute bottom-0 text-[8px] w-full text-center truncate px-1 bg-white/80">{item.fileName}</span>}
                                            </div>
                                        ))}
                                        {currentDraft.attachments.filter(a => a.isPic === 1).length < 9 && (
                                            <Label htmlFor="upload-pic"
                                                className="w-24 h-24 border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors border-slate-300">
                                                <Upload className="h-6 w-6 text-slate-400 mb-1" />
                                                <span className="text-xs text-slate-500">{dt.process.form.uploadImg}</span>
                                                <input id="upload-pic" type="file" accept="image/*" multiple
                                                    className="hidden" onChange={e => handleFileUpload(e, true)} />
                                            </Label>
                                        )}
                                    </div>
                                </div>

                                {/* Files */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <Label className="font-medium">{dt.process.form.uploadFile} (Max 6)</Label>
                                        <span
                                            className="text-xs text-muted-foreground">{dt.process.form.attachmentHint.replace('{count}', String(currentDraft.attachments.filter(a => a.isPic === 0).length))}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {currentDraft.attachments.filter(a => a.isPic === 0).map((item, idx) => (
                                            <div key={idx}
                                                className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors group">
                                                <div className="flex items-center space-x-3 overflow-hidden">
                                                    <div
                                                        className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-500">
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
                                                        className="h-8 w-8 text-slate-400 hover:text-red-500"
                                                        onClick={() => removeAttachment(currentDraft.attachments.indexOf(item))}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        {currentDraft.attachments.filter(a => a.isPic === 0).length < 6 && (
                                            <Label htmlFor="upload-file" className="block w-full">
                                                <div
                                                    className="w-full h-12 border border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors border-slate-300">
                                                    <span className="text-sm text-slate-500 flex items-center"><Upload
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
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                            <User className="h-8 w-8 text-slate-300" />
                        </div>
                        <p>{dt.process.noSelectTask}</p>
                    </div>
                )}

                {/* Footer Action */}
                {activeTaskAssignId && (
                    <div className="p-4 border-t bg-slate-50/50 flex justify-end">
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
        <div className="container max-w-7xl mx-auto py-6 animate-in fade-in duration-500">

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
