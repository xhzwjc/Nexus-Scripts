import React, {useState, useCallback, useEffect, useMemo} from 'react';
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
    id: string;
    year_month: string;
    bill_amount: number;
}

interface TaxCalculationParams {
    credential_num: string;
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
        id: `${year}-${String(i + 1).padStart(2, '0')}-${Date.now()}-${i}`,
        year_month: `${year}-${String(i + 1).padStart(2, '0')}`,
        bill_amount: 0
    }));
};

// 导出CSV功能（BOM + 安全文件名）
const exportToCSV = (data: TaxCalculationItem[], totalTax: number) => {
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

    const rows = data.map(item => [
        item.year_month,
        item.bill_amount.toFixed(2),
        item.income_amount.toFixed(2),
        item.accumulated_deduction.toFixed(2),
        item.accumulated_special.toFixed(2),
        item.accumulated_taxable.toFixed(2),
        `${(item.tax_rate * 100).toFixed(2)}%`,
        item.accumulated_total_tax.toFixed(2),
        item.tax.toFixed(2)
    ]);

    rows.push(['', '', '', '', '', '', '', '总税额', totalTax.toFixed(2)]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    // 加入 BOM，Excel 兼容中文
    const blob = new Blob(['\ufeff' + csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const safeDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `税额计算结果_${safeDate}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
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
    return month >= 1 && month <= 12 && year >= 1900 && year <= 2100;
};

type TaxCalculationItemWithId = TaxCalculationItem & { _rowId: string };

export default function TaxCalculationScript({onBack}: { onBack: () => void }) {
    // State
    const [params, setParams] = useState<TaxCalculationParams>({
        credential_num: '',
        income_type: 1,
        year: new Date().getFullYear(),
        realname: '',
        accumulated_special_deduction: 0,
        use_mock_data: false,
        mock_records: generateDefaultMockRecords(new Date().getFullYear()),
        environment: 'test'
    });
    const [isCalculating, setIsCalculating] = useState(false);
    const [results, setResults] = useState<TaxCalculationItemWithId[]>([]);

    const [totalTax, setTotalTax] = useState(0);
    const [hasCalculated, setHasCalculated] = useState(false);
    const [batchAmount, setBatchAmount] = useState<number>(0);
    const [currentDetail, setCurrentDetail] = useState<{ visible: boolean; steps: string[]; month: string }>({
        visible: false,
        steps: [],
        month: ''
    });
    const [tempMonthValues, setTempMonthValues] = useState<Record<string, string>>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!params.use_mock_data) return;

        // 基于当前记录生成新年月（保留月份，只替换年份）
        const updatedRecords = params.mock_records.map(r => {
            const old = r.year_month || '';
            const parts = old.split('-');
            const mmRaw = parts[1] || '01';
            const mm = String(Number(mmRaw) || 1).padStart(2, '0');
            return {...r, year_month: `${params.year}-${mm}`};
        });

        // 更新 records
        setParams(prev => ({...prev, mock_records: updatedRecords}));

        // 同步输入框的临时值，避免显示与实际不一致
        setTempMonthValues(prev => {
            const next: Record<string, string> = {...prev};
            updatedRecords.forEach(r => {
                next[r.id] = r.year_month;
            });
            return next;
        });
    }, [params.year, params.use_mock_data]);

    // 初始化临时年月值
    useEffect(() => {
        const initialValues: Record<string, string> = {};
        params.mock_records.forEach(record => {
            initialValues[record.id] = record.year_month;
        });
        setTempMonthValues(initialValues);
    }, [params.mock_records]);

    // 切换模式时清空计算结果
    useEffect(() => {
        setResults([]);
        setTotalTax(0);
        setHasCalculated(false);
    }, [params.use_mock_data]);

    // 计算按钮可用性
    const canCalculate = useMemo(() => {
        if (isCalculating) return false;
        if (params.use_mock_data) {
            if (params.mock_records.length === 0) return false;
            return params.mock_records.every(r => isValidYearMonthFormat(r.year_month));
        }
        return params.credential_num.trim().length > 0;
    }, [isCalculating, params.use_mock_data, params.mock_records, params.credential_num]);

    // Handlers
    const handleParamChange = useCallback(
        <K extends keyof TaxCalculationParams>(key: K, value: TaxCalculationParams[K]) => {
            setParams(prev => ({...prev, [key]: value}));
        },
        []
    );

    const handleMonthInputChange = useCallback((recordId: string, value: string) => {
        setTempMonthValues(prev => ({...prev, [recordId]: value}));
        setValidationErrors(prev => ({...prev, [recordId]: false}));
    }, []);

    const handleMonthBlurOrEnter = useCallback(
        (index: number, record: MockRecord, event?: React.FormEvent) => {
            if (event && event.type === 'keydown' && (event as unknown as React.KeyboardEvent).key !== 'Enter') {
                return;
            }
            const value = tempMonthValues[record.id];
            if (!isValidYearMonthFormat(value)) {
                if (!validationErrors[record.id]) {
                    setValidationErrors(prev => ({...prev, [record.id]: true}));
                }
                return;
            }
            setParams(prev => {
                const newRecords = [...prev.mock_records];
                newRecords[index] = {...newRecords[index], year_month: value};
                return {...prev, mock_records: newRecords};
            });
        },
        [tempMonthValues, validationErrors]
    );

    const handleBillAmountChange = useCallback((index: number, value: string) => {
        setParams(prev => {
            const newRecords = [...prev.mock_records];
            // 允许空字符串 -> 视为 0（保守处理，避免 NaN）
            newRecords[index] = {...newRecords[index], bill_amount: value === '' ? 0 : Number(value) || 0};
            return {...prev, mock_records: newRecords};
        });
    }, []);

    const addMockRecord = useCallback(() => {
        setParams(prev => {
            if (prev.mock_records.length >= 12) {
                toast.error('最多只能添加12个月的记录');
                return prev;
            }
            const sortedMonths = [...prev.mock_records].sort((a, b) => a.year_month.localeCompare(b.year_month)).map(r => r.year_month);

            let nextYear = prev.year;
            let nextMonth = 1;

            if (sortedMonths.length > 0) {
                const lastMonthStr = sortedMonths[sortedMonths.length - 1];
                const [lastYear, lastM] = lastMonthStr.split('-').map(Number);
                nextMonth = lastM + 1;
                nextYear = lastYear;
                if (nextMonth > 12) {
                    nextMonth = 1;
                    nextYear++;
                }
            }

            const ym = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
            const newRecordId = `${ym}-${Date.now()}-${prev.mock_records.length}`;
            const newRecord: MockRecord = {id: newRecordId, year_month: ym, bill_amount: 0};

            setTempMonthValues(prevTemp => ({...prevTemp, [newRecordId]: ym}));
            return {...prev, mock_records: [...prev.mock_records, newRecord]};
        });
    }, []);

    const removeMockRecord = useCallback((index: number, recordId: string) => {
        setParams(prev => {
            const newRecords = [...prev.mock_records];
            newRecords.splice(index, 1);
            return {...prev, mock_records: newRecords};
        });
        setTempMonthValues(prev => {
            const copy = {...prev};
            delete copy[recordId];
            return copy;
        });
        setValidationErrors(prev => {
            const copy = {...prev};
            delete copy[recordId];
            return copy;
        });
    }, []);

    const resetParams = useCallback(() => {
        const currentYear = params.year;
        const keepMockDataState = params.use_mock_data;
        const newMockRecords = generateDefaultMockRecords(currentYear);

        const initialValues: Record<string, string> = {};
        newMockRecords.forEach(record => {
            initialValues[record.id] = record.year_month;
        });
        setTempMonthValues(initialValues);
        setValidationErrors({});

        setParams({
            credential_num: '',
            income_type: 1,
            year: currentYear,
            realname: '',
            accumulated_special_deduction: 0,
            use_mock_data: keepMockDataState,
            mock_records: newMockRecords,
            environment: 'test'
        });
        setBatchAmount(0);
        setResults([]);
        setTotalTax(0);
        setHasCalculated(false);
    }, [params.year, params.use_mock_data]);

    const applyBatchAmount = useCallback(() => {
        if (!batchAmount || batchAmount <= 0) {
            toast.error('请输入有效的金额');
            return;
        }
        setParams(prev => ({
            ...prev,
            mock_records: prev.mock_records.map(r => ({...r, bill_amount: batchAmount}))
        }));
    }, [batchAmount]);

    const calculateTax = useCallback(async () => {
        const baseUrl = getApiBaseUrl();
        if (!baseUrl) return;

        if (!params.use_mock_data && !params.credential_num.trim()) {
            toast.error('请输入身份证号');
            return;
        }
        if (params.use_mock_data && params.mock_records.length === 0) {
            toast.error('请添加至少一条模拟记录');
            return;
        }
        if (params.use_mock_data) {
            const invalid = params.mock_records.filter(r => !isValidYearMonthFormat(r.year_month));
            if (invalid.length > 0) {
                toast.error('存在格式不正确的年月，请使用YYYY-MM格式（例如：2025-06）');
                return;
            }
        }

        setIsCalculating(true);
        try {
            const response = await axios.post<TaxCalculationResponse>(`${baseUrl}/tax/calculate`, params);
            if (response.data.success) {
                const rowsWithId: TaxCalculationItemWithId[] = response.data.data.map((item, idx) => ({
                    ...item,
                    _rowId: `${response.data.request_id}-${item.year_month}-${item.income_type}-${idx}`
                }));
                setResults(rowsWithId);
                setTotalTax(response.data.total_tax);
                setHasCalculated(true);
                toast.success(response.data.message || '计算成功');
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

    const openDetailDialog = useCallback((steps: string[], month: string) => {
        setCurrentDetail({visible: true, steps, month});
    }, []);

    const closeDetailDialog = useCallback(() => {
        setCurrentDetail(prev => ({...prev, visible: false}));
    }, []);

    // 年月输入的边界（轻引导）
    const monthMin = useMemo(() => `${params.year - 1}-01`, [params.year]);
    const monthMax = useMemo(() => `${params.year + 1}-12`, [params.year]);

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

                {/* Title */}
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">税额计算工具</h1>
                    <p className="text-muted-foreground">
                        提供身份证号、收入类型和年度参数，计算税额明细。支持跨年输入，年月格式为YYYY-MM。
                    </p>
                </div>

                {/* Configuration */}
                <Card>
                    <CardHeader>
                        <CardTitle>参数配置</CardTitle>
                        <CardDescription>填写必填项并选择运行环境</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Mode */}
                            <div className="space-y-2 md:col-span-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="use_mock_data"
                                        checked={params.use_mock_data}
                                        onCheckedChange={checked => handleParamChange('use_mock_data', checked === true)}
                                        disabled={isCalculating}
                                    />
                                    <Label htmlFor="use_mock_data">使用模拟数据</Label>
                                </div>
                            </div>

                            {/* Credential Num */}
                            {!params.use_mock_data && (
                                <div className="space-y-2">
                                    <Label htmlFor="credential_num">
                                        身份证号 <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="credential_num"
                                        value={params.credential_num}
                                        onChange={e => handleParamChange('credential_num', e.target.value.trim())}
                                        placeholder="请输入身份证号"
                                        disabled={isCalculating}
                                    />
                                </div>
                            )}

                            {/* Real Name */}
                            {!params.use_mock_data && (
                                <div className="space-y-2">
                                    <Label htmlFor="realname">真实姓名</Label>
                                    <Input
                                        id="realname"
                                        value={params.realname}
                                        onChange={e => handleParamChange('realname', e.target.value)}
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
                                    onValueChange={value => handleParamChange('income_type', Number(value))}
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
                                <Label htmlFor="year">申报年度</Label>
                                <Input
                                    id="year"
                                    type="number"
                                    value={String(params.year)}
                                    onChange={e => handleParamChange('year', Number(e.target.value))}
                                    disabled={isCalculating}
                                    placeholder="主要计算的年份"
                                />
                            </div>

                            {/* Special deduction */}
                            <div className="space-y-2">
                                <Label htmlFor="accumulated_special_deduction">专项扣除（累计）</Label>
                                <Input
                                    id="accumulated_special_deduction"
                                    type="number"
                                    step="0.01"
                                    value={String(params.accumulated_special_deduction)}
                                    onChange={e =>
                                        handleParamChange('accumulated_special_deduction', Number(e.target.value) || 0)
                                    }
                                    placeholder="请输入累计专项扣除金额"
                                    disabled={isCalculating}
                                />
                            </div>

                            {/* Environment */}
                            {!params.use_mock_data && (
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
                            )}
                        </div>

                        {/* Mock Records */}
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
                                                    onChange={e => setBatchAmount(Number(e.target.value) || 0)}
                                                    placeholder="输入统一金额"
                                                    disabled={isCalculating}
                                                    className="flex-1"
                                                    inputMode="decimal"
                                                />
                                                <Button onClick={applyBatchAmount}
                                                        disabled={isCalculating || !batchAmount} size="sm">
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
                                                <Label htmlFor={`year_month_${record.id}`}>年月 {index + 1}</Label>
                                                <Input
                                                    id={`year_month_${record.id}`}
                                                    type="month"
                                                    value={tempMonthValues[record.id] || record.year_month}
                                                    min={monthMin}
                                                    max={monthMax}
                                                    onChange={e => handleMonthInputChange(record.id, e.target.value)}
                                                    onBlur={() => handleMonthBlurOrEnter(index, record)}
                                                    onKeyDown={e => handleMonthBlurOrEnter(index, record, e as unknown as React.FormEvent)}
                                                    disabled={isCalculating}
                                                    placeholder="例如：2025-06"
                                                    className={validationErrors[record.id] ? 'border-red-500' : ''}
                                                />
                                                {validationErrors[record.id] && (
                                                    <p className="text-xs text-red-500">请输入有效的年月（YYYY-MM）</p>
                                                )}
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <Label htmlFor={`bill_amount_${record.id}`}>账单金额</Label>
                                                <Input
                                                    id={`bill_amount_${record.id}`}
                                                    type="number"
                                                    step="0.01"
                                                    inputMode="decimal"
                                                    value={record.bill_amount}
                                                    onChange={e => handleBillAmountChange(index, e.target.value)}
                                                    disabled={isCalculating}
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeMockRecord(index, record.id)}
                                                disabled={isCalculating || params.mock_records.length <= 1}
                                                aria-label="删除记录"
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
                            <Button onClick={calculateTax} disabled={!canCalculate}>
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

                {/* Results */}
                <Card>
                    <CardHeader>
                        <CardTitle>计算结果</CardTitle>
                        <CardDescription>
                            {hasCalculated ? `税额总计: ${totalTax.toFixed(2)}` : '还没有结果'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {hasCalculated ? (
                            <div className="overflow-x-auto">
                                <Table className="w-full">
                                    <TableHeader className="sticky top-0 bg-background z-10">
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
                                        {results.map((item, idx) => (
                                            <TableRow key={item._rowId}
                                                      className="odd:bg-muted/30">
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
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Info className="h-12 w-12 text-muted-foreground mb-4"/>
                                <h3 className="text-lg font-medium mb-2">尚未计算</h3>
                                <p className="text-muted-foreground max-w-md">提交参数后即可查看税额明细和计算记录。</p>
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
            <Dialog open={currentDetail.visible}
                    onOpenChange={open => setCurrentDetail(prev => ({...prev, visible: open}))}>
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
