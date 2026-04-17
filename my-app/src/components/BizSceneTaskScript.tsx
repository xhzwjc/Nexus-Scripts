import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { ArrowLeft, Play, Loader2, CheckCircle2, Info, Edit3, Save, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { getApiBaseUrl } from '../lib/api';
import { getScriptHubAuthHeaderRecord } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface BizSceneTaskScriptProps {
    onBack: () => void;
}

interface InitResult {
    request_id: string;
    created_count: number;
    created_scenes?: string[];
    created_tasks?: string[];
    skipped_count?: number;
    skipped_scenes?: string[];
}

interface ApiResponse {
    success: boolean;
    message: string;
    data?: InitResult;
    request_id?: string;
}

// 可编辑的业务场景字段
interface EditableSceneFields {
    scene_name: string;
    scene_no: string;
    business_type: number;   // 1=灵活用工, 2=连续劳务
    task_type: number;        // 0=指派, 1=抢单
    is_exempt: boolean;      // 是否存在免报（仅连续劳务有效）
    scene_desc: string;      // 业务场景描述
}

// 6个业务场景模板
const DEFAULT_SCENES: EditableSceneFields[] = [
    { scene_name: "连续劳务|免报|指派", scene_no: "YWCJ-000005", business_type: 2, task_type: 0, is_exempt: true, scene_desc: "连续劳务|免报|指派" },
    { scene_name: "连续劳务|不免报|指派", scene_no: "YWCJ-000006", business_type: 2, task_type: 0, is_exempt: false, scene_desc: "连续劳务|不免报|指派" },
    { scene_name: "灵活用工|免报|指派", scene_no: "YWCJ-000007", business_type: 1, task_type: 0, is_exempt: false, scene_desc: "灵活用工|免报|指派" },
    { scene_name: "灵活用工|免报|抢单", scene_no: "YWCJ-000008", business_type: 1, task_type: 1, is_exempt: false, scene_desc: "灵活用工|免报|抢单" },
    { scene_name: "连续劳务|免报|抢单", scene_no: "YWCJ-000009", business_type: 2, task_type: 1, is_exempt: true, scene_desc: "连续劳务|免报|抢单" },
    { scene_name: "连续劳务|不免报|抢单", scene_no: "YWCJ-000010", business_type: 2, task_type: 1, is_exempt: false, scene_desc: "连续劳务|不免报|抢单" },
];

export default function BizSceneTaskScript({ onBack }: BizSceneTaskScriptProps) {
    const { t } = useI18n();

    // 环境
    const [environment, setEnvironment] = useState('test');

    // 场景编辑状态
    const [scenes, setScenes] = useState<EditableSceneFields[]>(DEFAULT_SCENES);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editBuffer, setEditBuffer] = useState<EditableSceneFields | null>(null);
    const [sceneLoading, setSceneLoading] = useState(false);
    const [sceneResult, setSceneResult] = useState<InitResult | null>(null);
    const [showSceneConfirm, setShowSceneConfirm] = useState(false);
    const [sceneListExpanded, setSceneListExpanded] = useState(false);

    // 任务添加参数
    const [enterprises, setEnterprises] = useState<{id: number; enterprise_name: string; tenant_id: number}[]>([]);
    const [selectedEnterprise, setSelectedEnterprise] = useState<{id: number; enterprise_name: string; tenant_id: number} | null>(null);
    const [departments, setDepartments] = useState<{dept_id: number; dept_name: string}[]>([]);
    const [selectedDept, setSelectedDept] = useState<{dept_id: number; dept_name: string} | null>(null);
    const [taxId, setTaxId] = useState('1');
    const [enableAssign, setEnableAssign] = useState(true);
    const [enableGrab, setEnableGrab] = useState(true);
    const [enableDeliveryType1, setEnableDeliveryType1] = useState(true);
    const [enableEnterpriseDelivery, setEnableEnterpriseDelivery] = useState(true);
    const [taskLoading, setTaskLoading] = useState(false);
    const [taskLoadingEnterprise, setTaskLoadingEnterprise] = useState(false);
    const [taskResult, setTaskResult] = useState<InitResult | null>(null);

    // 获取企业列表
    useEffect(() => {
        const fetchEnterprises = async () => {
            const base = getApiBaseUrl();
            if (!base) return;
            setTaskLoadingEnterprise(true);
            try {
                const res = await axios.post(`${base}/enterprise/list`, { environment }, { headers: getScriptHubAuthHeaderRecord() });
                if (res.data.success) {
                    setEnterprises(res.data.data.enterprises || []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setTaskLoadingEnterprise(false);
            }
        };
        fetchEnterprises();
    }, [environment]);

    // 选中企业后获取部门列表
    useEffect(() => {
        if (!selectedEnterprise) {
            setDepartments([]);
            setSelectedDept(null);
            return;
        }
        const fetchDepartments = async () => {
            const base = getApiBaseUrl();
            if (!base) return;
            try {
                const res = await axios.post(`${base}/department/list`, { environment, tenant_id: selectedEnterprise.tenant_id }, { headers: getScriptHubAuthHeaderRecord() });
                if (res.data.success) {
                    const depts = res.data.data.departments || [];
                    setDepartments(depts);
                    if (depts.length > 0) {
                        setSelectedDept(depts[0]);
                    } else {
                        setSelectedDept(null);
                    }
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchDepartments();
    }, [selectedEnterprise, environment]);

    // 企业选择变化
    const handleEnterpriseChange = (enterpriseId: string) => {
        const ent = enterprises.find(e => e.id === parseInt(enterpriseId));
        if (ent) {
            setSelectedEnterprise(ent);
            setSelectedDept(null);
        } else {
            setSelectedEnterprise(null);
        }
    };

    // 部门选择变化
    const handleDeptChange = (deptId: string) => {
        const dept = departments.find(d => d.dept_id === parseInt(deptId));
        setSelectedDept(dept || null);
    };

    // 开始编辑
    const startEdit = (index: number) => {
        setEditingIndex(index);
        setEditBuffer({ ...scenes[index] });
    };

    // 取消编辑
    const cancelEdit = () => {
        setEditingIndex(null);
        setEditBuffer(null);
    };

    // 保存编辑
    const saveEdit = () => {
        if (editBuffer && editingIndex !== null) {
            const newScenes = [...scenes];
            newScenes[editingIndex] = editBuffer;
            setScenes(newScenes);
            setEditingIndex(null);
            setEditBuffer(null);
        }
    };

    // 更新编辑缓冲
    const updateEditBuffer = (field: keyof EditableSceneFields, value: string | number | null) => {
        if (editBuffer) {
            setEditBuffer({ ...editBuffer, [field]: value });
        }
    };

    // 获取变更好的场景（只返回有变更的）
    const getChangedScenes = (): EditableSceneFields[] => {
        return scenes.map((scene, index) => {
            const original = DEFAULT_SCENES[index];
            const changed: Partial<EditableSceneFields> = {};
            (Object.keys(scene) as Array<keyof EditableSceneFields>).forEach(key => {
                if (scene[key] !== original[key]) {
                    (changed as Record<string, unknown>)[key] = scene[key];
                }
            });
            // 返回完整对象，前端可判断哪些字段有变更
            return { ...scene };
        });
    };

    const handleInitScene = async () => {
        const base = getApiBaseUrl();
        if (!base) return;
        setSceneLoading(true);
        setSceneResult(null);
        try {
            const headers = getScriptHubAuthHeaderRecord();
            const response = await axios.post<ApiResponse>(
                `${base}/biz-scene/init`,
                {
                    environment,
                    scenes: scenes,
                },
                { headers }
            );
            if (response.data.success) {
                setSceneResult(response.data.data || null);
                toast.success(response.data.message);
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            toast.error(`添加失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSceneLoading(false);
        }
    };

    const handleInitTask = async () => {
        const base = getApiBaseUrl();
        if (!base) return;
        if (!selectedEnterprise || !selectedDept || !taxId) {
            toast.error('请选择企业、部门并填写税地');
            return;
        }

        setTaskLoading(true);
        setTaskResult(null);
        try {
            const headers = getScriptHubAuthHeaderRecord();
            const response = await axios.post<ApiResponse>(
                `${base}/biz-task/init`,
                {
                    environment,
                    enterprise_id: selectedEnterprise.id,
                    tenant_id: selectedEnterprise.tenant_id,
                    tax_id: parseInt(taxId),
                    dept_id: selectedDept.dept_id,
                    creator: 'system',
                    enable_assign: enableAssign,
                    enable_grab: enableGrab,
                    enable_delivery_type_1: enableDeliveryType1,
                    enable_enterprise_delivery: enableEnterpriseDelivery,
                },
                { headers }
            );
            if (response.data.success) {
                setTaskResult(response.data.data || null);
                toast.success(response.data.message);
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            toast.error(`添加失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setTaskLoading(false);
        }
    };

    const baseTaskCount = (enableAssign ? 6 : 0) + (enableGrab ? 6 : 0);
    const taskCount = (enableEnterpriseDelivery ? baseTaskCount : 0) + (enableDeliveryType1 ? baseTaskCount : 0);

    return (
        <div className="flex flex-col h-full">
            {/* 顶部导航 */}
            <div className="flex items-center gap-4 px-6 py-4 border-b">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    返回
                </Button>
                <div>
                    <h1 className="text-lg font-semibold">业务场景与任务添加</h1>
                    <p className="text-sm text-muted-foreground">添加业务场景和任务数据，支持按需配置</p>
                </div>
            </div>

            {/* 主体内容 */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* 环境选择 */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <Label>运行环境</Label>
                            <select
                                value={environment}
                                onChange={(e) => setEnvironment(e.target.value)}
                                className="border rounded px-3 py-1.5"
                            >
                                <option value="test">测试环境</option>
                                <option value="prod">生产环境</option>
                                <option value="local">本地环境</option>
                            </select>
                        </div>
                    </CardContent>
                </Card>

                {/* 业务场景添加 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <span>业务场景添加</span>
                            <Info className="h-4 w-4 text-muted-foreground" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            编辑业务场景参数后保存，然后添加（支持重复插入）
                        </p>

                        {/* 场景列表 */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">场景列表 ({scenes.length})</span>
                            <button
                                onClick={() => setSceneListExpanded(!sceneListExpanded)}
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {sceneListExpanded ? '收起' : '展开'}
                            </button>
                        </div>
                        {sceneListExpanded && (
                        <div className="space-y-3">
                            {scenes.map((scene, index) => (
                                <div key={index} className="border rounded-lg p-4 bg-muted/30">
                                    {editingIndex === index ? (
                                        // 编辑模式
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <div>
                                                    <Label className="text-xs">场景名称</Label>
                                                    <Input
                                                        value={editBuffer?.scene_name || ''}
                                                        onChange={(e) => updateEditBuffer('scene_name', e.target.value)}
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">场景编号</Label>
                                                    <Input
                                                        value={editBuffer?.scene_no || ''}
                                                        onChange={(e) => updateEditBuffer('scene_no', e.target.value)}
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">业务类型</Label>
                                                    <select
                                                        value={editBuffer?.business_type || 1}
                                                        onChange={(e) => updateEditBuffer('business_type', parseInt(e.target.value))}
                                                        className="border rounded px-2 py-1 w-full mt-1"
                                                    >
                                                        <option value={1}>灵活用工</option>
                                                        <option value={2}>连续劳务</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label className="text-xs">任务类型</Label>
                                                    <select
                                                        value={editBuffer?.task_type || 0}
                                                        onChange={(e) => updateEditBuffer('task_type', parseInt(e.target.value))}
                                                        className="border rounded px-2 py-1 w-full mt-1"
                                                    >
                                                        <option value={0}>指派</option>
                                                        <option value={1}>抢单</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label className="text-xs">是否存在免报</Label>
                                                    <select
                                                        value={editBuffer?.is_exempt ? 'true' : 'false'}
                                                        onChange={(e) => updateEditBuffer('is_exempt', e.target.value === 'true' ? 1 : 0)}
                                                        disabled={editBuffer?.business_type === 1}
                                                        className="border rounded px-2 py-1 w-full mt-1 disabled:opacity-50"
                                                    >
                                                        <option value="false">否（灵活用工默认）</option>
                                                        <option value="true">是</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-2">
                                                    <Label className="text-xs">业务场景描述</Label>
                                                    <Input
                                                        value={editBuffer?.scene_desc || ''}
                                                        onChange={(e) => updateEditBuffer('scene_desc', e.target.value)}
                                                        className="mt-1"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <Button variant="outline" size="sm" onClick={cancelEdit}>
                                                    <X className="h-4 w-4 mr-1" />
                                                    取消
                                                </Button>
                                                <Button size="sm" onClick={saveEdit}>
                                                    <Save className="h-4 w-4 mr-1" />
                                                    保存
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        // 显示模式
                                        <div className="flex items-center justify-between">
                                            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm flex-1">
                                                <div className="flex gap-2">
                                                    <span className="text-muted-foreground">名称:</span>
                                                    <span className="font-medium">{scene.scene_name}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="text-muted-foreground">编号:</span>
                                                    <span>{scene.scene_no}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="text-muted-foreground">业务类型:</span>
                                                    <span>{scene.business_type === 1 ? '灵活用工' : '连续劳务'}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="text-muted-foreground">任务类型:</span>
                                                    <span>{scene.task_type === 0 ? '指派' : '抢单'}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="text-muted-foreground">是否存在免报:</span>
                                                    <span>{scene.is_exempt ? '是' : '否'}</span>
                                                </div>
                                                <div className="flex gap-2 col-span-3">
                                                    <span className="text-muted-foreground">场景描述:</span>
                                                    <span>{scene.scene_desc}</span>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => startEdit(index)}>
                                                <Edit3 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        )}

                        <Button
                            onClick={() => setShowSceneConfirm(true)}
                            disabled={sceneLoading}
                        >
                            {sceneLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    添加中...
                                </>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-1" />
                                    添加场景
                                </>
                            )}
                        </Button>

                        {sceneResult && (
                            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <span className="font-medium">添加成功</span>
                                </div>
                                <div className="text-sm space-y-1">
                                    <p>请求ID: {sceneResult.request_id}</p>
                                    {sceneResult.created_scenes && sceneResult.created_scenes.length > 0 && (
                                        <p>创建场景: {sceneResult.created_scenes.join(', ')}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 任务添加 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <span>任务添加</span>
                            <Info className="h-4 w-4 text-muted-foreground" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            按企业创建任务，可同时选择企业交付和合作者交付
                        </p>

                        {/* 企业信息 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <Label htmlFor="enterpriseId">选择企业 *</Label>
                                <select
                                    id="enterpriseId"
                                    value={selectedEnterprise?.id?.toString() || ''}
                                    onChange={(e) => handleEnterpriseChange(e.target.value)}
                                    disabled={taskLoadingEnterprise}
                                    className="border rounded px-2 py-1.5 w-full mt-1"
                                >
                                    <option value="">-- 选择企业 --</option>
                                    {enterprises.map((ent) => (
                                        <option key={ent.id} value={ent.id.toString()}>
                                            {ent.enterprise_name} (ID:{ent.id})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label>租户ID</Label>
                                <div className="border rounded px-3 py-1.5 mt-1 bg-muted/30 text-sm">
                                    {selectedEnterprise?.tenant_id || '-'}
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="deptId">部门ID</Label>
                                {departments.length > 1 ? (
                                    <select
                                        id="deptId"
                                        value={selectedDept?.dept_id?.toString() || ''}
                                        onChange={(e) => handleDeptChange(e.target.value)}
                                        className="border rounded px-2 py-1.5 w-full mt-1"
                                    >
                                        <option value="">-- 选择部门 --</option>
                                        {departments.map((dept) => (
                                            <option key={dept.dept_id} value={dept.dept_id.toString()}>
                                                {dept.dept_name} (ID:{dept.dept_id})
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="border rounded px-3 py-1.5 mt-1 bg-muted/30 text-sm">
                                        {departments.map(d => d.dept_id).join(', ') || '-'}
                                    </div>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="taxId">税地ID *</Label>
                                <Input
                                    id="taxId"
                                    type="number"
                                    value={taxId}
                                    onChange={(e) => setTaxId(e.target.value)}
                                    placeholder="1"
                                />
                            </div>
                        </div>

                        {/* 任务配置 */}
                        <div className="space-y-3">
                            <Label>任务配置</Label>
                            <div className="flex flex-wrap gap-4">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={enableAssign}
                                        onCheckedChange={(checked) => setEnableAssign(!!checked)}
                                        id="enable-assign"
                                    />
                                    <Label htmlFor="enable-assign" className="text-sm">
                                        指派任务
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={enableGrab}
                                        onCheckedChange={(checked) => setEnableGrab(!!checked)}
                                        id="enable-grab"
                                    />
                                    <Label htmlFor="enable-grab" className="text-sm">
                                        抢单任务
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={enableEnterpriseDelivery}
                                        onCheckedChange={(checked) => setEnableEnterpriseDelivery(!!checked)}
                                        id="enable-enterprise-delivery"
                                    />
                                    <Label htmlFor="enable-enterprise-delivery" className="text-sm">
                                        企业交付
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={enableDeliveryType1}
                                        onCheckedChange={(checked) => setEnableDeliveryType1(!!checked)}
                                        id="enable-delivery-type1"
                                    />
                                    <Label htmlFor="enable-delivery-type1" className="text-sm">
                                        合作者交付
                                    </Label>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                将创建约 {taskCount} 个任务
                            </p>
                        </div>

                        <Button
                            onClick={handleInitTask}
                            disabled={taskLoading || !selectedEnterprise || !selectedDept || !taxId}
                        >
                            {taskLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    添加中...
                                </>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-1" />
                                    添加任务
                                </>
                            )}
                        </Button>

                        {taskResult && (
                            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <span className="font-medium">添加成功</span>
                                </div>
                                <div className="text-sm space-y-1">
                                    <p>请求ID: {taskResult.request_id}</p>
                                    <p>创建任务数: {taskResult.created_count}</p>
                                    {taskResult.created_tasks && taskResult.created_tasks.length > 0 && (
                                        <div className="mt-2">
                                            <p className="font-medium">任务列表:</p>
                                            <ul className="list-disc list-inside text-muted-foreground">
                                                {taskResult.created_tasks.map((name, idx) => (
                                                    <li key={idx}>{name}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <ConfirmDialog
                open={showSceneConfirm}
                title="确认添加业务场景"
                description="即将添加6个标准业务场景（YWCJ-000005 ~ YWCJ-000010），是否继续？"
                confirmText="确认创建"
                cancelText="取消"
                onCancel={() => setShowSceneConfirm(false)}
                onConfirm={() => {
                    setShowSceneConfirm(false);
                    handleInitScene();
                }}
            />
        </div>
    );
}
