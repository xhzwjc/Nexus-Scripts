'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, Save, GripVertical, Search, X, Edit2, Check } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AIResource, AICategory, AIResourcesData } from '@/lib/ai-resources-data';
import { toast } from 'sonner';

interface AIResourceEditorProps {
    data: AIResourcesData;
    onCancel: () => void;
    onSave: (data: AIResourcesData) => void;
}

// 动态获取Lucide图标
const getIcon = (iconName: string) => {
    const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
    return icons[iconName] || LucideIcons.Folder;
};

// 可用图标列表
const AVAILABLE_ICONS = [
    'MessageSquare', 'Code', 'Image', 'Video', 'Palette', 'Zap', 'Music',
    'Bot', 'Brain', 'Sparkles', 'Wand2', 'Cpu', 'Globe', 'Layers',
    'FileText', 'Camera', 'Mic', 'Search', 'MoreHorizontal'
];

export function AIResourceEditor({ data, onCancel, onSave }: AIResourceEditorProps) {
    const [editedData, setEditedData] = useState<AIResourcesData>(() => ({
        categories: [...data.categories],
        resources: [...data.resources]
    }));
    const [activeTab, setActiveTab] = useState<'resources' | 'categories'>('resources');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [editingResource, setEditingResource] = useState<AIResource | null>(null);
    const [editingCategory, setEditingCategory] = useState<AICategory | null>(null);
    const [logoCache, setLogoCache] = useState<Record<string, string>>({});

    // 加载logo列表
    useEffect(() => {
        const loadLogos = async () => {
            try {
                const res = await fetch('/api/ai-resources/logo-list');
                const data = await res.json();
                setLogoCache(data.logos || {});
            } catch {
                // ignore
            }
        };
        loadLogos();
    }, []);

    // 过滤资源（使用实时输入框值，避免IME问题）
    const getFilteredResources = () => {
        let resources = editedData.resources;

        if (selectedCategory !== 'all') {
            resources = resources.filter(r => r.category === selectedCategory);
        }

        // 使用实际输入框的值，而不是React状态
        const currentQuery = searchInputRef.current?.value || searchQuery;
        if (currentQuery.trim()) {
            const query = currentQuery.toLowerCase();
            resources = resources.filter(r =>
                r.name.toLowerCase().includes(query) ||
                r.description.toLowerCase().includes(query)
            );
        }

        return resources.sort((a, b) => (a.order || 99) - (b.order || 99));
    };

    // 添加资源
    const handleAddResource = () => {
        const newResource: AIResource = {
            id: `resource_${Date.now()}`,
            name: '新资源',
            description: '描述...',
            url: 'https://',
            logoUrl: '',
            category: selectedCategory === 'all' ? editedData.categories[0]?.id || 'other' : selectedCategory,
            tags: [],
            order: editedData.resources.length + 1
        };
        setEditingResource(newResource);
    };

    // 保存资源编辑
    const handleSaveResource = (resource: AIResource) => {
        setEditedData(prev => {
            const existingIndex = prev.resources.findIndex(r => r.id === resource.id);
            if (existingIndex >= 0) {
                const updated = [...prev.resources];
                updated[existingIndex] = resource;
                return { ...prev, resources: updated };
            } else {
                return { ...prev, resources: [...prev.resources, resource] };
            }
        });
        setEditingResource(null);
    };

    // 删除资源
    const handleDeleteResource = (id: string) => {
        if (confirm('确定删除此资源？')) {
            setEditedData(prev => ({
                ...prev,
                resources: prev.resources.filter(r => r.id !== id)
            }));
        }
    };

    // 添加分类
    const handleAddCategory = () => {
        const newCategory: AICategory = {
            id: `cat_${Date.now()}`,
            name: '新分类',
            icon: 'Folder',
            order: editedData.categories.length + 1
        };
        setEditingCategory(newCategory);
    };

    // 保存分类编辑
    const handleSaveCategory = (category: AICategory) => {
        setEditedData(prev => {
            const existingIndex = prev.categories.findIndex(c => c.id === category.id);
            if (existingIndex >= 0) {
                const updated = [...prev.categories];
                updated[existingIndex] = category;
                return { ...prev, categories: updated };
            } else {
                return { ...prev, categories: [...prev.categories, category] };
            }
        });
        setEditingCategory(null);
    };

    // 删除分类
    const handleDeleteCategory = (id: string) => {
        const hasResources = editedData.resources.some(r => r.category === id);
        if (hasResources) {
            toast.error('该分类下还有资源，无法删除');
            return;
        }
        if (confirm('确定删除此分类？')) {
            setEditedData(prev => ({
                ...prev,
                categories: prev.categories.filter(c => c.id !== id)
            }));
        }
    };

    // 编辑资源（根据ID查找，避免IME闭包问题）
    const handleEditResource = (resourceId: string) => {
        const resource = editedData.resources.find(r => r.id === resourceId);
        if (resource) {
            setEditingResource(resource);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* 顶部工具栏 */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={onCancel}>
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <h1 className="text-xl font-bold text-slate-800">管理AI资源</h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onCancel}>
                            取消
                        </Button>
                        <Button onClick={() => onSave(editedData)} className="bg-blue-500 hover:bg-blue-600 gap-2">
                            <Save className="w-4 h-4" />
                            保存
                        </Button>
                    </div>
                </div>

                {/* 标签切换 */}
                <div className="flex gap-4 mt-4">
                    <button
                        onClick={() => setActiveTab('resources')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'resources'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        资源管理
                    </button>
                    <button
                        onClick={() => setActiveTab('categories')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'categories'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        分类管理
                    </button>
                </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-hidden p-6">
                {activeTab === 'resources' ? (
                    <div className="h-full flex flex-col">
                        {/* 工具栏 */}
                        <div className="flex items-center gap-4 mb-4">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    ref={searchInputRef}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="搜索资源..."
                                    className="pl-9"
                                />
                            </div>

                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            >
                                <option value="all">全部分类</option>
                                {editedData.categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>

                            <Button onClick={handleAddResource} className="gap-2 bg-green-500 hover:bg-green-600">
                                <Plus className="w-4 h-4" />
                                添加资源
                            </Button>
                        </div>

                        {/* 资源列表 */}
                        <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200">
                            <table className="w-full">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr className="text-left text-sm text-slate-600">
                                        <th className="px-4 py-3 font-medium">名称</th>
                                        <th className="px-4 py-3 font-medium">描述</th>
                                        <th className="px-4 py-3 font-medium">分类</th>
                                        <th className="px-4 py-3 font-medium">URL</th>
                                        <th className="px-4 py-3 font-medium w-24">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {getFilteredResources().map(resource => (
                                        <tr key={resource.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <GripVertical className="w-4 h-4 text-slate-300 cursor-move" />
                                                    {/* Icon */}
                                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center overflow-hidden border border-slate-200 flex-shrink-0">
                                                        {logoCache[resource.id] ? (
                                                            <img
                                                                src={logoCache[resource.id]}
                                                                alt=""
                                                                className="w-5 h-5 object-contain"
                                                            />
                                                        ) : (
                                                            <LucideIcons.Sparkles className="w-4 h-4 text-slate-300" />
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-slate-800">{resource.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                                                {resource.description}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                                                    {editedData.categories.find(c => c.id === resource.category)?.name || resource.category}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-blue-600 max-w-xs truncate">
                                                {resource.url}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            handleEditResource(resource.id);
                                                        }}
                                                        className="h-8 w-8"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDeleteResource(resource.id)}
                                                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {getFilteredResources().length === 0 && (
                                <div className="text-center py-12 text-slate-500">
                                    没有找到资源
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-800">分类列表</h2>
                            <Button onClick={handleAddCategory} className="gap-2 bg-green-500 hover:bg-green-600">
                                <Plus className="w-4 h-4" />
                                添加分类
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200">
                            <table className="w-full">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr className="text-left text-sm text-slate-600">
                                        <th className="px-4 py-3 font-medium">图标</th>
                                        <th className="px-4 py-3 font-medium">名称</th>
                                        <th className="px-4 py-3 font-medium">ID</th>
                                        <th className="px-4 py-3 font-medium">排序</th>
                                        <th className="px-4 py-3 font-medium">资源数</th>
                                        <th className="px-4 py-3 font-medium w-24">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {editedData.categories.sort((a, b) => a.order - b.order).map(category => {
                                        const Icon = getIcon(category.icon);
                                        const resourceCount = editedData.resources.filter(r => r.category === category.id).length;
                                        return (
                                            <tr key={category.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <GripVertical className="w-4 h-4 text-slate-300 cursor-move" />
                                                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                                            <Icon className="w-4 h-4 text-blue-600" />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-800">
                                                    {category.name}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-500">
                                                    {category.id}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600">
                                                    {category.order}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                                                        {resourceCount} 个
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setEditingCategory(category)}
                                                            className="h-8 w-8"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDeleteCategory(category.id)}
                                                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* 资源编辑弹窗 */}
            {editingResource && (
                <ResourceEditModal
                    resource={editingResource}
                    categories={editedData.categories}
                    onSave={handleSaveResource}
                    onCancel={() => setEditingResource(null)}
                />
            )}

            {/* 分类编辑弹窗 */}
            {editingCategory && (
                <CategoryEditModal
                    category={editingCategory}
                    onSave={handleSaveCategory}
                    onCancel={() => setEditingCategory(null)}
                />
            )}
        </div>
    );
}

// 资源编辑弹窗
function ResourceEditModal({
    resource,
    categories,
    onSave,
    onCancel
}: {
    resource: AIResource;
    categories: AICategory[];
    onSave: (resource: AIResource) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState<AIResource>(resource);
    const [tagsInput, setTagsInput] = useState(resource.tags?.join(', ') || '');
    const [isUploading, setIsUploading] = useState(false);
    const [iconPath, setIconPath] = useState<string | null>(null);
    const [imgError, setImgError] = useState(false);

    // 加载现有icon
    useEffect(() => {
        const loadIcon = async () => {
            try {
                const res = await fetch('/api/ai-resources/logo-list');
                const data = await res.json();
                if (data.logos && data.logos[resource.id]) {
                    setIconPath(data.logos[resource.id]);
                }
            } catch {
                // ignore
            }
        };
        loadIcon();
    }, [resource.id]);

    const handleSave = () => {
        if (!form.name.trim() || !form.url.trim()) {
            toast.error('名称和URL不能为空');
            return;
        }
        onSave({
            ...form,
            tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean)
        });
    };

    // 处理icon上传
    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            toast.error('请选择图片文件');
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('id', form.id);

            const res = await fetch('/api/ai-resources/logo-upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                toast.success('Icon上传成功');
                // 更新预览
                setIconPath(data.path + '?t=' + Date.now()); // 添加时间戳防止缓存
                setImgError(false);
            } else {
                toast.error('上传失败: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            toast.error('上传失败');
            console.error('Upload error:', error);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800">
                        {resource.id.startsWith('resource_') ? '添加资源' : '编辑资源'}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">名称 *</label>
                        <Input
                            value={form.name}
                            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="如: ChatGPT"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                        <Input
                            value={form.description}
                            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="简短描述"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">URL *</label>
                        <Input
                            value={form.url}
                            onChange={(e) => setForm(prev => ({ ...prev, url: e.target.value }))}
                            placeholder="https://..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Icon</label>
                        <div className="flex items-center gap-4">
                            {/* Icon预览 */}
                            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center overflow-hidden border border-slate-200">
                                {iconPath && !imgError ? (
                                    <img
                                        src={iconPath}
                                        alt="icon"
                                        className="w-10 h-10 object-contain"
                                        onError={() => setImgError(true)}
                                    />
                                ) : (
                                    <LucideIcons.Sparkles className="w-6 h-6 text-slate-300" />
                                )}
                            </div>

                            {/* 上传按钮 */}
                            <div className="flex-1">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleIconUpload}
                                    disabled={isUploading}
                                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    保存到 public/ai-logos/{form.id}.*
                                </p>
                            </div>

                            {isUploading && (
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
                        <select
                            value={form.category}
                            onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        >
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">标签</label>
                        <Input
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="用逗号分隔，如: AI, 对话, 免费"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">排序</label>
                        <Input
                            type="number"
                            value={form.order || 99}
                            onChange={(e) => setForm(prev => ({ ...prev, order: parseInt(e.target.value) || 99 }))}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
                    <Button variant="outline" onClick={onCancel}>取消</Button>
                    <Button onClick={handleSave} className="bg-blue-500 hover:bg-blue-600 gap-2">
                        <Check className="w-4 h-4" />
                        保存
                    </Button>
                </div>
            </div>
        </div>
    );
}

// 分类编辑弹窗
function CategoryEditModal({
    category,
    onSave,
    onCancel
}: {
    category: AICategory;
    onSave: (category: AICategory) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState<AICategory>(category);

    const handleSave = () => {
        if (!form.name.trim()) {
            toast.error('名称不能为空');
            return;
        }
        onSave(form);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800">
                        {category.id.startsWith('cat_') ? '添加分类' : '编辑分类'}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">名称 *</label>
                        <Input
                            value={form.name}
                            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="如: AI对话"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">图标</label>
                        <div className="grid grid-cols-6 gap-2 mt-2">
                            {AVAILABLE_ICONS.map(iconName => {
                                const Icon = getIcon(iconName);
                                return (
                                    <button
                                        key={iconName}
                                        onClick={() => setForm(prev => ({ ...prev, icon: iconName }))}
                                        className={`p-2 rounded-lg border-2 transition-colors ${form.icon === iconName
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5 mx-auto text-slate-600" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">排序</label>
                        <Input
                            type="number"
                            value={form.order}
                            onChange={(e) => setForm(prev => ({ ...prev, order: parseInt(e.target.value) || 99 }))}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
                    <Button variant="outline" onClick={onCancel}>取消</Button>
                    <Button onClick={handleSave} className="bg-blue-500 hover:bg-blue-600 gap-2">
                        <Check className="w-4 h-4" />
                        保存
                    </Button>
                </div>
            </div>
        </div>
    );
}
