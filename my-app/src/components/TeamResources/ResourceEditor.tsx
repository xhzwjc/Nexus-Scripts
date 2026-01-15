import React, { useState, useRef } from 'react';
import { ResourceGroup, SystemResource, Credential, Environment, SystemEnvironment } from '@/lib/team-resources-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Save, Trash2, ArrowLeft, Building2, Database, Globe, Key, Upload, X, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
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
    onSave: (groups: ResourceGroup[]) => void;
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
            className={`p-2 rounded-md cursor-pointer text-sm font-medium flex items-center gap-2 group ${isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}`}
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
                <GripVertical className="w-3 h-3 text-slate-400" />
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
            className={`p-2 rounded-md cursor-pointer text-sm flex items-center gap-2 group ${isActive ? 'bg-white shadow-sm border border-blue-200 text-blue-700' : 'hover:bg-white text-slate-700'}`}
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
                <GripVertical className="w-3 h-3 text-slate-400" />
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
            name: '新集团',
            systems: []
        };
        setEditedGroups([...editedGroups, newGroup]);
        setActiveGroupId(id);
        setActiveSystemId('');
    };

    // 删除集团
    const handleDeleteGroup = (groupId: string) => {
        if (editedGroups.length <= 1) {
            toast.error('至少保留一个集团');
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
            name: '新系统',
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

    // 更新集团LOGO
    const logoInputRef = useRef<HTMLInputElement>(null);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentGroup) return;

        // 限制文件大小（2MB）
        if (file.size > 2 * 1024 * 1024) {
            toast.error('图片大小不能超过2MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setEditedGroups(editedGroups.map(g =>
                g.id === activeGroupId ? { ...g, logo: base64 } : g
            ));
            toast.success('LOGO已上传');
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveLogo = () => {
        if (!currentGroup) return;
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

    // 添加凭证
    const handleAddCredential = (env: Environment) => {
        if (!currentSystem) return;
        const newEnvs = { ...currentSystem.environments };
        if (!newEnvs[env]) {
            newEnvs[env] = { url: '', creds: [] };
        }
        const newCred: Credential = {
            id: `cred-${Date.now()}`,
            label: '新账号',
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
        toast.success(`已清空${env === 'dev' ? '开发' : env === 'test' ? '测试' : '生产'}环境`);
    };

    const handleSaveClick = () => {
        onSave(editedGroups);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* 顶部工具栏 */}
            <div className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-lg font-bold text-slate-800">资源管理</h2>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onCancel}>取消</Button>
                    <Button onClick={handleSaveClick} className="bg-blue-600 hover:bg-blue-700">
                        <Save className="w-4 h-4 mr-2" />
                        保存更改
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* 左侧：集团列表 */}
                <div className="w-56 bg-white border-r border-slate-200 p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <Label className="text-slate-500 font-medium text-xs uppercase">集团列表</Label>
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
                <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <Label className="text-slate-500 font-medium text-xs uppercase">系统列表</Label>
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
                                placeholder="集团名称"
                            />

                            {/* LOGO 上传 */}
                            <div className="space-y-2">
                                <Label className="text-xs text-slate-500">LOGO (可选)</Label>
                                {currentGroup.logo ? (
                                    <div className="relative w-full h-16 bg-white rounded-lg border border-slate-200 overflow-hidden group">
                                        <img
                                            src={currentGroup.logo}
                                            alt="Group Logo"
                                            className="w-full h-full object-contain"
                                        />
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="absolute top-1 right-1 h-5 w-5 bg-white/80 opacity-0 group-hover:opacity-100 text-red-500"
                                            onClick={handleRemoveLogo}
                                        >
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div
                                        className="w-full h-16 bg-white rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                                        onClick={() => logoInputRef.current?.click()}
                                    >
                                        <div className="text-center">
                                            <Upload className="w-4 h-4 mx-auto text-slate-400" />
                                            <span className="text-xs text-slate-400">点击上传</span>
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
                            <div className="text-center py-8 text-slate-400 text-sm">
                                暂无系统，点击 + 添加
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
                                        <Label>系统名称</Label>
                                        <Input
                                            value={currentSystem.name}
                                            onChange={(e) => handleUpdateSystem('name', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>描述</Label>
                                        <Input
                                            value={currentSystem.description || ''}
                                            onChange={(e) => handleUpdateSystem('description', e.target.value)}
                                            placeholder="可选"
                                        />
                                    </div>
                                </div>
                            </Card>

                            {/* 环境配置 */}
                            <Tabs defaultValue="prod" className="w-full">
                                <TabsList className="w-full grid grid-cols-3">
                                    <TabsTrigger value="dev">开发环境</TabsTrigger>
                                    <TabsTrigger value="test">测试环境</TabsTrigger>
                                    <TabsTrigger value="prod">生产环境</TabsTrigger>
                                </TabsList>

                                {(['dev', 'test', 'prod'] as Environment[]).map(env => (
                                    <TabsContent key={env} value={env} className="mt-4 space-y-4">
                                        <Card className="p-4 space-y-4">
                                            <div className="space-y-2">
                                                <Label className="flex items-center gap-2">
                                                    <Globe className="w-4 h-4" />
                                                    访问地址
                                                </Label>
                                                <Input
                                                    value={currentSystem.environments[env]?.url || ''}
                                                    onChange={(e) => handleUpdateEnvUrl(env, e.target.value)}
                                                    placeholder="example.com"
                                                />
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <Label className="flex items-center gap-2">
                                                        <Key className="w-4 h-4" />
                                                        凭证列表
                                                    </Label>
                                                    <Button variant="outline" size="sm" onClick={() => handleAddCredential(env)}>
                                                        <Plus className="w-3 h-3 mr-1" />
                                                        添加凭证
                                                    </Button>
                                                </div>

                                                {currentSystem.environments[env]?.creds.map(cred => (
                                                    <div key={cred.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                                                        <Input
                                                            value={cred.label}
                                                            onChange={(e) => handleUpdateCredential(env, cred.id, 'label', e.target.value)}
                                                            placeholder="标签"
                                                            className="w-24"
                                                        />
                                                        <Input
                                                            value={cred.username}
                                                            onChange={(e) => handleUpdateCredential(env, cred.id, 'username', e.target.value)}
                                                            placeholder="用户名"
                                                            className="flex-1"
                                                        />
                                                        <Input
                                                            type="password"
                                                            value={cred.password || ''}
                                                            onChange={(e) => handleUpdateCredential(env, cred.id, 'password', e.target.value)}
                                                            placeholder="密码 (可选)"
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
                                                    <div className="text-center py-4 text-slate-400 text-sm">
                                                        暂无凭证
                                                    </div>
                                                )}
                                            </div>

                                            {/* 一键清空按钮 */}
                                            {currentSystem.environments[env] && (
                                                <div className="pt-4 border-t border-slate-200">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                                                        onClick={() => handleClearEnvironment(env)}
                                                    >
                                                        <Trash2 className="w-3 h-3 mr-2" />
                                                        一键清空此环境
                                                    </Button>
                                                </div>
                                            )}
                                        </Card>
                                    </TabsContent>
                                ))}
                            </Tabs>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400">
                            请选择一个系统进行编辑
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
