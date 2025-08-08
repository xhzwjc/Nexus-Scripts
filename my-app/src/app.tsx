import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Input } from './components/ui/input';
import {Toaster, toast} from 'sonner';
import { ArrowLeft, Settings, Play, Database, Calculator, Users, CheckCircle, Send, FileText, Lock, AlertCircle, Loader2 } from 'lucide-react';
import SettlementScript from './components/SettlementScript';
import CommissionScript from './components/CommissionScript';
import BalanceScript from './components/BalanceScript';
import TaskAutomationScript from './components/TaskAutomationScript';
import SmsManagementScript from "./components/BatchSmsScript";
import TaxReportReportManagement from "./components/TaxReportManagement";

// 定义角色类型和权限映射
type Role = 'admin' | 'operator' | 'custom';

interface Permission {
  [scriptId: string]: boolean;
}

interface User {
  role: Role;
  permissions: Permission;
  name?: string;
}

// 存储在localStorage中的认证信息类型
interface AuthData {
  key: string;
  user: User;
  expiresAt: number; // 时间戳，当天23:59:59
}

// 密钥与用户映射表 (实际应用中应存储在后端)
const keyUserMap: Record<string, User> = {
  // 超管密钥 - 拥有所有权限
  'ADMIN_KEY_123': {
    role: 'admin',
    permissions: {
      'settlement': true,
      'commission': true,
      'balance': true,
      'task-automation': true,
      'sms_operations_center': true,
      'tax-reporting': true
    },
    name: '系统管理员'
  },
  // 运营人员密钥 - 仅税务报表权限
  'OPERATOR_KEY_456': {
    role: 'operator',
    permissions: {
      'tax-reporting': true
    },
    name: '运营人员'
  },
  // 自定义角色
  'CUSTOM_KEY_789': {
    role: 'custom',
    permissions: {
      'settlement': true,
      'commission': true,
      'balance': true,
      'task-automation': true,
      'sms_operations_center': true,
    },
    name: '财务人员'
  }
};

interface Script {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'active' | 'beta' | 'stable';
}

const allScripts = {
  chunmiao: {
    name: 'CM系统',
    description: '企业结算与渠道管理系统',
    scripts: [
      {
        id: 'settlement',
        name: '结算处理脚本',
        description: '批量处理企业结算任务，支持并发执行',
        icon: <Settings className="w-5 h-5" />,
        status: 'stable' as const
      },
      {
        id: 'commission',
        name: '渠道佣金计算与验证',
        description: '计算渠道佣金并进行数据校验',
        icon: <Calculator className="w-5 h-5" />,
        status: 'stable' as const
      },
      {
        id: 'balance',
        name: '企业账户余额核对',
        description: '核对企业账户余额的准确性',
        icon: <Database className="w-5 h-5" />,
        status: 'active' as const
      },
      {
        id: 'task-automation',
        name: '任务自动化管理工具',
        description: '批量执行用户任务流程操作',
        icon: <Users className="w-5 h-5" />,
        status: 'beta' as const
      },
      {
        id: 'sms_operations_center',
        name: '短信运营中心',
        description: '模板管理与批量发送、补发综合工具',
        icon: <Send className="w-5 h-5" />,
        status: 'beta' as const
      },
      {
        id: 'tax-reporting',
        name: '税务报表生成',
        description: '按企业和月份生成完税数据报表并导出',
        icon: <FileText className="w-5 h-5" />,
        status: 'beta' as const
      }
    ]
  },
  haoshi: {
    name: 'HS系统',
    description: '即将上线更多脚本功能',
    scripts: []
  }
};

// 计算当天结束时间戳（23:59:59）
const getEndOfDayTimestamp = () => {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now.getTime();
};

