import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
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
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { getApiBaseUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

// Types
interface MockRecord {
    id: string;
    year_month: string;
    bill_amount: number;
}

interface BaseTaxParams {
    income_type: number; // 1:labor; 2:salary
    year: number;
    accumulated_special_deduction: number;
}

interface MockTaxParams extends BaseTaxParams {
    use_mock: true;
    mock_data: MockRecord[];
}

interface RealTaxParams extends BaseTaxParams {
    use_mock: false;
    credential_num: string;
    realname: string;
    environment: 'test' | 'prod' | 'local';
    batch_no?: string;
}

type TaxCalculationParams = MockTaxParams | RealTaxParams;

interface TaxCalculationItem {
    year_month: string;
    bill_amount: number;
    realname: string;
    worker_id: number;
    tax: number;
    income_type: number;
    income_type_name: string;
    income_amount: number;
    accumulated_deduction: number;
    revenue_bills: number;
    accumulated_special: number;
    calculation_steps: string[];
    accumulated_taxable: number;
    tax_rate: number;
    accumulated_total_tax: number;
    effective_tax_rate: number;
}

interface TaxCalculationResponse {
    success: boolean;
    message: string;
    data: TaxCalculationItem[];
    total_tax: number;
    request_id: string;
}

// Validation Regex
const CN_ID_REGEX =
    /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/;

// Generate default mock records for a given year with unique IDs
const generateDefaultMockRecords = (year: number): MockRecord[] => {
    return Array.from({ length: 12 }, (_, i) => ({
        id: `${year}-${String(i + 1).padStart(2, '0')}-${Date.now()}-${i}`,
        year_month: `${year}-${String(i + 1).padStart(2, '0')}`,
        bill_amount: 0
    }));
};

// Export CSV
const exportToCSV = (data: TaxCalculationItem[], totalTax: number, isMockMode: boolean, tr: { results: { table: Record<string, string>; fileName: string } }) => {
    // Generate headers dynamically
    const baseHeaders = [
        tr.results.table.yearMonth,
        tr.results.table.deduction,
        tr.results.table.specialDeduction,
        tr.results.table.preTaxIncome,
        tr.results.table.taxableIncome,
        tr.results.table.accumulatedTax,
        tr.results.table.taxRate,
        tr.results.table.preTax,
        tr.results.table.afterTax,
        tr.results.table.monthlyTax,
        tr.results.table.actualBurden
    ];

    const headers = isMockMode
        ? baseHeaders
        : [baseHeaders[0], tr.results.table.name, ...baseHeaders.slice(1)];

    const rows = data.map(item => {
        const baseRow = [
            item.year_month,
            item.accumulated_deduction.toFixed(2),
            item.accumulated_special.toFixed(2),
            item.revenue_bills.toFixed(2),
            item.accumulated_taxable.toFixed(2),
            item.accumulated_total_tax.toFixed(2),
            `${(item.tax_rate * 100)}%`,
            item.bill_amount,
            (item.bill_amount - item.tax).toFixed(2),
            item.tax.toFixed(2),
            `${item.effective_tax_rate.toFixed(2)}%`
        ];

        return isMockMode
            ? baseRow
            : [baseRow[0], `${item.realname?.trim() || '-'}（${item.worker_id}）`, ...baseRow.slice(1)];
    });

    // Total row
    const totalColumns = isMockMode ? 11 : 12;
    const totalRow = Array(totalColumns).fill('');
    totalRow[totalColumns - 2] = tr.results.table.totalTax;
    totalRow[totalColumns - 1] = totalTax.toFixed(2);
    rows.push(totalRow);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const safeDate = new Date().toISOString().slice(0, 10);
    const filename = tr.results.fileName.replace('{date}', safeDate);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

// Validation Helper
const isValidYearMonthFormat = (value: string): boolean => {
    const regex = /^\d{4}-\d{2}$/;
    if (!regex.test(value)) return false;
    const [year, month] = value.split('-').map(Number);
    return month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
};

type TaxCalculationItemWithId = TaxCalculationItem & { _rowId: string };

export default function TaxCalculationScript({ onBack }: { onBack: () => void }) {
    const { t } = useI18n();
    const tr = t.scripts.taxCalculator;

    // Params state
    const [mockParams, setMockParams] = useState<MockTaxParams>({
        use_mock: true,
        income_type: 1,
        year: new Date().getFullYear(),
        accumulated_special_deduction: 0,
        mock_data: generateDefaultMockRecords(new Date().getFullYear())
    });

    const [realParams, setRealParams] = useState<RealTaxParams>({
        use_mock: false,
        income_type: 1,
        year: new Date().getFullYear(),
        accumulated_special_deduction: 0,
        credential_num: '',
        realname: '',
        environment: 'test',
        batch_no: ''
    });

    // 当前激活的参数（根据模式切换）
    const [activeMode, setActiveMode] = useState<'mock' | 'real'>('real');

    // 派生当前参数
    const params = useMemo<TaxCalculationParams>(() => {
        return activeMode === 'mock' ? mockParams : realParams;
    }, [activeMode, mockParams, realParams]);

    // 其他状态
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

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [jumpPageInput, setJumpPageInput] = useState('');

    // 请求控制：避免竞态与内存泄漏
    const abortRef = useRef<AbortController | null>(null);

    // 计算分页数据
    const paginatedResults = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return results.slice(start, end);
    }, [results, currentPage, pageSize]);

    const totalPages = Math.ceil(results.length / pageSize);

    // 当切换到模拟模式时初始化临时年月值
    useEffect(() => {
        if (activeMode !== 'mock') return;

        const initialValues: Record<string, string> = {};
        mockParams.mock_data.forEach(record => {
            initialValues[record.id] = record.year_month;
        });
        setTempMonthValues(initialValues);
        setCurrentPage(1);
    }, [activeMode, mockParams.mock_data]);

    // 当模拟模式下的年份变化时更新记录年月
    useEffect(() => {
        if (activeMode !== 'mock') return;

        setMockParams(prev => {
            const updatedRecords = prev.mock_data.map(r => {
                const parts = (r.year_month || '').split('-');
                const mmRaw = parts[1] || '01';
                const mm = String(Number(mmRaw) || 1).padStart(2, '0');
                return { ...r, year_month: `${prev.year}-${mm}` };
            });

            // 同步输入框的临时值
            setTempMonthValues(prevVals => {
                const next: Record<string, string> = { ...prevVals };
                updatedRecords.forEach(r => {
                    next[r.id] = r.year_month;
                });
                return next;
            });

            return { ...prev, mock_data: updatedRecords };
        });
    }, [activeMode, mockParams.year]);

    // 切换模式时清空计算结果
    useEffect(() => {
        setResults([]);
        setTotalTax(0);
        setCurrentPage(1);
        setHasCalculated(false);
    }, [activeMode]);

    // 组件卸载时中断未完成请求
    useEffect(() => {
        return () => {
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
        };
    }, []);

    // 共享参数设置（两种模式都存在的字段）
    const setSharedParam = useCallback(
        <K extends keyof BaseTaxParams>(key: K, value: BaseTaxParams[K]) => {
            if (activeMode === 'mock') {
                setMockParams(prev => ({ ...prev, [key]: value }));
            } else {
                setRealParams(prev => ({ ...prev, [key]: value }));
            }
        },
        [activeMode]
    );

    // 真实模式独有参数设置
    const setRealParam = useCallback(<K extends keyof RealTaxParams>(key: K, value: RealTaxParams[K]) => {
        setRealParams(prev => ({ ...prev, [key]: value }));
    }, []);

    // 切换模式处理
    const handleModeChange = useCallback((checked: boolean) => {
        setActiveMode(checked ? 'mock' : 'real');
    }, []);

    // 模拟数据相关处理函数
    const handleMonthInputChange = useCallback((recordId: string, value: string) => {
        setTempMonthValues(prev => ({ ...prev, [recordId]: value }));
        setValidationErrors(prev => ({ ...prev, [recordId]: false }));
    }, []);

    // 提交年月
    const commitMonthValue = useCallback(
        (index: number, record: MockRecord) => {
            const value = tempMonthValues[record.id] ?? '';
            if (!isValidYearMonthFormat(value)) {
                setValidationErrors(prev => ({ ...prev, [record.id]: true }));
                return;
            }
            setValidationErrors(prev => ({ ...prev, [record.id]: false }));
            setMockParams(prev => {
                const newRecords = [...prev.mock_data];
                newRecords[index] = { ...newRecords[index], year_month: value };
                return { ...prev, mock_data: newRecords };
            });
        },
        [tempMonthValues]
    );

    const handleBillAmountChange = useCallback((index: number, value: string) => {
        const parsed = Number(value);
        const num = Math.max(0, parsed);
        setMockParams(prev => {
            const newRecords = [...prev.mock_data];
            newRecords[index] = { ...newRecords[index], bill_amount: Number.isFinite(num) ? num : 0 };
            return { ...prev, mock_data: newRecords };
        });
    }, []);

    const addMockRecord = useCallback(() => {
        setMockParams(prev => {
            if (prev.mock_data.length >= 12) {
                toast.error(tr.results.messages.limit12);
                return prev;
            }
            const sortedMonths = [...prev.mock_data]
                .sort((a, b) => a.year_month.localeCompare(b.year_month))
                .map(r => r.year_month);

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
            const newRecordId = `${ym}-${Date.now()}-${prev.mock_data.length}`;
            const newRecord: MockRecord = { id: newRecordId, year_month: ym, bill_amount: 0 };

            setTempMonthValues(prevTemp => ({ ...prevTemp, [newRecordId]: ym }));
            return { ...prev, mock_data: [...prev.mock_data, newRecord] };
        });
    }, [tr]);

    const removeMockRecord = useCallback((index: number, recordId: string) => {
        setMockParams(prev => {
            const newRecords = [...prev.mock_data];
            newRecords.splice(index, 1);
            return { ...prev, mock_data: newRecords };
        });
        setTempMonthValues(prev => {
            const copy = { ...prev };
            delete copy[recordId];
            return copy;
        });
        setValidationErrors(prev => {
            const copy = { ...prev };
            delete copy[recordId];
            return copy;
        });
    }, []);

    // 重置参数处理
    const resetParams = useCallback(() => {
        const currentYear = new Date().getFullYear();

        if (activeMode === 'mock') {
            const newMockRecords = generateDefaultMockRecords(currentYear);
            const initialValues: Record<string, string> = {};
            newMockRecords.forEach(record => {
                initialValues[record.id] = record.year_month;
            });

            setMockParams({
                use_mock: true,
                income_type: 1,
                year: currentYear,
                accumulated_special_deduction: 0,
                mock_data: newMockRecords
            });
            setTempMonthValues(initialValues);
        } else {
            setRealParams({
                use_mock: false,
                income_type: 1,
                year: currentYear,
                accumulated_special_deduction: 0,
                credential_num: '',
                realname: '',
                environment: 'test',
                batch_no: ''
            });
        }

        setBatchAmount(0);
        setResults([]);
        setTotalTax(0);
        setHasCalculated(false);
        setValidationErrors({});
        setCurrentPage(1);
    }, [activeMode]);

    const applyBatchAmount = useCallback(() => {
        if (!batchAmount || batchAmount <= 0) {
            toast.error(tr.results.messages.invalidAmount);
            return;
        }
        setMockParams(prev => ({
            ...prev,
            mock_data: prev.mock_data.map(r => ({ ...r, bill_amount: batchAmount }))
        }));
    }, [batchAmount, tr]);

    // 真实模式校验派生值
    const hasBatch = useMemo(() => !!realParams.batch_no?.trim(), [realParams.batch_no]);
    const hasCred = useMemo(() => !!realParams.credential_num.trim(), [realParams.credential_num]);
    const hasName = useMemo(() => !!realParams.realname.trim(), [realParams.realname]);

    // 业务规则：
    // 1) 至少填写 批次号 或 身份证号 其一；
    // 2) 若填写姓名，则必须同时填写身份证号；
    const realValid = useMemo(() => {
        const baseOk = hasBatch || hasCred;
        const nameOk = !hasName || hasCred;
        return baseOk && nameOk;
    }, [hasBatch, hasCred, hasName]);

    const credentialFormatError = useMemo(() => {
        const v = realParams.credential_num.trim();
        if (!v) return '';
        return CN_ID_REGEX.test(v) ? '' : tr.results.messages.invalidId;
    }, [realParams.credential_num, tr]);

    // 计算按钮可用性
    const canCalculate = useMemo(() => {
        if (isCalculating) return false;

        if (activeMode === 'mock') {
            const allValidFormat = mockParams.mock_data.length > 0 &&
                mockParams.mock_data.every(r => isValidYearMonthFormat(r.year_month));
            const anyMonthError = Object.values(validationErrors).some(Boolean);
            return allValidFormat && !anyMonthError;
        }

        if (!realValid) return false;
        if (credentialFormatError) return false;
        return true;
    }, [isCalculating, activeMode, mockParams.mock_data, validationErrors, realValid, credentialFormatError]);

    // 计算税额处理（带取消控制，避免竞态）
    const calculateTax = useCallback(async () => {
        const baseUrl = getApiBaseUrl();
        if (!baseUrl) return;

        if (activeMode === 'real') {
            if (!realValid) {
                toast.error(tr.results.messages.ruleError);
                return;
            }
            if (credentialFormatError) {
                toast.error(credentialFormatError);
                return;
            }
        } else {
            if (mockParams.mock_data.length === 0) {
                toast.error(tr.results.messages.noMock);
                return;
            }
            if (mockParams.mock_data.some(r => !isValidYearMonthFormat(r.year_month))) {
                toast.error(tr.results.messages.invalidDate);
                return;
            }
        }

        // 取消上一个未完成请求
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;

        setIsCalculating(true);
        try {
            const response = await axios.post<TaxCalculationResponse>(
                `${baseUrl}/tax/calculate`,
                params,
                { signal: controller.signal }
            );

            if (response.data.success) {
                const rowsWithId: TaxCalculationItemWithId[] = response.data.data.map((item, idx) => ({
                    ...item,
                    _rowId: `${response.data.request_id}-${item.year_month}-${item.income_type}-${idx}`
                }));
                setResults(rowsWithId);
                setTotalTax(response.data.total_tax);
                setHasCalculated(true);

                const isEmpty = Array.isArray(response.data.data) && response.data.data.length === 0;
                if (isEmpty) {
                    toast.error(tr.results.messages.noMatch);
                } else {
                    toast.success(response.data.message || tr.results.messages.success.replace('{count}', String(response.data.data.length)));
                }
            } else {
                toast.error(response.data.message || tr.results.messages.fail);
                setResults([]);
                setTotalTax(0);
                setHasCalculated(false);
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') {
                // 请求已取消，不提示错误
                return;
            }
            let errorMsg = tr.results.messages.error;
            if (axios.isAxiosError<{ message?: string }>(err)) {
                errorMsg = err.response?.data?.message || err.message || errorMsg;
            } else if (err instanceof Error) {
                errorMsg = err.message || errorMsg;
            }
            toast.error(errorMsg);
            setResults([]);
            setTotalTax(0);
            setHasCalculated(false);
        } finally {
            setIsCalculating(false);
            // 清空当前的 controller
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    }, [params, activeMode, mockParams, realValid, credentialFormatError, tr]);

    const openDetailDialog = useCallback((steps: string[], month: string) => {
        setCurrentDetail({ visible: true, steps, month });
    }, []);

    const closeDetailDialog = useCallback(() => {
        setCurrentDetail(prev => ({ ...prev, visible: false }));
    }, []);

    // 年月输入边界
    const monthMin = useMemo(() => `${params.year - 1}-01`, [params.year]);
    const monthMax = useMemo(() => `${params.year + 1}-12`, [params.year]);

    // UI：真实模式字段必填标记（与规则保持一致）
    const requiresBatchNo = useMemo(() => !hasCred, [hasCred]);
    const requiresCredentialNum = useMemo(() => !hasBatch || hasName, [hasBatch, hasName]);

    // 年份输入范围控制
    const clampYear = (y: number) => {
        if (!Number.isFinite(y)) return new Date().getFullYear();
        return Math.min(2100, Math.max(2000, Math.floor(y)));
    };

    const handleJumpPage = () => {
        const page = Number(jumpPageInput);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        } else {
            toast.error(tr.results.messages.pageRange.replace('{total}', String(totalPages)));
        }
        setJumpPageInput('');
    };

    useEffect(() => {
        if (results.length > 0) {
            setCurrentPage(1);
        }
    }, [results]);

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {tr.actions.back}
                    </Button>
                    <Badge variant={isCalculating ? 'destructive' : 'secondary'}>
                        {isCalculating ? tr.status.calculating : tr.status.ready}
                    </Badge>
                </div>

                {/* Title */}
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{tr.title}</h1>
                    <p className="text-muted-foreground">
                        {tr.description}
                    </p>
                </div>

                {/* Configuration */}
                <Card>
                    <CardHeader>
                        <CardTitle>{tr.config.title}</CardTitle>
                        <CardDescription>{tr.config.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Mode */}
                            <div className="space-y-2 md:col-span-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="use_mock"
                                        checked={activeMode === 'mock'}
                                        onCheckedChange={checked => handleModeChange(checked === true)}
                                        disabled={isCalculating}
                                    />
                                    <Label htmlFor="use_mock">{tr.config.useMock}</Label>
                                </div>
                            </div>

                            {activeMode === 'real' && (
                                <div className="space-y-2">
                                    <Label htmlFor="batch_no">
                                        {tr.config.batchNo} {requiresBatchNo ? <span className="text-red-500">*</span> : ''}
                                    </Label>
                                    <Input
                                        id="batch_no"
                                        value={realParams.batch_no || ''}
                                        onChange={e => setRealParam('batch_no', e.target.value.trim())}
                                        placeholder={tr.config.batchNoPlaceholder}
                                        disabled={isCalculating}
                                    />
                                </div>
                            )}

                            {/* Credential Num */}
                            {activeMode === 'real' && (
                                <div className="space-y-2">
                                    <Label htmlFor="credential_num">
                                        {tr.config.taxId} {requiresCredentialNum ? <span className="text-red-500">*</span> : ''}
                                    </Label>
                                    <Input
                                        id="credential_num"
                                        value={realParams.credential_num}
                                        onChange={e => setRealParam('credential_num', e.target.value.trim())}
                                        placeholder={tr.config.taxIdPlaceholder}
                                        disabled={isCalculating}
                                    />
                                    {credentialFormatError ? (
                                        <p className="text-xs text-red-500 mt-1">{credentialFormatError}</p>
                                    ) : null}
                                </div>
                            )}

                            {/* Real Name */}
                            {activeMode === 'real' && (
                                <div className="space-y-2">
                                    <Label htmlFor="realname">{tr.config.realName}</Label>
                                    <Input
                                        id="realname"
                                        value={realParams.realname}
                                        onChange={e => setRealParam('realname', e.target.value)}
                                        placeholder={tr.config.realNamePlaceholder}
                                        disabled={isCalculating}
                                    />
                                </div>
                            )}

                            {/* Income Type */}
                            <div className="space-y-2">
                                <Label htmlFor="income_type">{tr.config.incomeType}</Label>
                                <Select
                                    value={String(params.income_type)}
                                    onValueChange={value => setSharedParam('income_type', Number(value))}
                                    disabled={isCalculating}
                                >
                                    <SelectTrigger id="income_type">
                                        <SelectValue placeholder={tr.config.incomeTypePlaceholder} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">{tr.config.incomeTypes.labor}</SelectItem>
                                        <SelectItem value="2">{tr.config.incomeTypes.salary}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Year */}
                            <div className="space-y-2">
                                <Label htmlFor="year">{tr.config.year}</Label>
                                <Input
                                    id="year"
                                    type="number"
                                    // Display an empty string if the year is 0 to allow the field to be cleared
                                    value={params.year > 0 ? String(params.year) : ''}
                                    onChange={e => {
                                        // Parse the input, defaulting to 0 if empty or invalid
                                        const year = parseInt(e.target.value, 10);
                                        setSharedParam('year', isNaN(year) ? 0 : year);
                                    }}
                                    onBlur={() => {
                                        // On losing focus, clamp the value to the valid range [2000, 2100]
                                        setSharedParam('year', clampYear(params.year));
                                    }}
                                    disabled={isCalculating}
                                    placeholder={tr.config.yearPlaceholder}
                                />
                                <p className="text-xs text-muted-foreground">{tr.config.yearHint}</p>
                            </div>

                            {/* Special deduction */}
                            <div className="space-y-2">
                                <Label htmlFor="accumulated_special_deduction">{tr.config.deduction}</Label>
                                <Input
                                    id="accumulated_special_deduction"
                                    type="number"
                                    step="0.01"
                                    value={String(params.accumulated_special_deduction)}
                                    onChange={e =>
                                        setSharedParam(
                                            'accumulated_special_deduction',
                                            Math.max(0, Number(e.target.value) || 0)
                                        )
                                    }
                                    placeholder={tr.config.deductionPlaceholder}
                                    disabled={isCalculating}
                                    inputMode="decimal"
                                />
                            </div>

                            {/* Environment */}
                            {activeMode === 'real' && (
                                <div className="space-y-2">
                                    <Label htmlFor="environment">{tr.config.env}</Label>
                                    <Select
                                        value={realParams.environment}
                                        onValueChange={(value: 'test' | 'prod' | 'local') => setRealParam('environment', value)}
                                        disabled={isCalculating}
                                    >
                                        <SelectTrigger id="environment">
                                            <SelectValue placeholder={tr.config.envPlaceholder} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="test">{tr.config.envs.test}</SelectItem>
                                            <SelectItem value="prod">{tr.config.envs.prod}</SelectItem>
                                            <SelectItem value="local">{tr.config.envs.local}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        {/* Mock Records */}
                        {activeMode === 'mock' && (
                            <div className="mt-6 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <h3 className="font-medium">{tr.mock.title}（{mockParams.mock_data.length}/12）</h3>
                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                        <div className="flex-1 sm:flex-initial">
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={batchAmount || ''}
                                                    onChange={e => setBatchAmount(Math.max(0, Number(e.target.value) || 0))}
                                                    placeholder={tr.mock.batchAmountPlaceholder}
                                                    disabled={isCalculating}
                                                    className="flex-1"
                                                    inputMode="decimal"
                                                />
                                                <Button onClick={applyBatchAmount}
                                                    disabled={isCalculating || !batchAmount} size="sm">
                                                    <Copy className="w-4 h-4 mr-1" />
                                                    {tr.mock.applyAll}
                                                </Button>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={addMockRecord}
                                            disabled={isCalculating || mockParams.mock_data.length >= 12}
                                        >
                                            <Plus className="w-4 h-4 mr-1" />
                                            {tr.mock.addRecord}
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {mockParams.mock_data.map((record, index) => (
                                        <div key={record.id} className="flex items-end gap-2">
                                            <div className="flex-1 space-y-1">
                                                <Label htmlFor={`year_month_${record.id}`}>{tr.results.table.yearMonth} {index + 1}</Label>
                                                <Input
                                                    id={`year_month_${record.id}`}
                                                    type="month"
                                                    value={tempMonthValues[record.id] || record.year_month}
                                                    min={monthMin}
                                                    max={monthMax}
                                                    onChange={e => handleMonthInputChange(record.id, e.target.value)}
                                                    onBlur={() => commitMonthValue(index, record)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') commitMonthValue(index, record);
                                                    }}
                                                    disabled={isCalculating}
                                                    placeholder="YYYY-MM"
                                                    className={validationErrors[record.id] ? 'border-red-500' : ''}
                                                />
                                                {validationErrors[record.id] && (
                                                    <p className="text-xs text-red-500">{tr.results.messages.invalidDate}</p>
                                                )}
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <Label htmlFor={`bill_amount_${record.id}`}>{tr.mock.billAmount}</Label>
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
                                                disabled={isCalculating || mockParams.mock_data.length <= 1}
                                                aria-label="删除记录"
                                            >
                                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
                            {activeMode === 'real' && !realValid && (
                                <p className="text-xs text-red-500">
                                    请至少填写批次号或身份证号；若填写姓名则需同时填写身份证号
                                </p>
                            )}
                            {activeMode === 'real' && credentialFormatError && (
                                <p className="text-xs text-red-500">{credentialFormatError}</p>
                            )}
                            <div className="flex gap-3">
                                <Button variant="ghost" onClick={resetParams} disabled={isCalculating}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    {tr.actions.reset}
                                </Button>
                                <Button onClick={calculateTax} disabled={!canCalculate}>
                                    {isCalculating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            计算中...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            {tr.actions.calculate}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Results */}
                <Card>
                    <CardHeader>
                        <CardTitle>{tr.results.title}</CardTitle>
                        <CardDescription>
                            {hasCalculated ? `${tr.results.total}: ${totalTax.toFixed(2)}` : tr.actions.noResult}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {hasCalculated ? (
                            <div className="overflow-x-auto">
                                <Table className="w-full">
                                    <TableHeader className="sticky top-0 bg-background z-10">
                                        <TableRow>
                                            <TableHead>{tr.results.table.yearMonth}</TableHead>
                                            {activeMode !== 'mock' && <TableHead>{tr.results.table.name}</TableHead>}
                                            <TableHead>{tr.results.table.deduction}</TableHead>
                                            {/*<TableHead>{tr.results.table.specialDeduction}</TableHead>*/}
                                            <TableHead>{tr.results.table.preTaxIncome}</TableHead>
                                            <TableHead>{tr.results.table.taxableIncome}</TableHead>
                                            <TableHead>{tr.results.table.accumulatedTax}</TableHead>
                                            <TableHead>{tr.results.table.taxRate}</TableHead>
                                            <TableHead>{tr.results.table.preTax}</TableHead>
                                            <TableHead>{tr.results.table.afterTax}</TableHead>
                                            <TableHead>{tr.results.table.monthlyTax}</TableHead>
                                            <TableHead>{tr.results.table.actualBurden}</TableHead>
                                            <TableHead>{tr.actions.view}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedResults.map((item, idx) => (
                                            <TableRow key={item._rowId} className="odd:bg-muted/30">
                                                <TableCell>{item.year_month}</TableCell>
                                                {activeMode !== 'mock' && (
                                                    <TableCell>{`${item.realname}（${item.worker_id}）`}</TableCell>
                                                )}
                                                <TableCell>{item.accumulated_deduction}</TableCell>
                                                {/*<TableCell>{item.accumulated_special.toFixed(2)}</TableCell>*/}
                                                <TableCell>{item.revenue_bills}</TableCell>
                                                <TableCell>{item.accumulated_taxable.toFixed(2)}</TableCell>
                                                <TableCell>{item.accumulated_total_tax.toFixed(2)}</TableCell>
                                                <TableCell>{(item.tax_rate * 100)}%</TableCell>
                                                <TableCell>{item.bill_amount}</TableCell>
                                                <TableCell>{(item.income_amount - item.tax).toFixed(2)}</TableCell>
                                                <TableCell>{item.tax.toFixed(2)}</TableCell>
                                                <TableCell>{item.effective_tax_rate.toFixed(2)}%</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openDetailDialog(item.calculation_steps, item.year_month)}
                                                    >
                                                        {tr.actions.view}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {/* 分页控件 */}
                                <div className="flex items-center justify-between mt-4">
                                    <div className="flex items-center gap-2">
                                        <span>{tr.actions.rowsPerPage}</span>
                                        <Select value={String(pageSize)} onValueChange={(v) => {
                                            setPageSize(Number(v));
                                            setCurrentPage(1);
                                        }}>
                                            <SelectTrigger className="w-[100px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[12, 50, 100, 500, 1000].map(size => (
                                                    <SelectItem key={size} value={String(size)}>
                                                        {size}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        >
                                            {t.common.prev}
                                        </Button>
                                        <span>
                                            {currentPage} / {totalPages || 1}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={currentPage === totalPages || totalPages === 0}
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        >
                                            {t.common.next}
                                        </Button>
                                        <div className="flex items-center gap-2 ml-4">
                                            <Input
                                                type="number"
                                                value={jumpPageInput}
                                                onChange={e => setJumpPageInput(e.target.value)}
                                                placeholder={tr.actions.page}
                                                className="w-20"
                                            />
                                            <Button size="sm" onClick={handleJumpPage}>
                                                {tr.actions.jump}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Info className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium mb-2">{tr.actions.noResult}</h3>
                                <p className="text-muted-foreground max-w-md">{tr.description}</p>
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
                                    {tr.results.total}：<span className="text-primary font-medium">{totalTax.toFixed(2)}</span>
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => exportToCSV(results, totalTax, activeMode === 'mock', tr)}
                                    disabled={!hasCalculated}
                                >
                                    <Download className="w-4 h-4 mr-1" />
                                    {tr.results.export}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Calculation Detail Dialog */}
            <Dialog
                open={currentDetail.visible}
                onOpenChange={open => setCurrentDetail(prev => ({ ...prev, visible: open }))}
            >
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{currentDetail.month} {tr.results.title}</DialogTitle>
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
                            <X className="w-4 h-4 mr-2" />
                            {tr.actions.close}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
