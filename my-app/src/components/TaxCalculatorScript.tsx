import React, {useState, useCallback, useEffect} from 'react';
import axios from 'axios';
import {Toaster, toast} from 'sonner';
import {
    ArrowLeft,
    Loader2,
    RefreshCw,
    Info,
    CheckCircle,
    Plus,
    Trash2,
    Copy,
    X,
    Download
} from 'lucide-react';

// UI Components
import {Button} from './ui/button';
import {Card, CardContent, CardHeader, CardTitle, CardDescription} from './ui/card';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';
import {Badge} from './ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './ui/table';
import {Checkbox} from './ui/checkbox';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from './ui/dialog';

// Types
interface MockRecord {
    id: string; // 唯一ID用于React key
    year_month: string;
    bill_amount: number;
}

interface TaxCalculationParams {
    credential_num: string; // ID number
    income_type: number; // 1:劳务报酬; 2:工资薪金
    year: number;
    realname: string;
    accumulated_special_deduction: number;
    use_mock_data: boolean;
    mock_records: MockRecord[];
    environment: 'test' | 'prod' | 'local';
}

interface TaxCalculationItem {
    year_month: string;
    bill_amount: number;
    tax: number;
    income_type: number;
    income_type_name: string;
    income_amount: number;
    accumulated_deduction: number;
    accumulated_special: number;
    calculation_steps: string[];
    accumulated_taxable: number;
    tax_rate: number;
    accumulated_total_tax: number;
}

interface TaxCalculationResponse {
    success: boolean;
    message: string;
    data: TaxCalculationItem[];
    total_tax: number;
    request_id: string;
}

// API Base URL Helper
const getApiBaseUrl = (): string | null => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base) {
        toast.error('缺少环境变量 NEXT_PUBLIC_API_BASE_URL，请配置后重试');
        return null;
    }
    return base;
};

// Generate default mock records for a given year with unique IDs
const generateDefaultMockRecords = (year: number): MockRecord[] => {
    return Array.from({length: 12}, (_, i) => ({
        id: `${year}-${String(i + 1).padStart(2, '0')}-${Date.now()}-${i}`, // 确保唯一key
        year_month: `${year}-${String(i + 1).padStart(2, '0')}`,
        bill_amount: 0
    }));
};

