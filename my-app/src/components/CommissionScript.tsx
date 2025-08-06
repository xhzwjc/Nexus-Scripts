import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ArrowLeft, Play, Square, Copy, AlertCircle, RefreshCw, ChevronRight, ChevronLeft } from 'lucide-react';

// 定义接口响应数据类型
interface CommissionDetail {
  id: number;
  tax_id: number;
  tax_name: string;
  actual_amount: number;
  pay_amount: number;
  server_amount: number;
  commission: number;
  raw_commission: string;
  channel_profit: number;
  raw_channel_profit: string;
  batch_no: string;
  balance_no: string;
  rate_config: string;
  rate_detail: string;
  history_amount: number;
  payment_over_time: string;
  enterprise_id: number;
  enterprise_name: string;
  year_month: [number, number];
  month_str: string;
  // 新增字段
  api_commission: number;
  is_matched: boolean;
  difference: number;
  tolerance: number;
  monthly_accumulation: number;
}

interface SummaryMetrics {
  total_profit: number;
  monthly_profit: number;
  daily_profit: number;
  is_profitable: boolean;
  total_pay_amount: number;
  daily_pay_amount: number;
  total_count: number;
  mismatch_count: number;
  match_rate: number;
}

interface EnterpriseData {
  enterprise_name: string;
  enterprise_id: number;
  total_pay_amount: number;
  total_profit: number;
  total_count: number;
  total_recharge_amount: number;
  month: string;
  month_pay_amount: number;
  month_profit: number;
  month_count: number;
  month_recharge_amount: number;
}

interface ApiResponse {
  success: boolean;
  message: string;
  data: {
    commission_details: CommissionDetail[];
    summary_metrics: SummaryMetrics;
    enterprise_data: EnterpriseData[];
    total_items: number;
    api_verification: boolean;
    summary: {
      total_profit: number;
      total_pay_amount: number;
      transaction_count: number;
      mismatch_count: number;
      match_rate: number;
    }
  };
  request_id: string;
  channel_id: number;
}

interface CommissionScriptProps {
  onBack: () => void;
}