export default function App() {
  // 状态管理
  const [currentView, setCurrentView] = useState<'home' | 'system' | 'script'>('home');
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [userKey, setUserKey] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [systems, setSystems] = useState(allScripts);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  // 初始化时检查本地存储的认证信息
  useEffect(() => {
    const checkSavedAuth = () => {
      const timer = setTimeout(() => {
        const savedAuth = localStorage.getItem('scriptHubAuth');
        if (savedAuth) {
          try {
            const authData: AuthData = JSON.parse(savedAuth);
            const now = new Date().getTime();

            if (now <= authData.expiresAt) {
              const user = keyUserMap[authData.key];
              if (user) {
                setCurrentUser(user);
                filterScriptsByPermission(user);
                setIsLoading(false);
                return;
              }
            }
          } catch (error) {
            console.error('Failed to parse auth data:', error);
          }
        }

        localStorage.removeItem('scriptHubAuth');
        setIsLoading(false);
      }, 100);

      return () => clearTimeout(timer);
    };

    checkSavedAuth();
  }, []);

  // 验证密钥并保存认证信息 - 添加500ms延迟
  const validateKey = () => {
    setErrorMessage('');
    if (!userKey.trim()) {
      // setErrorMessage('请输入访问密钥');
      toast.error("请输入访问密钥")
      return;
    }

    // 设置验证状态为true，禁用按钮并显示加载动画
    setIsVerifying(true);

    // 500ms后执行验证逻辑
    setTimeout(() => {
      const user = keyUserMap[userKey.trim()];
      if (user) {
        const authData: AuthData = {
          key: userKey.trim(),
          user,
          expiresAt: getEndOfDayTimestamp()
        };

        localStorage.setItem('scriptHubAuth', JSON.stringify(authData));
        setCurrentUser(user);
        filterScriptsByPermission(user);
      } else {
        // setErrorMessage('无效的访问密钥，请重新输入');
        toast.error("无效的访问密钥，请重新输入")
      }

      setIsVerifying(false);
    }, 500);
  };

  // 根据权限过滤脚本
  const filterScriptsByPermission = (user: User) => {
    // 使用 Object.fromEntries 和 .map 来创建一个全新的、经过过滤的 systems 对象
    const filteredSystems = Object.fromEntries(
        Object.entries(allScripts).map(([systemKey, system]) => {
          // 1. 过滤当前 system 的 scripts 数组
          const filteredScripts = system.scripts.filter(script =>
              user.permissions[script.id]
          );

          // 2. 返回一个新的 [key, value] 对，其中 value 是一个包含过滤后 scripts 的新 system 对象
          return [systemKey, { ...system, scripts: filteredScripts }];
        })
    ) as typeof allScripts;

    setSystems(filteredSystems);
  };

  // 退出登录
  const logout = () => {
    setCurrentUser(null);
    setUserKey('');
    setCurrentView('home');
    setSystems(allScripts);
    localStorage.removeItem('scriptHubAuth');
  };

  const renderScript = () => {
    switch (selectedScript) {
      case 'settlement':
        return <SettlementScript onBack={() => setCurrentView('system')} />;
      case 'commission':
        return <CommissionScript onBack={() => setCurrentView('system')} />;
      case 'balance':
        return <BalanceScript onBack={() => setCurrentView('system')} />;
      case 'task-automation':
        return <TaskAutomationScript onBack={() => setCurrentView('system')} />;
      case 'sms_operations_center':
        return <SmsManagementScript onBack={() => setCurrentView('system')} />;
      case 'tax-reporting':
        return <TaxReportReportManagement onBack={() => setCurrentView('system')} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'beta': return 'bg-yellow-100 text-yellow-800';
      case 'stable': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <h2 className="text-lg font-medium">正在验证身份...</h2>
          <p className="text-muted-foreground">请稍候</p>
        </div>
      </div>
    );
  }

  // 未登录状态 - 显示密钥输入界面
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Toaster richColors position="top-center"/>
        <Card className="w-full max-w-md animate-fadeIn">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Lock className="w-5 h-5" />
              访问授权
            </CardTitle>
            <CardDescription className="text-center">
              请输入您的访问密钥以使用系统
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-md">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMessage}</span>
              </div>
            )}
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="输入访问密钥"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isVerifying) {
                    validateKey();
                  }
                }}
                disabled={isVerifying}
                className="pr-10"
              />
            </div>
            <Button
              className="w-full"
              onClick={validateKey}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  验证中...
                </>
              ) : (
                '验证并进入系统'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentView === 'script') {
    return renderScript();
  }

  if (currentView === 'system') {
    const system = systems[selectedSystem as keyof typeof systems];
    const { scripts } = system || { scripts: [] };
    // 根据脚本数量决定布局样式
    const hasFewScripts = scripts.length > 0 && scripts.length <= 2;

    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentView('home')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回首页
            </Button>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{currentUser.name} ({currentUser.role})</Badge>
              <Button variant="ghost" size="sm" onClick={logout}>退出</Button>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl">{system?.name}</h1>
              <Badge variant="outline">{system?.scripts.length} 个脚本</Badge>
            </div>
            <p className="text-muted-foreground">{system?.description}</p>
          </div>

          {/* 根据脚本数量动态调整布局 */}
          <div className={`
            ${hasFewScripts 
              ? 'flex flex-col items-center justify-center min-h-[300px]' 
              : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            }
          `}>
            {scripts.map((script) => (
              <Card
                key={script.id}
                className={`
                  cursor-pointer hover:shadow-md transition-shadow 
                  ${hasFewScripts ? 'w-full max-w-md mb-6' : ''}
                `}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        {script.icon}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{script.name}</CardTitle>
                        <Badge className={`mt-2 ${getStatusColor(script.status)}`}>
                          {script.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {script.description}
                  </CardDescription>
                  <Button 
                    className="w-full"
                    onClick={() => {
                      setSelectedScript(script.id);
                      setCurrentView('script');
                    }}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    启动脚本
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-end mb-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{currentUser.name} ({currentUser.role})</Badge>
            <Button variant="ghost" size="sm" onClick={logout}>退出</Button>
          </div>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-3xl mb-4">ScriptHub 脚本管理平台</h1>
          <p className="text-lg text-muted-foreground">
            企业级自动化脚本调度与执行中心
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {Object.entries(systems).map(([key, system]) => (
            <Card key={key} className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{system.name}</CardTitle>
                  <Badge variant="outline">
                    {system.scripts.length} 个脚本
                  </Badge>
                </div>
                <CardDescription>{system.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {system.scripts.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {system.scripts.slice(0, 3).map((script) => (
                          <Badge key={script.id} variant="secondary" className="text-xs">
                            {script.name}
                          </Badge>
                        ))}
                        {system.scripts.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{system.scripts.length - 3} 更多
                          </Badge>
                        )}
                      </div>
                      <Button 
                        className="w-full mt-4"
                        onClick={() => {
                          setSelectedSystem(key);
                          setCurrentView('system');
                        }}
                      >
                        进入系统
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>您没有该系统的访问权限</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Card className="inline-block p-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <CheckCircle className="w-5 h-5" />
              <span>系统运行正常，您有权访问 {
                Object.values(systems).reduce((total, system) => total + system.scripts.length, 0)
              } 个自动化脚本</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}