// 导出CSV功能
const exportToCSV = (data: TaxCalculationItem[], totalTax: number) => {
    // 表头与表格保持一致
    const headers = [
        '年月',
        '账单金额',
        '收入金额',
        '累计减除费用',
        '累计专项扣除',
        '应纳税所得额',
        '税率',
        '累计应纳税额',
        '当月税额'
    ];

    // 转换数据，确保年月格式为YYYY-MM
    const rows = data.map(item => [
        item.year_month, // 直接使用已有的YYYY-MM格式
        item.bill_amount.toFixed(2),
        item.income_amount.toFixed(2),
        item.accumulated_deduction.toFixed(2),
        item.accumulated_special.toFixed(2),
        item.accumulated_taxable.toFixed(2),
        `${(item.tax_rate * 100).toFixed(2)}%`,
        item.accumulated_total_tax.toFixed(2),
        item.tax.toFixed(2)
    ]);

    // 添加总计行
    rows.push(['', '', '', '', '', '', '', '总税额', totalTax.toFixed(2)]);

    // 构建CSV内容
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    // 创建下载链接
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `税额计算结果_${new Date().toLocaleDateString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// 验证年月格式是否为YYYY-MM
const isValidYearMonthFormat = (value: string): boolean => {
    const regex = /^\d{4}-\d{2}$/;
    if (!regex.test(value)) return false;

    const [year, month] = value.split('-').map(Number);
    return month >= 1 && month <= 12;
};

// Main Component
export default function TaxCalculationScript({onBack}: { onBack: () => void }) {
    // State Management
    const [params, setParams] = useState<TaxCalculationParams>({
        credential_num: '',
        income_type: 1,
        year: new Date().getFullYear(),
        realname: '',
        accumulated_special_deduction: 0,
        use_mock_data: false,
        mock_records: generateDefaultMockRecords(new Date().getFullYear()),
        environment: 'test',
    });
    const [isCalculating, setIsCalculating] = useState(false);
    const [results, setResults] = useState<TaxCalculationItem[]>([]);
    const [totalTax, setTotalTax] = useState(0);
    const [hasCalculated, setHasCalculated] = useState(false);
    const [batchAmount, setBatchAmount] = useState<number>(0);
    const [currentDetail, setCurrentDetail] = useState<{
        visible: boolean;
        steps: string[];
        month: string;
    }>({visible: false, steps: [], month: ''});
    const [tempMonthValues, setTempMonthValues] = useState<Record<string, string>>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

    // 初始化临时存储
    useEffect(() => {
        const initialValues: Record<string, string> = {};
        params.mock_records.forEach(record => {
            initialValues[record.id] = record.year_month;
        });
        setTempMonthValues(initialValues);
    }, [params.mock_records]);

    // 当切换模拟数据/非模拟数据模式时，清空计算结果
    useEffect(() => {
        setResults([]);
        setTotalTax(0);
        setHasCalculated(false);
    }, [params.use_mock_data]);

    // Handle Input Change
    const handleParamChange = useCallback(
        <K extends keyof TaxCalculationParams>(key: K, value: TaxCalculationParams[K]) => {
            setParams((prev) => ({...prev, [key]: value}));
        },
        []
    );

    // 临时存储输入值，不立即更新
    const handleMonthInputChange = useCallback((recordId: string, value: string) => {
        setTempMonthValues(prev => ({
            ...prev,
            [recordId]: value
        }));
        // 清除该字段的错误状态
        setValidationErrors(prev => ({
            ...prev,
            [recordId]: false
        }));
    }, []);

    // 失去焦点或回车时验证并更新
    const handleMonthBlurOrEnter = useCallback((index: number, record: MockRecord, event?: React.FormEvent) => {
        // 处理回车键
        if (event && event.type === 'keydown' && (event as React.KeyboardEvent).key !== 'Enter') {
            return;
        }

        const value = tempMonthValues[record.id];
        if (!isValidYearMonthFormat(value)) {
            // 只显示一次错误
            if (!validationErrors[record.id]) {
                toast.error('年月格式不正确，请使用YYYY-MM格式（例如：2025-06）');
                setValidationErrors(prev => ({
                    ...prev,
                    [record.id]: true
                }));
            }
            return;
        }

        // 验证通过，更新实际数据
        setParams(prev => {
            const newRecords = [...prev.mock_records];
            newRecords[index] = {
                ...newRecords[index],
                year_month: value
            };
            return {...prev, mock_records: newRecords};
        });
    }, [tempMonthValues, validationErrors]);

    // Handle mock record bill amount changes
    const handleBillAmountChange = useCallback((index: number, value: string) => {
        setParams(prev => {
            const newRecords = [...prev.mock_records];
            newRecords[index] = {
                ...newRecords[index],
                bill_amount: Number(value) || 0
            };
            return {...prev, mock_records: newRecords};
        });
    }, []);

    // Add new mock record with 12 month limit
    const addMockRecord = useCallback(() => {
        setParams(prev => {
            // Check if we already have 12 records
            if (prev.mock_records.length >= 12) {
                toast.error('最多只能添加12个月的记录');
                return prev;
            }

            // Find the last month to determine next month
            const sortedMonths = [...prev.mock_records]
                .sort((a, b) => a.year_month.localeCompare(b.year_month))
                .map(r => r.year_month);

            let nextYear = prev.year;
            let nextMonth = 1;

            if (sortedMonths.length > 0) {
                const lastMonthStr = sortedMonths[sortedMonths.length - 1];
                const [lastYear, lastMonth] = lastMonthStr.split('-').map(Number);
                nextMonth = lastMonth + 1;
                nextYear = lastYear;

                if (nextMonth > 12) {
                    nextMonth = 1;
                    nextYear++;
                }
            }

            const newRecordId = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${Date.now()}-${prev.mock_records.length}`;
            const newRecord: MockRecord = {
                id: newRecordId,
                year_month: `${nextYear}-${String(nextMonth).padStart(2, '0')}`,
                bill_amount: 0
            };

            // 更新临时值存储
            setTempMonthValues(prevTemp => ({
                ...prevTemp,
                [newRecordId]: newRecord.year_month
            }));

            return {...prev, mock_records: [...prev.mock_records, newRecord]};
        });
    }, []);

    // Remove mock record
    const removeMockRecord = useCallback((index: number, recordId: string) => {
        setParams(prev => {
            const newRecords = [...prev.mock_records];
            newRecords.splice(index, 1);
            return {...prev, mock_records: newRecords};
        });

        // 从临时存储中移除
        setTempMonthValues(prev => {
            const newTemp = {...prev};
            delete newTemp[recordId];
            return newTemp;
        });

        // 从错误状态中移除
        setValidationErrors(prev => {
            const newErrors = {...prev};
            delete newErrors[recordId];
            return newErrors;
        });
    }, []);

    // Reset parameters with preservation of use_mock_data state
    const resetParams = useCallback(() => {
        const currentYear = params.year;
        const keepMockDataState = params.use_mock_data;

        const newMockRecords = generateDefaultMockRecords(currentYear);

        // 重置临时存储
        const initialValues: Record<string, string> = {};
        newMockRecords.forEach(record => {
            initialValues[record.id] = record.year_month;
        });
        setTempMonthValues(initialValues);
        setValidationErrors({});

        setParams(prev => ({
            credential_num: '',
            income_type: 1,
            year: currentYear,
            realname: '',
            accumulated_special_deduction: 0,
            use_mock_data: keepMockDataState,
            mock_records: newMockRecords,
            environment: 'test',
        }));
        setBatchAmount(0);

        // 重置结果
        setResults([]);
        setTotalTax(0);
        setHasCalculated(false);
    }, [params.year, params.use_mock_data]);

    // Apply same amount to all mock records
    const applyBatchAmount = useCallback(() => {
        if (batchAmount <= 0) {
            toast.error('请输入有效的金额');
            return;
        }

        setParams(prev => ({
            ...prev,
            mock_records: prev.mock_records.map(record => ({
                ...record,
                bill_amount: batchAmount
            }))
        }));
    }, [batchAmount]);

    // Tax Calculation
    const calculateTax = useCallback(async () => {
        const baseUrl = getApiBaseUrl();
        if (!baseUrl) return;

        // Validation
        if (!params.use_mock_data && !params.credential_num.trim()) {
            toast.error('请输入身份证号');
            return;
        }

        if (params.use_mock_data && params.mock_records.length === 0) {
            toast.error('请添加至少一条模拟记录');
            return;
        }

        // 验证所有模拟记录的年月格式
        if (params.use_mock_data) {
            const invalidRecords = params.mock_records.filter(
                record => !isValidYearMonthFormat(record.year_month)
            );

            if (invalidRecords.length > 0) {
                toast.error('存在格式不正确的年月，请使用YYYY-MM格式（例如：2025-06）');
                return;
            }
        }

        setIsCalculating(true);
        try {
            const response = await axios.post<TaxCalculationResponse>(`${baseUrl}/tax/calculate`, params);

            if (response.data.success) {
                setResults(response.data.data);
                setTotalTax(response.data.total_tax);
                setHasCalculated(true);
                toast.success(response.data.message);
            } else {
                toast.error(response.data.message || '税额计算失败');
                setResults([]);
                setTotalTax(0);
                setHasCalculated(false);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '税额计算错误，请重试';
            toast.error(errorMsg);
            setResults([]);
            setTotalTax(0);
            setHasCalculated(false);
        } finally {
            setIsCalculating(false);
        }
    }, [params]);

    // Open detail dialog
    const openDetailDialog = useCallback((steps: string[], month: string) => {
        setCurrentDetail({
            visible: true,
            steps,
            month
        });
    }, []);

    // Close detail dialog
    const closeDetailDialog = useCallback(() => {
        setCurrentDetail(prev => ({...prev, visible: false}));
    }, []);

    return (
        <div className="min-h-screen p-6">
            <Toaster richColors position="top-center"/>
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4 mr-2"/>
                        返回脚本列表
                    </Button>
                    <Badge variant={isCalculating ? 'destructive' : 'secondary'}>
                        {isCalculating ? '计算中' : '就绪'}
                    </Badge>
                </div>

                {/* Title Section */}
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">税额计算工具</h1>
                    <p className="text-muted-foreground">
                        提供身份证号、收入类型和年度参数，计算税额明细。支持跨年输入，年月格式为YYYY-MM。
                    </p>
                </div>

                {/* Configuration Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>参数配置</CardTitle>
                        <CardDescription>填写必填项并选择运行环境</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Use Mock Data Checkbox */}
                            <div className="space-y-2 md:col-span-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="use_mock_data"
                                        checked={params.use_mock_data}
                                        onCheckedChange={(checked) =>
                                            handleParamChange('use_mock_data', checked === true)
                                        }
                                        disabled={isCalculating}
                                    />
                                    <Label htmlFor="use_mock_data">使用模拟数据</Label>
                                </div>
                            </div>

                            {/* Credential Num - Only shown when not using mock data */}
                            {!params.use_mock_data && (
                                <div className="space-y-2">
                                    <Label htmlFor="credential_num">身份证号 <span
                                        className="text-red-500">*</span></Label>
                                    <Input
                                        id="credential_num"
                                        value={params.credential_num}
                                        onChange={(e) => handleParamChange('credential_num', e.target.value)}
                                        placeholder="请输入身份证号"
                                        disabled={isCalculating}
                                    />
                                </div>
                            )}

                            {/* Real Name - Only shown when not using mock data */}
                            {!params.use_mock_data && (
                                <div className="space-y-2">
                                    <Label htmlFor="realname">真实姓名</Label>
                                    <Input
                                        id="realname"
                                        value={params.realname}
                                        onChange={(e) => handleParamChange('realname', e.target.value)}
                                        placeholder="（可选）输入真实姓名"
                                        disabled={isCalculating}
                                    />
                                </div>
                            )}

                            {/* Income Type */}
                            <div className="space-y-2">
                                <Label htmlFor="income_type">收入类型</Label>
                                <Select
                                    value={String(params.income_type)}
                                    onValueChange={(value) => handleParamChange('income_type', Number(value))}
                                    disabled={isCalculating}
                                >
                                    <SelectTrigger id="income_type">
                                        <SelectValue placeholder="选择收入类型"/>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">劳务报酬</SelectItem>
                                        <SelectItem value="2">工资薪金</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Year */}
                            <div className="space-y-2">
                                <Label htmlFor="year">参考年份</Label>
                                <Input
                                    id="year"
                                    type="number"
                                    value={String(params.year)}
                                    onChange={(e) => handleParamChange('year', Number(e.target.value))}
                                    disabled={isCalculating}
                                    placeholder="主要计算的年份"
                                />
                            </div>

                            {/* Accumulated Special Deduction */}
                            <div className="space-y-2">
                                <Label htmlFor="accumulated_special_deduction">累计专项扣除（自动累加）</Label>
                                <Input
                                    id="accumulated_special_deduction"
                                    type="number"
                                    step="0.01"
                                    value={String(params.accumulated_special_deduction)}
                                    onChange={(e) => handleParamChange('accumulated_special_deduction', Number(e.target.value) || 0)}
                                    placeholder="请输入累计专项扣除金额"
                                    disabled={isCalculating}
                                />
                            </div>

                            {/* Environment */}
                            <div className="space-y-2">
                                <Label htmlFor="environment">运行环境</Label>
                                <Select
                                    value={params.environment}
                                    onValueChange={(value: 'test' | 'prod' | 'local') => handleParamChange('environment', value)}
                                    disabled={isCalculating}
                                >
                                    <SelectTrigger id="environment">
                                        <SelectValue placeholder="选择运行环境"/>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="test">测试环境</SelectItem>
                                        <SelectItem value="prod">生产环境</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Mock Records Section - Only shown when using mock data */}
                        {params.use_mock_data && (
                            <div className="mt-6 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <h3 className="font-medium">模拟收入记录（{params.mock_records.length}/12）</h3>
                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                        <div className="flex-1 sm:flex-initial">
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={batchAmount || ''}
                                                    onChange={(e) => setBatchAmount(Number(e.target.value) || 0)}
                                                    placeholder="输入统一金额"
                                                    disabled={isCalculating}
                                                    className="flex-1"
                                                />
                                                <Button
                                                    onClick={applyBatchAmount}
                                                    disabled={isCalculating || !batchAmount}
                                                    size="sm"
                                                >
                                                    <Copy className="w-4 h-4 mr-1"/>
                                                    全部应用
                                                </Button>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={addMockRecord}
                                            disabled={isCalculating || params.mock_records.length >= 12}
                                        >
                                            <Plus className="w-4 h-4 mr-1"/>
                                            添加记录
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {params.mock_records.map((record, index) => (
                                        <div key={record.id} className="flex items-end gap-2">
                                            <div className="flex-1 space-y-1">
                                                <Label
                                                    htmlFor={`year_month_${record.id}`}>年月 {index + 1} (YYYY-MM)</Label>
                                                <Input
                                                    id={`year_month_${record.id}`}
                                                    value={tempMonthValues[record.id] || record.year_month}
                                                    onChange={(e) => handleMonthInputChange(record.id, e.target.value)}
                                                    onBlur={() => handleMonthBlurOrEnter(index, record)}
                                                    onKeyDown={(e) => handleMonthBlurOrEnter(index, record, e)}
                                                    disabled={isCalculating}
                                                    placeholder="例如：2025-06"
                                                    className={validationErrors[record.id] ? "border-red-500" : ""}
                                                />
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <Label htmlFor={`bill_amount_${record.id}`}>账单金额</Label>
                                                <Input
                                                    id={`bill_amount_${record.id}`}
                                                    type="number"
                                                    step="0.01"
                                                    value={record.bill_amount}
                                                    onChange={(e) => handleBillAmountChange(index, e.target.value)}
                                                    disabled={isCalculating}
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeMockRecord(index, record.id)}
                                                disabled={isCalculating || params.mock_records.length <= 1}
                                            >
                                                <Trash2 className="w-4 h-4 text-muted-foreground"/>
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <Button variant="ghost" onClick={resetParams} disabled={isCalculating}>
                                <RefreshCw className="w-4 h-4 mr-2"/>
                                重置参数
                            </Button>
                            <Button onClick={calculateTax} disabled={isCalculating}>
                                {isCalculating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                                        计算中...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4 mr-2"/>
                                        开始计算
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Results Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>计算结果</CardTitle>
                        <CardDescription>{hasCalculated ? `税额总计: ${totalTax.toFixed(2)}` : '还没有结果'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {hasCalculated ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>年月</TableHead>
                                        <TableHead>账单金额</TableHead>
                                        <TableHead>收入金额</TableHead>
                                        <TableHead>累计减除费用</TableHead>
                                        <TableHead>累计专项扣除</TableHead>
                                        <TableHead>应纳税所得额</TableHead>
                                        <TableHead>税率</TableHead>
                                        <TableHead>累计应纳税额</TableHead>
                                        <TableHead>当月税额</TableHead>
                                        <TableHead>详情</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.map((item) => (
                                        <TableRow key={`${item.year_month}-${item.bill_amount}-${item.tax}`}>
                                            <TableCell>{item.year_month}</TableCell>
                                            <TableCell>{item.bill_amount.toFixed(2)}</TableCell>
                                            <TableCell>{item.income_amount.toFixed(2)}</TableCell>
                                            <TableCell>{item.accumulated_deduction.toFixed(2)}</TableCell>
                                            <TableCell>{item.accumulated_special.toFixed(2)}</TableCell>
                                            <TableCell>{item.accumulated_taxable.toFixed(2)}</TableCell>
                                            <TableCell>{(item.tax_rate * 100).toFixed(2)}%</TableCell>
                                            <TableCell>{item.accumulated_total_tax.toFixed(2)}</TableCell>
                                            <TableCell>{item.tax.toFixed(2)}</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openDetailDialog(item.calculation_steps, item.year_month)}
                                                >
                                                    查看
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Info className="h-12 w-12 text-muted-foreground mb-4"/>
                                <h3 className="text-lg font-medium mb-2">尚未计算</h3>
                                <p className="text-muted-foreground max-w-md">
                                    提交参数后即可查看税额明细和计算记录。
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
                {/* Footer */}
                <div className="mt-6">
                    <Card>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    总税额：<span className="text-primary font-medium">{totalTax.toFixed(2)}</span>
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => exportToCSV(results, totalTax)}
                                    disabled={!hasCalculated}
                                >
                                    <Download className="w-4 h-4 mr-1"/>
                                    导出结果
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Calculation Detail Dialog */}
            <Dialog open={currentDetail.visible} onOpenChange={closeDetailDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{currentDetail.month} 税额计算详情</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 mt-4">
                        {currentDetail.steps.map((step, index) => (
                            <div key={index} className="flex items-start gap-2 py-1 border-b border-gray-100">
                                <span className="text-muted-foreground">{index + 1}.</span>
                                <span>{step}</span>
                            </div>
                        ))}
                    </div>
                    <DialogFooter className="mt-4">
                        <Button onClick={closeDetailDialog}>
                            <X className="w-4 h-4 mr-2"/>
                            关闭
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
