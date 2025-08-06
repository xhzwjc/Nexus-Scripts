import React, { useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ArrowLeft, Search, RotateCcw, AlertTriangle, CheckCircle, AlertCircle, Info } from 'lucide-react';


// 定义API响应数据结构
interface ApiResponse {
  success: boolean;
  message: string;
  data: BalanceResult[];
  request_id: string;
  enterprise_id: number;
}

// 定义余额核对结果结构
interface BalanceResult {
  tax_location_id: number;
  tax_address: string;
  enterprise_name: string;
  is_correct: boolean;
  total_deductions: number;
  total_recharges: number;
  expected_balance: number;
  actual_balance: number;
  balance_diff: number;
}

interface BalanceScriptProps {
  onBack: () => void;
}

export default function BalanceScript({ onBack }: BalanceScriptProps) {
  const [environment, setEnvironment] = useState('test');
  const [tenantId, setTenantId] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [results, setResults] = useState<BalanceResult[]>([]);
  const [queryCount, setQueryCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [apiMessage, setApiMessage] = useState('');

  // 清除错误信息
  const clearError = () => {
    setErrorMessage('');
    setApiMessage('');
  };

  // 处理查询
  const startQuery = async () => {
    console.log(process)
    // 验证输入
    if (!tenantId || isNaN(Number(tenantId))) {

      setErrorMessage('请输入有效的企业租户ID');
      return;
    }

    setIsQuerying(true);
    setErrorMessage('');
    setApiMessage('');
    clearError();



    try {
      // 调用真实API
      const response = await axios.post<ApiResponse>(`${process.env.NEXT_PUBLIC_API_BASE_URL}/balance/verify`, {
      // const response = await axios.post<ApiResponse>('http://192.168.20.240:8000/balance/verify', {
        tenant_id: Number(tenantId),
        environment: environment,
        timeout: 15
      });

      if (response.data.success) {
        setResults(response.data.data);
        setApiMessage(response.data.message); // 显示API返回的消息
        setErrorCount(response.data.data.filter(r => !r.is_correct).length);
        setQueryCount(prev => prev + 1);
      } else {
        setErrorMessage(response.data.message || '查询失败，请重试');
        setResults([]);
      }
    } catch (err) {
      console.error('API调用错误:', err);
      setErrorMessage(
          err instanceof Error
              ? err.message
              : '与服务器通信失败，请检查网络连接'
      );
      setResults([]);
      setApiMessage('');
    } finally {
      setIsQuerying(false);
    }
  };

  // 重置结果
  const resetResults = () => {
    setResults([]);
    setQueryCount(0);
    setErrorCount(0);
    clearError();
  };

  // 格式化金额显示
  const formatCurrency = (amount: number) => {
    return '¥' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
  };

  return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Button variant="ghost" onClick={onBack} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回脚本列表
            </Button>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl">企业账户余额核对</h1>
              <Badge variant={isQuerying ? "destructive" : "secondary"}>
                {isQuerying ? "查询中" : "就绪"}
              </Badge>
            </div>
            <p className="text-muted-foreground">核对企业账户余额的准确性，检测异常并提供详细对比信息</p>
          </div>

        {/* 错误提示和API消息提示区域 */}
        {(errorMessage || apiMessage) && (
          <div className={`
            px-4 py-3 rounded mb-4 flex items-center
            ${errorMessage ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-blue-50 border border-blue-200 text-blue-700'}
          `}>
            {errorMessage ? (
              <AlertCircle className="w-4 h-4 mr-2" />
            ) : (
              <Info className="w-4 h-4 mr-2" />
            )}
            <span>{errorMessage || apiMessage}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearError}
              className={`ml-auto ${errorMessage ? 'text-red-500' : 'text-blue-500'} hover:text-opacity-100`}
            >
              关闭
            </Button>
          </div>
        )}

        <div className="space-y-6">
          {/* 参数配置区 */}
          <Card>
            <CardHeader>
              <CardTitle>查询参数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <Label htmlFor="environment">环境</Label>
                  <Select
                    value={environment}
                    onValueChange={setEnvironment}
                    disabled={isQuerying}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择环境" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Beta</SelectItem>
                      <SelectItem value="prod">生产环境</SelectItem>
                      {/*<SelectItem value="local">本地环境</SelectItem>*/}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tenant-id">企业租户ID</Label>
                  <Input
                    id="tenant-id"
                    value={tenantId}
                    onChange={(e) => {
                      setTenantId(e.target.value);
                      clearError();
                    }}
                    placeholder="输入企业租户ID"
                    disabled={isQuerying}
                    type="number"
                  />
                </div>
                <div>
                  <Button
                    onClick={startQuery}
                    disabled={!environment || !tenantId || isQuerying}
                    className="w-full"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    {isQuerying ? '查询中...' : '查询'}
                  </Button>
                </div>
                <div>
                  <Button
                    onClick={resetResults}
                    variant="outline"
                    disabled={isQuerying}
                    className="w-full"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    重置结果
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 摘要统计（仅当有结果时显示） */}
          {results.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">查询次数</p>
                      <p className="text-2xl">{queryCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">总税地数</p>
                      <p className="text-2xl">{results.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">异常税地数</p>
                      <p className="text-2xl text-red-600">{errorCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">正常税地数</p>
                      <p className="text-2xl text-green-600">{results.length - errorCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 结果表格 */}
          <Card>
            <CardHeader>
              <CardTitle>余额核对结果</CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 && queryCount === 0 ? (
                // 初始状态：未查询过
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>输入企业租户ID后点击查询开始余额核对</p>
                </div>
              ) : results.length === 0 && queryCount > 0 ? (
                // 已查询但无结果（如"未找到企业数据"）
                <div className="text-center py-12 text-muted-foreground">
                  <Info className="w-12 h-12 mx-auto mb-4 opacity-50 text-blue-500" />
                  <p>{apiMessage || '未查询到任何数据'}</p>
                  <Button
                    variant="outline"
                    onClick={resetResults}
                    className="mt-4"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    重新查询
                  </Button>
                </div>
              ) : (
                // 有结果时显示表格
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>税地ID</TableHead>
                      <TableHead>税地地址</TableHead>
                      <TableHead>企业名称</TableHead>
                      <TableHead>扣款总额</TableHead>
                      <TableHead>充值总额</TableHead>
                      <TableHead>应有余额</TableHead>
                      <TableHead>实际余额</TableHead>
                      <TableHead>余额差值</TableHead>
                      <TableHead>校对结果</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow
                        key={result.tax_location_id}
                        className={!result.is_correct ? "bg-red-50 hover:bg-red-100" : ""}
                      >
                        <TableCell>{result.tax_location_id}</TableCell>
                        <TableCell>{result.tax_address}</TableCell>
                        <TableCell>{result.enterprise_name}</TableCell>
                        <TableCell>{formatCurrency(result.total_deductions)}</TableCell>
                        <TableCell>{formatCurrency(result.total_recharges)}</TableCell>
                        <TableCell>{formatCurrency(result.expected_balance)}</TableCell>
                        <TableCell>{formatCurrency(result.actual_balance)}</TableCell>
                        <TableCell
                          className={result.balance_diff !== 0 ? "text-red-600 font-medium" : "text-green-600"}
                        >
                          {result.balance_diff === 0
                            ? '无差异'
                            : formatCurrency(result.balance_diff)
                          }
                        </TableCell>
                        <TableCell>
                          {result.is_correct ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              ✅ 正确
                            </Badge>
                          ) : (
                            <Badge
                              variant="destructive"
                              className="cursor-help"
                              title={`差额: ${formatCurrency(result.balance_diff)}`}
                            >
                              ❌ 异常
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
