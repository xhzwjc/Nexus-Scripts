import React, { useState, useRef } from 'react';
import { ResourceGroup, SystemResource, Credential, Environment, SystemEnvironment } from '@/lib/team-resources-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Save, Trash2, ArrowLeft, Building2, Database, Globe, Key, Upload, X, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ResourceEditorProps {
    groups: ResourceGroup[];
    onCancel: () => void;
    onSave: (groups: ResourceGroup[]) => Promise<void> | void;
}

// 可拖拽的集团项
function SortableGroupItem({ group, isActive, onClick, onDelete }: {
    group: ResourceGroup;
    isActive: boolean;
    onClick: () => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={onClick}
            className={`p-2 rounded-md cursor-pointer text-sm font-medium flex items-center gap-2 group ${isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
                <GripVertical className="w-3 h-3 text-[var(--text-tertiary)]" />
            </div>
            <Building2 className="w-4 h-4" />
            <span className="flex-1 truncate">{group.name}</span>
            <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 text-red-500"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
                <Trash2 className="w-3 h-3" />
            </Button>
        </div>
    );
}

// 可拖拽的系统项
function SortableSystemItem({ system, isActive, onClick, onDelete }: {
    system: SystemResource;
    isActive: boolean;
    onClick: () => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: system.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={onClick}
            className={`p-2 rounded-md cursor-pointer text-sm flex items-center gap-2 group ${isActive ? 'bg-card shadow-sm border border-primary/20 text-primary' : 'hover:bg-card text-muted-foreground'}`}
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
                <GripVertical className="w-3 h-3 text-[var(--text-tertiary)]" />
            </div>
            <Database className="w-4 h-4" />
            <span className="flex-1 truncate">{system.name}</span>
            <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 text-red-500"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
                <Trash2 className="w-3 h-3" />
            </Button>
        </div>
    );
}

export function ResourceEditor({ groups, onCancel, onSave }: ResourceEditorProps) {
    const { t } = useI18n();
    const tr = t.teamResources;
    const [editedGroups, setEditedGroups] = useState<ResourceGroup[]>(JSON.parse(JSON.stringify(groups)));
    const [activeGroupId, setActiveGroupId] = useState<string>(groups[0]?.id || '');
    const [activeSystemId, setActiveSystemId] = useState<string>('');

    const currentGroup = editedGroups.find(g => g.id === activeGroupId);
    const currentSystem = currentGroup?.systems.find(s => s.id === activeSystemId);

    // 拖拽传感器
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // 集团拖拽结束
    const handleGroupDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = editedGroups.findIndex(g => g.id === active.id);
            const newIndex = editedGroups.findIndex(g => g.id === over.id);
            setEditedGroups(arrayMove(editedGroups, oldIndex, newIndex));
        }
    };

    // 系统拖拽结束
    const handleSystemDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id && currentGroup) {
            const oldIndex = currentGroup.systems.findIndex(s => s.id === active.id);
            const newIndex = currentGroup.systems.findIndex(s => s.id === over.id);
            const newSystems = arrayMove(currentGroup.systems, oldIndex, newIndex);
            setEditedGroups(editedGroups.map(g =>
                g.id === currentGroup.id ? { ...g, systems: newSystems } : g
            ));
        }
    };

    // 添加集团
    const handleAddGroup = () => {
        const id = `group-${Date.now()}`;
        const newGroup: ResourceGroup = {
            id,
            name: tr.newGroup,
            systems: []
        };
        setEditedGroups([...editedGroups, newGroup]);
        setActiveGroupId(id);
        setActiveSystemId('');
    };

    // 删除集团
    const handleDeleteGroup = (groupId: string) => {
        if (editedGroups.length <= 1) {
            toast.error(tr.keepOneGroup);
            return;
        }
        setEditedGroups(editedGroups.filter(g => g.id !== groupId));
        if (activeGroupId === groupId) {
            setActiveGroupId(editedGroups[0]?.id || '');
            setActiveSystemId('');
        }
    };

    // 添加系统
    const handleAddSystem = () => {
        if (!currentGroup) return;
        const id = `sys-${Date.now()}`;
        const newSystem: SystemResource = {
            id,
            name: tr.newSystem,
            description: '',
            environments: {}
        };
        const updated = editedGroups.map(g => {
            if (g.id === currentGroup.id) {
                return { ...g, systems: [...g.systems, newSystem] };
            }
            return g;
        });
        setEditedGroups(updated);
        setActiveSystemId(id);
    };

    // 删除系统
    const handleDeleteSystem = (systemId: string) => {
        if (!currentGroup) return;
        const updated = editedGroups.map(g => {
            if (g.id === currentGroup.id) {
                return { ...g, systems: g.systems.filter(s => s.id !== systemId) };
            }
            return g;
        });
        setEditedGroups(updated);
        if (activeSystemId === systemId) {
            setActiveSystemId('');
        }
    };

    // 更新集团名称
    const handleUpdateGroupName = (name: string) => {
        setEditedGroups(editedGroups.map(g => g.id === activeGroupId ? { ...g, name } : g));
    };

    // 更新集团LOGO - 延迟上传策略
    const logoInputRef = useRef<HTMLInputElement>(null);
    // 存储待上传的 Base64 Logo（仅在点击保存时才真正上传）
    const [pendingLogos, setPendingLogos] = useState<Record<string, string>>({});
    // 存储待删除的服务器端 Logo groupId 列表
    const [logosToDelete, setLogosToDelete] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentGroup) return;

        // 限制文件大小（2MB）
        if (file.size > 2 * 1024 * 1024) {
            toast.error(tr.imageTooLarge);
            return;
        }

        try {
            // 读取为 Base64，暂存到 pendingLogos（不立即上传）
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            // 暂存 Base64，用于预览和后续上传
            setPendingLogos(prev => ({ ...prev, [currentGroup.id]: base64 }));
            // 同时更新编辑状态中的 logo 为 Base64（用于预览）
            setEditedGroups(editedGroups.map(g =>
                g.id === activeGroupId ? { ...g, logo: base64 } : g
            ));
            toast.success(tr.logoUploaded);
        } catch (error) {
            console.error('Logo read failed:', error);
            toast.error('Logo 读取失败');
        } finally {
            // 清空 input 以便重复上传同一文件
            if (logoInputRef.current) logoInputRef.current.value = '';
        }
    };

    const handleRemoveLogo = () => {
        if (!currentGroup) return;

        // 如果是服务器端的 Logo（URL 路径），标记为待删除
        if (currentGroup.logo && currentGroup.logo.startsWith('/team-logos/')) {
            setLogosToDelete(prev => [...prev, currentGroup.id]);
        }

        // 从待上传列表中移除（如果有）
        setPendingLogos(prev => {
            const updated = { ...prev };
            delete updated[currentGroup.id];
            return updated;
        });
        // 更新编辑状态
        setEditedGroups(editedGroups.map(g =>
            g.id === activeGroupId ? { ...g, logo: undefined } : g
        ));
    };

    // 更新系统
    const handleUpdateSystem = (field: keyof SystemResource, value: string | { dev?: SystemEnvironment; test?: SystemEnvironment; prod?: SystemEnvironment }) => {
        if (!currentGroup || !currentSystem) return;
        const updated = editedGroups.map(g => {
            if (g.id === currentGroup.id) {
                return {
                    ...g,
                    systems: g.systems.map(s => s.id === currentSystem.id ? { ...s, [field]: value } : s)
                };
            }
            return g;
        });
        setEditedGroups(updated);
    };

    // 更新环境 URL
    const handleUpdateEnvUrl = (env: Environment, url: string) => {
        if (!currentSystem) return;
        const newEnvs = { ...currentSystem.environments };
        if (!newEnvs[env]) {
            newEnvs[env] = { url, creds: [] };
        } else {
            newEnvs[env] = { ...newEnvs[env]!, url };
        }
        handleUpdateSystem('environments', newEnvs);
    };

    // 更新环境跳过检测标志
    const handleUpdateEnvSkipFlag = (env: Environment, flag: 'skipHealthCheck' | 'skipCertCheck', value: boolean) => {
        if (!currentSystem) return;
        const newEnvs = { ...currentSystem.environments };
        if (!newEnvs[env]) {
            newEnvs[env] = { url: '', creds: [], [flag]: value };
        } else {
            newEnvs[env] = { ...newEnvs[env]!, [flag]: value };
        }
        handleUpdateSystem('environments', newEnvs);
    };

    // 添加凭证
    const handleAddCredential = (env: Environment) => {
        if (!currentSystem) return;
        const newEnvs = { ...currentSystem.environments };
        if (!newEnvs[env]) {
            newEnvs[env] = { url: '', creds: [] };
        }
        const newCred: Credential = {
            id: `cred-${Date.now()}`,
            label: tr.newAccount,
            username: '',
            password: ''
        };
        newEnvs[env] = { ...newEnvs[env]!, creds: [...newEnvs[env]!.creds, newCred] };
        handleUpdateSystem('environments', newEnvs);
    };

    // 更新凭证
    const handleUpdateCredential = (env: Environment, credId: string, field: keyof Credential, value: string) => {
        if (!currentSystem) return;
        const newEnvs = { ...currentSystem.environments };
        if (newEnvs[env]) {
            newEnvs[env] = {
                ...newEnvs[env]!,
                creds: newEnvs[env]!.creds.map(c => c.id === credId ? { ...c, [field]: value } : c)
            };
        }
        handleUpdateSystem('environments', newEnvs);
    };

    // 删除凭证
    const handleDeleteCredential = (env: Environment, credId: string) => {
        if (!currentSystem) return;
        const newEnvs = { ...currentSystem.environments };
        if (newEnvs[env]) {
            newEnvs[env] = {
                ...newEnvs[env]!,
                creds: newEnvs[env]!.creds.filter(c => c.id !== credId)
            };
        }
        handleUpdateSystem('environments', newEnvs);
    };

    // 一键清空环境
    const handleClearEnvironment = (env: Environment) => {
        if (!currentSystem) return;
        const newEnvs = { ...currentSystem.environments };
        delete newEnvs[env];
        handleUpdateSystem('environments', newEnvs);
        const envName = env === 'dev' ? tr.envDev : env === 'test' ? tr.envTest : tr.envProd;
        toast.success(tr.clearedEnv.replace('{env}', envName));
    };

    const handleSaveClick = async () => {
        if (isSaving) return;
        setIsSaving(true);

        try {
            // 1. 上传所有待上传的 Logo
            const groupsWithUrls = [...editedGroups];

            for (const [groupId, base64] of Object.entries(pendingLogos)) {
                try {
                    const res = await fetch('/api/team-resources/logo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ groupId, base64 })
                    });
                    const result = await res.json();

                    if (result.success && result.logoUrl) {
                        // 替换 Base64 为 URL 路径
                        const idx = groupsWithUrls.findIndex(g => g.id === groupId);
                        if (idx !== -1) {
                            groupsWithUrls[idx] = { ...groupsWithUrls[idx], logo: result.logoUrl };
                        }
                    }
                } catch (error) {
                    console.error(`Failed to upload logo for ${groupId}:`, error);
                }
            }

            // 2. 删除标记为待删除的服务器端 Logo
            for (const groupId of logosToDelete) {
                try {
                    await fetch(`/api/team-resources/logo?groupId=${groupId}`, {
                        method: 'DELETE'
                    });
                } catch (error) {
                    console.error(`Failed to delete logo for ${groupId}:`, error);
                }
            }

            // 3. 清空待上传和待删除列表
            setPendingLogos({});
            setLogosToDelete([]);

            // 4. 调用父组件保存（传递已转换为 URL 的数据）
            await onSave(groupsWithUrls);
            window.dispatchEvent(new Event('team-resources-updated'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[var(--page-bg)]">
            {/* 顶部工具栏 */}
            <div className="h-16 flex items-center justify-between px-6 bg-[var(--card-bg)] border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">{tr.resourceManage}</h2>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={isSaving}>{tr.cancel}</Button>
                    <Button onClick={handleSaveClick} disabled={isSaving}>
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {tr.saving}
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                {tr.saveChanges}
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* 左侧：集团列表 */}
                <div className="w-56 bg-[var(--card-bg)] border-r border-[var(--border-subtle)] p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <Label className="text-[var(--text-secondary)] font-medium text-xs uppercase">{tr.groupList}</Label>
                        <Button variant="ghost" size="icon" onClick={handleAddGroup} className="h-6 w-6">
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
                            <SortableContext items={editedGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
                                {editedGroups.map(g => (
                                    <SortableGroupItem
                                        key={g.id}
                                        group={g}
                                        isActive={activeGroupId === g.id}
                                        onClick={() => { setActiveGroupId(g.id); setActiveSystemId(''); }}
                                        onDelete={() => handleDeleteGroup(g.id)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>

                {/* 中间：系统列表 */}
                <div className="w-64 bg-[var(--bg-muted)] border-r border-[var(--border-subtle)] p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <Label className="text-[var(--text-secondary)] font-medium text-xs uppercase">{tr.systemList}</Label>
                        <Button variant="ghost" size="icon" onClick={handleAddSystem} className="h-6 w-6" disabled={!currentGroup}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                    {currentGroup && (
                        <div className="mb-4 space-y-3">
                            <Input
                                value={currentGroup.name}
                                onChange={(e) => handleUpdateGroupName(e.target.value)}
                                className="font-bold"
                                placeholder={tr.groupName}
                            />

                            {/* LOGO 上传 */}
                            <div className="space-y-2">
                                <Label className="text-xs text-[var(--text-secondary)]">{tr.logoOptional}</Label>
                                {currentGroup.logo ? (
                                    <div className="relative w-full h-16 bg-white rounded-lg border border-[var(--border-subtle)] overflow-hidden group">
                                        <img
                                            src={currentGroup.logo}
                                            alt="Group Logo"
                                            className="w-full h-full object-contain"
                                        />
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="absolute top-1 right-1 h-5 w-5 bg-white/80 dark:bg-black/50 opacity-0 group-hover:opacity-100 text-red-500"
                                            onClick={handleRemoveLogo}
                                        >
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div
                                        className="w-full h-16 bg-[var(--card-bg)] rounded-lg border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                                        onClick={() => logoInputRef.current?.click()}
                                    >
                                        <div className="text-center">
                                            <Upload className="w-4 h-4 mx-auto text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">{tr.clickToUpload}</span>
                                        </div>
                                    </div>
                                )}
                                <input
                                    ref={logoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleLogoUpload}
                                />
                            </div>
                        </div>
                    )}
                    <div className="flex-1 overflow-y-auto space-y-1">
                        {currentGroup && currentGroup.systems.length > 0 ? (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSystemDragEnd}>
                                <SortableContext items={currentGroup.systems.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                    {currentGroup.systems.map(s => (
                                        <SortableSystemItem
                                            key={s.id}
                                            system={s}
                                            isActive={activeSystemId === s.id}
                                            onClick={() => setActiveSystemId(s.id)}
                                            onDelete={() => handleDeleteSystem(s.id)}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                        ) : (
                            <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                                {tr.noSystemsAddHint}
                            </div>
                        )}
                    </div>
                </div>

                {/* 右侧：系统详情编辑 */}
                <div className="flex-1 overflow-y-auto p-6">
                    {currentSystem ? (
                        <div className="max-w-2xl space-y-6">
                            <Card className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>{tr.systemName}</Label>
                                        <Input
                                            value={currentSystem.name}
                                            onChange={(e) => handleUpdateSystem('name', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{tr.descriptionLabel}</Label>
                                        <Input
                                            value={currentSystem.description || ''}
                                            onChange={(e) => handleUpdateSystem('description', e.target.value)}
                                            placeholder={tr.optional}
                                        />
                                    </div>
                                </div>
                            </Card>

                            {/* 环境配置 */}
                            <Tabs defaultValue="prod" className="w-full">
                                <TabsList className="w-full grid grid-cols-3">
                                    <TabsTrigger value="dev">{tr.devEnv}</TabsTrigger>
                                    <TabsTrigger value="test">{tr.testEnv}</TabsTrigger>
                                    <TabsTrigger value="prod">{tr.prodEnv}</TabsTrigger>
                                </TabsList>

                                {(['dev', 'test', 'prod'] as Environment[]).map(env => (
                                    <TabsContent key={env} value={env} className="mt-4 space-y-4">
                                        <Card className="p-4 space-y-4">
                                            <div className="space-y-2">
                                                <Label className="flex items-center gap-2">
                                                    <Globe className="w-4 h-4" />
                                                    {tr.accessUrl}
                                                </Label>
                                                <Input
                                                    value={currentSystem.environments[env]?.url || ''}
                                                    onChange={(e) => handleUpdateEnvUrl(env, e.target.value)}
                                                    placeholder="example.com"
                                                />
                                            </div>

                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`skip-health-${env}`}
                                                        checked={currentSystem.environments[env]?.skipHealthCheck || false}
                                                        onCheckedChange={(checked) => handleUpdateEnvSkipFlag(env, 'skipHealthCheck', checked as boolean)}
                                                    />
                                                    <Label htmlFor={`skip-health-${env}`} className="text-sm font-normal cursor-pointer">
                                                        {tr.skipHealthCheck}
                                                    </Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`skip-cert-${env}`}
                                                        checked={currentSystem.environments[env]?.skipCertCheck || false}
                                                        onCheckedChange={(checked) => handleUpdateEnvSkipFlag(env, 'skipCertCheck', checked as boolean)}
                                                    />
                                                    <Label htmlFor={`skip-cert-${env}`} className="text-sm font-normal cursor-pointer">
                                                        {tr.skipCertCheck}
                                                    </Label>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <Label className="flex items-center gap-2">
                                                        <Key className="w-4 h-4" />
                                                        {tr.credentialList}
                                                    </Label>
                                                    <Button variant="outline" size="sm" onClick={() => handleAddCredential(env)}>
                                                        <Plus className="w-3 h-3 mr-1" />
                                                        {tr.addCredential}
                                                    </Button>
                                                </div>

                                                {currentSystem.environments[env]?.creds.map(cred => (
                                                    <div key={cred.id} className="flex items-center gap-2 p-3 bg-[var(--bg-muted)] rounded-lg">
                                                        <Input
                                                            value={cred.label}
                                                            onChange={(e) => handleUpdateCredential(env, cred.id, 'label', e.target.value)}
                                                            placeholder={tr.labelPlaceholder}
                                                            className="w-24"
                                                        />
                                                        <Input
                                                            value={cred.username}
                                                            onChange={(e) => handleUpdateCredential(env, cred.id, 'username', e.target.value)}
                                                            placeholder={tr.usernamePlaceholder}
                                                            className="flex-1"
                                                        />
                                                        <Input
                                                            type="password"
                                                            value={cred.password || ''}
                                                            onChange={(e) => handleUpdateCredential(env, cred.id, 'password', e.target.value)}
                                                            placeholder={tr.passwordOptional}
                                                            className="flex-1"
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-red-500"
                                                            onClick={() => handleDeleteCredential(env, cred.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}

                                                {(!currentSystem.environments[env] || currentSystem.environments[env]!.creds.length === 0) && (
                                                    <div className="text-center py-4 text-[var(--text-tertiary)] text-sm">
                                                        {tr.noCredentialsYet}
                                                    </div>
                                                )}
                                            </div>

                                            {/* 一键清空按钮 */}
                                            {currentSystem.environments[env] && (
                                                <div className="pt-4 border-t border-slate-200">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() => handleClearEnvironment(env)}
                                                    >
                                                        <Trash2 className="w-3 h-3 mr-2" />
                                                        {tr.clearThisEnv}
                                                    </Button>
                                                </div>
                                            )}
                                        </Card>
                                    </TabsContent>
                                ))}
                            </Tabs>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-[var(--text-tertiary)]">
                            {tr.selectSystemToEdit}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
