import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import {ArrowLeft, Settings, Play, Database, Calculator, Users, CheckCircle, Send, FileText} from 'lucide-react';
import SettlementScript from './components/SettlementScript';
import CommissionScript from './components/CommissionScript';
import BalanceScript from './components/BalanceScript';
import TaskAutomationScript from './components/TaskAutomationScript';
import SmsManagementScript from "./components/BatchSmsScript";
import TaxReportManagement from "./components/TaxReportManagement";

interface Script {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'active' | 'beta' | 'stable';
}

const systems = {
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

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'system' | 'script'>('home');
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [selectedScript, setSelectedScript] = useState<string>('');

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
        return <TaxReportManagement onBack={() => setCurrentView('system')} />;
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

  if (currentView === 'script') {
    return renderScript();
  }

  if (currentView === 'system') {
    const system = systems[selectedSystem as keyof typeof systems];
    
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentView('home')}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回首页
            </Button>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl">{system?.name}</h1>
              <Badge variant="outline">{system?.scripts.length} 个脚本</Badge>
            </div>
            <p className="text-muted-foreground">{system?.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {system?.scripts.map((script) => (
              <Card key={script.id} className="cursor-pointer hover:shadow-md transition-shadow">
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
                      <p>即将上线更多功能</p>
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
              <span>系统运行正常，支持 8+ 个自动化脚本</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}