export default function CommissionScript({ onBack }: CommissionScriptProps) {
  // 状态管理
  const [environment, setEnvironment] = useState('');
  const [channelId, setChannelId] = useState('');
  const [account, setAccount] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [allCommissionDetails, setAllCommissionDetails] = useState<CommissionDetail[]>([]);
  const [commissionDetails, setCommissionDetails] = useState<CommissionDetail[]>([]);
  const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetrics | null>(null);
  const [enterpriseData, setEnterpriseData] = useState<EnterpriseData[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 10,
    total_items: 0,
    total_pages: 1
  });
  const [selectedDetail, setSelectedDetail] = useState<CommissionDetail | null>(null);
  const [apiVerification, setApiVerification] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pageInputValue, setPageInputValue] = useState<number | null>(null);
  const [currentEnterpriseIndex, setCurrentEnterpriseIndex] = useState(0);

  // 格式化金额显示
  const formatCurrency = (amount: number) => {
    return '¥' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
  };


  const handleCopyToClipboard = useCallback((detail: CommissionDetail | null) => {
    if (!detail) return;

    // 1. 按照显示格式构建文本内容
    const formattedText = `
税地名称: ${detail.tax_name}
税地ID: ${detail.tax_id}
企业名称: ${detail.enterprise_name}
企业ID: ${detail.enterprise_id}
实际支付: ${formatCurrency(detail.actual_amount)}
发放金额: ${formatCurrency(detail.pay_amount)}
企业服务费: ${formatCurrency(detail.server_amount)}
渠道服务费: ${formatCurrency(detail.commission)}
API佣金: ${formatCurrency(detail.api_commission)}
差额: ${formatCurrency(detail.difference)}
允许误差: ${formatCurrency(detail.tolerance)}
原始渠道服务费: ${detail.raw_commission}
渠道利润: ${formatCurrency(detail.channel_profit)}
原始渠道利润: ${detail.raw_channel_profit}
批次号: ${detail.batch_no}
结算单号: ${detail.balance_no}
费率配置: ${detail.rate_config}
详细费率: ${detail.rate_detail}
历史累计金额: ${formatCurrency(detail.history_amount)}
支付时间: ${detail.payment_over_time}
所属月份: ${detail.month_str}
验证状态: ${detail.is_matched ? '匹配' : '不匹配'}
    `.trim();

    // 降级复制方案的函数
    const fallbackCopy = (text: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setLogs(prev => [...prev, '[INFO] 数据已成功复制到剪贴板 (降级方案)']);
          alert('数据已复制到剪贴板');
        } else {
          throw new Error('document.execCommand returned false');
        }
      } catch (err) {
        setLogs(prev => [...prev, `[ERROR] 降级方案复制失败: ${err instanceof Error ? err.message : '未知错误'}`]);
        alert('复制失败，请手动复制');
      } finally {
        document.body.removeChild(textarea);
      }
    };

    // 2. 优先使用现代 Clipboard API (在安全上下文中)
    if (navigator.clipboard && window.isSecureContext) {
      setLogs(prev => [...prev, '[INFO] 尝试使用现代 Clipboard API']);
      navigator.clipboard.writeText(formattedText).then(() => {
        setLogs(prev => [...prev, '[INFO] 数据已成功复制到剪贴板']);
        alert('数据已成功复制到剪贴板');
      }).catch(err => {
        console.error('现代 API 复制失败:', err);
        setLogs(prev => [...prev, `[ERROR] 现代 API 复制失败，尝试降级: ${err.message}`]);
        fallbackCopy(formattedText);
      });
    } else {
      // 3. 如果浏览器不支持或非安全上下文，立即同步执行降级方案
      setLogs(prev => [...prev, '[INFO] 浏览器不支持现代 API 或非安全上下文，使用降级方案']);
      fallbackCopy(formattedText);
    }
  }, [setLogs]); // useCallback 依赖项


  // 获取所有唯一的企业列表
  const uniqueEnterprises = useMemo(() => {
    const enterprisesMap = new Map<number, EnterpriseData>();

    enterpriseData.forEach(item => {
      if (!enterprisesMap.has(item.enterprise_id)) {
        enterprisesMap.set(item.enterprise_id, item);
      }
    });

    return Array.from(enterprisesMap.values());
  }, [enterpriseData]);

  // 获取当前选中的企业数据
  const currentEnterprise = useMemo(() => {
    if (uniqueEnterprises.length === 0) return null;
    return uniqueEnterprises[currentEnterpriseIndex];
  }, [uniqueEnterprises, currentEnterpriseIndex]);

  // 获取当前企业的月度数据
  const currentEnterpriseMonthlyData = useMemo(() => {
    if (!currentEnterprise) return [];

    return enterpriseData
      .filter(item => item.enterprise_id === currentEnterprise.enterprise_id)
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [currentEnterprise, enterpriseData]);

  // 按月份分组企业数据
  const groupEnterpriseDataByMonth = () => {
    const groups: Record<string, EnterpriseData[]> = {};

    currentEnterpriseMonthlyData.forEach(item => {
      if (!groups[item.month]) {
        groups[item.month] = [];
      }
      groups[item.month].push(item);
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  };

  // 计算税地月度累计
  const calculateMonthlyTotal = (month: string) => {
    return allCommissionDetails
      .filter(item => item.month_str === month)
      .reduce((sum, item) => sum + item.actual_amount, 0);
  };

  // 前端分页处理
  const handlePagination = () => {
    if (!pagination) return;
    const startIndex = (pagination.page - 1) * pagination.page_size;
    const endIndex = startIndex + pagination.page_size;
    setCommissionDetails(allCommissionDetails.slice(startIndex, endIndex));
  };

  // 执行佣金计算
  const startExecution = async () => {
    if (!environment || !channelId) return;

    setIsRunning(true);
    setIsLoading(true);
    setLogs(['[INFO] 开始执行渠道佣金计算脚本...']);
    setCommissionDetails([]);
    setAllCommissionDetails([]);
    setSummaryMetrics(null);
    setEnterpriseData([]);
    setPagination(prev => ({ ...prev, page: 1 }));
    setPageInputValue(1);
    setCurrentEnterpriseIndex(0);

    try {
      const loginTimer1 = setTimeout(() => {
        setLogs(prev => [...prev, `[INFO] 环境: ${environment}, 渠道ID: ${channelId}`]);
      }, 500);

      const loginTimer2 = setTimeout(() => {
        setLogs(prev => [...prev, '[INFO] 正在登录系统...']);
      }, 1000);

      const loginTimer3 = setTimeout(() => {
        setAccount('admin');
        setLogs(prev => [...prev, '[SUCCESS] 登录成功，获取token']);
      }, 1500);

      const apiTimer = setTimeout(async () => {
        setLogs(prev => [...prev, '[INFO] 调用佣金计算接口...']);

        try {
          const response = await fetch(process.env.NEXT_PUBLIC_API_BASE_URL + '/commission/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel_id: Number(channelId),
              environment,
              timeout: 15
            })
          });

          const result: ApiResponse = await response.json();

          if (result.success) {
            setLogs(prev => [...prev, `[SUCCESS] ${result.message}`]);
            // 对数据进行排序，确保分页顺序一致
            const sortedDetails = [...result.data.commission_details]
              .sort((a, b) => a.id - b.id);

            setAllCommissionDetails(sortedDetails);

            // 计算总页数
            const totalItems = result.data.total_items || sortedDetails.length;
            const totalPages = Math.ceil(totalItems / pagination.page_size);

            setPagination(prev => ({
              ...prev,
              total_items: totalItems,
              total_pages: totalPages > 0 ? totalPages : 1
            }));

            setSummaryMetrics(result.data.summary_metrics || null);
            setEnterpriseData(result.data.enterprise_data || []);
            setApiVerification(result.data.api_verification || false);

            handlePagination();
          } else {
            setLogs(prev => [...prev, `[ERROR] ${result.message || '接口返回失败'}`]);
          }
        } catch (error) {
          setLogs(prev => [...prev, `[ERROR] 接口调用失败: ${error instanceof Error ? error.message : '未知错误'}`]);
        } finally {
          setIsRunning(false);
          setIsLoading(false);
        }
      }, 2500);

      return () => {
        clearTimeout(loginTimer1);
        clearTimeout(loginTimer2);
        clearTimeout(loginTimer3);
        clearTimeout(apiTimer);
      };

    } catch (error) {
      setLogs(prev => [...prev, `[ERROR] 执行失败: ${error instanceof Error ? error.message : '未知错误'}`]);
      setIsRunning(false);
      setIsLoading(false);
    }
  };

  // 切换分页 - 前端处理
  const handlePageChange = (newPage: number) => {
    // 安全检查
    if (!pagination) return;

    if (newPage < 1 || newPage > pagination.total_pages) return;
    setPagination(prev => prev ? { ...prev, page: newPage } : {
      page: newPage,
      page_size: 10,
      total_items: 0,
      total_pages: 1
    });
    setPageInputValue(newPage); // 同步更新输入框值
    handlePagination();
  };

  // 切换企业
  const handleEnterpriseChange = (direction: 'next' | 'prev') => {
    if (direction === 'next') {
      setCurrentEnterpriseIndex(prev =>
        prev === uniqueEnterprises.length - 1 ? 0 : prev + 1
      );
    } else {
      setCurrentEnterpriseIndex(prev =>
        prev === 0 ? uniqueEnterprises.length - 1 : prev - 1
      );
    }
  };

  // 数据排序确保分页顺序正确
  const sortedCommissionDetails = useMemo(() => {
    return [...commissionDetails].sort((a, b) => a.id - b.id);
  }, [commissionDetails]);

  // 监听分页变化，自动更新数据
  useEffect(() => {
    handlePagination();
  }, [pagination.page, allCommissionDetails]);

  const stopExecution = () => {
    setIsRunning(false);
    setIsLoading(false);
    setLogs(prev => [...prev, '[WARN] 执行已手动停止']);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回脚本列表
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl">渠道佣金计算与验证</h1>
            <Badge variant={isRunning ? "destructive" : "secondary"}>
              {isRunning ? "运行中" : "就绪"}
            </Badge>
            {!apiVerification && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <AlertCircle className="w-3 h-3 mr-1" />
                API验证不匹配
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">计算渠道佣金并进行数据校验，支持税地级别和企业汇总分析</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 参数配置区 */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>参数配置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="environment">环境</Label>
                  <Select value={environment} onValueChange={setEnvironment}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择环境" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Beta</SelectItem>
                      <SelectItem value="prod">生产环境</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="channel-id">渠道ID</Label>
                  <Input
                    id="channel-id"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    placeholder="输入渠道ID"
                  />
                </div>
                <div>
                  <Label htmlFor="account">登录账号</Label>
                  <Input
                    id="account"
                    value={account}
                    placeholder="显示登录账号"
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  {!isRunning ? (
                    <Button
                      onClick={startExecution}
                      disabled={!environment || !channelId || isLoading}
                      className="w-full"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          加载中...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          开始执行
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={stopExecution}
                      variant="destructive"
                      className="w-full"
                    >
                      <Square className="w-4 h-4 mr-2" />
                      停止执行
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>实时日志</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {logs.length === 0 ? (
                      <p className="text-muted-foreground text-sm">等待执行...</p>
                    ) : (
                      logs.map((log, index) => (
                        <div key={index} className="text-xs font-mono">
                          <span className="text-muted-foreground">
                            {new Date().toLocaleTimeString()}
                          </span>
                          <span className="ml-2">{log}</span>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* 结果展示区 */}
          <div className="lg:col-span-3 space-y-6">
            {/* 渠道汇总统计 */}
            {summaryMetrics && (
              <Card>
                <CardHeader>
                  <CardTitle>渠道汇总统计</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">渠道总利润</p>
                      <p className="text-xl font-bold text-blue-600">{formatCurrency(summaryMetrics.total_profit)}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">本月佣金收入</p>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(summaryMetrics.monthly_profit)}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">今日佣金收入</p>
                      <p className="text-xl font-bold text-purple-600">{formatCurrency(summaryMetrics.daily_profit)}</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">盈利状态</p>
                      <p className="text-xl font-bold text-amber-600">
                        {summaryMetrics.is_profitable ? '盈利' : '亏损'}
                      </p>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">累计发放金额</p>
                      <p className="text-xl font-bold text-indigo-600">{formatCurrency(summaryMetrics.total_pay_amount)}</p>
                    </div>
                    <div className="bg-rose-50 p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">当日发放金额</p>
                      <p className="text-xl font-bold text-rose-600">{formatCurrency(summaryMetrics.daily_pay_amount)}</p>
                    </div>
                    <div className="bg-teal-50 p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">累计发放笔数</p>
                      <p className="text-xl font-bold text-teal-600">{summaryMetrics.total_count} 笔</p>
                    </div>
                    <div className={`bg-${summaryMetrics.mismatch_count > 0 ? 'red' : 'green'}-50 p-4 rounded-lg`}>
                      <p className="text-sm text-muted-foreground">验证匹配率</p>
                      <p className={`text-xl font-bold text-${summaryMetrics.mismatch_count > 0 ? 'red' : 'green'}-600`}>
                        {summaryMetrics.match_rate}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 税地级别分析 */}
            <Card>
              <CardHeader>
                <CardTitle>税地级别分析</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-muted-foreground">加载中...</p>
                  </div>
                ) : commissionDetails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>执行脚本后将显示税地级别数据</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>税地名称</TableHead>
                          <TableHead>实际支付</TableHead>
                          <TableHead>发放金额</TableHead>
                          <TableHead>企业服务费</TableHead>
                          <TableHead>渠道服务费</TableHead>
                          <TableHead>API佣金</TableHead>
                          <TableHead>差额</TableHead>
                          <TableHead>渠道利润</TableHead>
                          <TableHead>批次号</TableHead>
                          <TableHead>结算单号</TableHead>
                          <TableHead>所属月份</TableHead>
                          <TableHead>历史累计</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedCommissionDetails.map((detail) => (
                          <TableRow
                            key={detail.id}
                            className={!detail.is_matched ? "bg-red-50 hover:bg-red-100" : ""}
                          >
                            <TableCell>{detail.tax_name}</TableCell>
                            <TableCell>{formatCurrency(detail.actual_amount)}</TableCell>
                            <TableCell>{formatCurrency(detail.pay_amount)}</TableCell>
                            <TableCell>{formatCurrency(detail.server_amount)}</TableCell>
                            <TableCell
                              title={detail.difference !== 0
                                ? `接口佣金: ${formatCurrency(detail.api_commission)}\n脚本佣金: ${formatCurrency(detail.commission)}\n差额: ${formatCurrency(detail.difference)}`
                                : ''}
                            >
                              {formatCurrency(detail.commission)}
                            </TableCell>
                            <TableCell className={!detail.is_matched ? 'text-red-600 font-bold' : ''}>
                              {formatCurrency(detail.api_commission)}
                            </TableCell>
                            <TableCell className={detail.difference !== 0 ? 'text-red-600 font-bold' : ''}>
                              {formatCurrency(detail.difference)}
                            </TableCell>
                            {/* 渠道利润 - 不匹配时显示红色 */}
                            <TableCell className={!detail.is_matched ? 'text-red-600 font-bold' : ''}>
                              {formatCurrency(detail.channel_profit)}
                            </TableCell>
                            {/* 添加批次号列 */}
                            <TableCell className="max-w-[120px] truncate">{detail.batch_no}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{detail.balance_no}</TableCell>
                            <TableCell>{detail.month_str}</TableCell>
                            <TableCell>{formatCurrency(detail.history_amount)}</TableCell>
                            <TableCell>
                              {/* 修正：在Dialog上添加onOpenChange以在关闭时清除状态 */}
                              <Dialog onOpenChange={(isOpen) => !isOpen && setSelectedDetail(null)}>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedDetail(detail)}
                                  >
                                    详情
                                  </Button>
                                </DialogTrigger>
                                {/* 修正：Dialog内容现在完全依赖于selectedDetail状态，确保数据一致性 */}
                                {selectedDetail && (
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>{selectedDetail.tax_name} - 详细信息</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                      <div><strong>税地ID:</strong> {selectedDetail.tax_id}</div>
                                      <div><strong>企业名称:</strong> {selectedDetail.enterprise_name}</div>
                                      <div><strong>企业ID:</strong> {selectedDetail.enterprise_id}</div>
                                      <div><strong>实际支付:</strong> {formatCurrency(selectedDetail.actual_amount)}</div>
                                      <div><strong>发放金额:</strong> {formatCurrency(selectedDetail.pay_amount)}</div>
                                      <div><strong>企业服务费:</strong> {formatCurrency(selectedDetail.server_amount)}</div>
                                      <div><strong>渠道服务费:</strong> {formatCurrency(selectedDetail.commission)}</div>
                                      <div><strong>API佣金:</strong> {formatCurrency(selectedDetail.api_commission)}</div>
                                      <div><strong>差额:</strong> {formatCurrency(selectedDetail.difference)}</div>
                                      <div><strong>允许误差:</strong> {formatCurrency(selectedDetail.tolerance)}</div>
                                      <div><strong>原始渠道服务费:</strong> {selectedDetail.raw_commission}</div>
                                      <div><strong>渠道利润:</strong> {formatCurrency(selectedDetail.channel_profit)}</div>
                                      <div><strong>原始渠道利润:</strong> {selectedDetail.raw_channel_profit}</div>
                                      <div><strong>批次号:</strong> {selectedDetail.batch_no}</div>
                                      <div><strong>结算单号:</strong> {selectedDetail.balance_no}</div>
                                      <div><strong>费率配置:</strong> {selectedDetail.rate_config}</div>
                                      <div><strong>详细费率:</strong> {selectedDetail.rate_detail}</div>
                                      <div><strong>历史累计金额:</strong> {formatCurrency(selectedDetail.history_amount)}</div>
                                      <div><strong>支付时间:</strong> {selectedDetail.payment_over_time}</div>
                                      <div><strong>所属月份:</strong> {selectedDetail.month_str}</div>
                                      <div><strong>验证状态:</strong> {selectedDetail.is_matched ? '匹配' : '不匹配'}</div>
                                    </div>
                                    {/* 优化：onClick现在调用封装好的函数，代码更简洁 */}
                                    <Button onClick={() => handleCopyToClipboard(selectedDetail)} className="mt-4 w-full">
                                      <Copy className="w-4 h-4 mr-2" />
                                      复制全部内容
                                    </Button>
                                  </DialogContent>
                                )}
                              </Dialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {pagination && (
                      <div className="flex justify-between items-center mt-4">
                        <p className="text-sm text-muted-foreground">
                          显示 {pagination.page} / {pagination.total_pages} 页，共 {pagination.total_items} 条记录
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={pagination.page === 1}
                          >
                            上一页
                          </Button>

                          {/* 页码输入框 */}
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={1}
                              max={pagination?.total_pages || 1}
                              value={pageInputValue ?? ''}
                              onChange={(e) => {
                                const inputValue = e.target.value.trim();
                                if (inputValue === '') {
                                  setPageInputValue(null);
                                  return;
                                }

                                const value = parseInt(inputValue, 10);
                                if (!isNaN(value) && value >= 1 && value <= (pagination?.total_pages || 1)) {
                                  setPageInputValue(value);
                                }
                              }}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  const inputElement = e.target as HTMLInputElement;
                                  const value = parseInt(inputElement.value, 10);
                                  if (!isNaN(value) && value >= 1 && value <= (pagination?.total_pages || 1)) {
                                    handlePageChange(value);
                                  }
                                }
                              }}
                              className="w-16 text-center text-sm"
                              placeholder="页码"
                            />
                            <span className="text-sm">/ {pagination?.total_pages || 1}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (pageInputValue === null) return;

                                const value = Number(pageInputValue);
                                if (!isNaN(value) && value >= 1 && value <= (pagination?.total_pages || 1)) {
                                  handlePageChange(value);
                                }
                              }}
                            >
                              跳转
                            </Button>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={pagination.page === pagination.total_pages}
                          >
                            下一页
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* 企业汇总级别 */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>企业汇总数据</CardTitle>
                  {/* 企业切换按钮 - 只有存在多个企业时显示 */}
                  {uniqueEnterprises.length > 1 && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEnterpriseChange('prev')}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEnterpriseChange('next')}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {/* 显示当前企业和总数量 */}
                {uniqueEnterprises.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    企业 {currentEnterpriseIndex + 1}/{uniqueEnterprises.length}：{currentEnterprise?.enterprise_name}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-muted-foreground">加载中...</p>
                  </div>
                ) : enterpriseData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>执行脚本后将显示企业汇总数据</p>
                  </div>
                ) : (
                  <>
                    {/* 企业基本信息 */}
                    {currentEnterprise && (
                      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">企业名称</p>
                            <p className="font-medium">{currentEnterprise.enterprise_name}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">企业ID</p>
                            <p className="font-medium">{currentEnterprise.enterprise_id}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">累计发放金额</p>
                            <p className="font-medium">{formatCurrency(currentEnterprise.total_pay_amount || 0)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">累计佣金收益</p>
                            <p className="font-medium">{formatCurrency(currentEnterprise.total_profit || 0)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">累计交易笔数</p>
                            <p className="font-medium">{currentEnterprise.total_count} 笔</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">充值金额</p>
                            <p className="font-medium">{formatCurrency(currentEnterprise.total_recharge_amount || 0)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 月度数据表格 */}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>月份</TableHead>
                          <TableHead>本月发放金额</TableHead>
                          <TableHead>本月佣金收益</TableHead>
                          <TableHead>本月交易笔数</TableHead>
                          <TableHead>本月充值金额</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupEnterpriseDataByMonth().map(([month, items]) => {
                          const monthData = items[0];
                          return (
                            <TableRow key={month}>
                              <TableCell>{month}</TableCell>
                              <TableCell>{formatCurrency(monthData.month_pay_amount)}</TableCell>
                              <TableCell>{formatCurrency(monthData.month_profit)}</TableCell>
                              <TableCell>{monthData.month_count} 笔</TableCell>
                              <TableCell>{formatCurrency(monthData.month_recharge_amount)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
