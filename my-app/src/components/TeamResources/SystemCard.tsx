import React, { useState, useMemo } from 'react';
import { SystemResource, Environment } from '@/lib/team-resources-data';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, Database, ExternalLink, Eye, EyeOff, Copy, User } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

interface SystemCardProps {
    system: SystemResource;
    groupLogo?: string; // 集团logo，作为favicon加载失败时的回退
}

export function SystemCard({ system, groupLogo }: SystemCardProps) {
    const { t } = useI18n();
    const tr = t.teamResources;
    // 判断环境是否有有效数据（url不为空且不是占位符）
    const hasValidEnv = (envKey: Environment): boolean => {
        const envData = system.environments[envKey];
        if (!envData) return false;
        const url = envData.url?.trim() || '';
        return url.length > 0 && url !== 'https://' && url !== 'example.com';
    };

    // 智能选择默认环境：生产 > 测试 > 开发
    const getDefaultEnv = React.useCallback((): Environment => {
        if (hasValidEnv('prod')) return 'prod';
        if (hasValidEnv('test')) return 'test';
        if (hasValidEnv('dev')) return 'dev';
        // 如果都没有有效数据，返回第一个存在的环境
        if (system.environments.prod) return 'prod';
        if (system.environments.test) return 'test';
        if (system.environments.dev) return 'dev';
        return 'prod';
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [system.id, system.environments]);

    const [env, setEnv] = useState<Environment>(getDefaultEnv());
    const [revealedCreds, setRevealedCreds] = useState<Record<string, boolean>>({});
    const [faviconError, setFaviconError] = useState(false);

    const currentEnv = system.environments[env];

    // 当系统数据变化时重新计算默认环境
    React.useEffect(() => {
        setEnv(getDefaultEnv());
        setFaviconError(false); // 重置favicon错误状态
    }, [getDefaultEnv]);

    // 从URL中提取favicon地址
    const faviconUrl = useMemo(() => {
        // 优先使用生产环境，然后测试，最后开发
        const envOrder: Environment[] = ['prod', 'test', 'dev'];
        for (const envKey of envOrder) {
            const envData = system.environments[envKey];
            if (envData?.url) {
                const url = envData.url.trim();
                if (url && url !== 'https://' && url !== 'example.com') {
                    try {
                        // 确保URL有协议
                        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
                        const urlObj = new URL(fullUrl);
                        // 直接从网站根目录获取favicon
                        return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
                    } catch {
                        // URL解析失败，继续尝试下一个环境
                    }
                }
            }
        }
        return null;
    }, [system.environments]);

    const toggleReveal = (id: string) => {
        setRevealedCreds(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const copyToClipboard = (text: string, label: string) => {
        if (!text) {
            toast.error(tr.contentEmpty);
            return;
        }
        navigator.clipboard.writeText(text);
        toast.success(tr.copiedLabel.replace('{label}', label));
    };

    const envLabels: Record<Environment, string> = {
        dev: tr.envDev,
        test: tr.envTest,
        prod: tr.envProd
    };

    return (
        <Card className="flex flex-col overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-white">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                <div className="flex gap-3">
                    <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center justify-center w-10 h-10 relative">
                        {/* 默认显示集团logo或Database图标 */}
                        {groupLogo && faviconError ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={groupLogo} alt="" className="w-5 h-5 object-contain" />
                        ) : (
                            <Database className={`w-5 h-5 text-blue-600 transition-opacity duration-300 ${faviconUrl && !faviconError ? 'opacity-0' : 'opacity-100'}`} />
                        )}
                        {/* Favicon 加载成功后覆盖显示 */}
                        {faviconUrl && !faviconError && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={faviconUrl}
                                alt=""
                                className="w-5 h-5 object-contain absolute opacity-0 transition-opacity duration-500"
                                onError={() => setFaviconError(true)}
                                onLoad={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.classList.remove('opacity-0');
                                    target.classList.add('opacity-100');
                                }}
                            />
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-base">{system.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{system.description || tr.noDescription}</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-5 flex-1 flex flex-col gap-4">

                {/* Environment Tabs */}
                <Tabs value={env} onValueChange={(v) => setEnv(v as Environment)} className="w-full">
                    <TabsList className="w-full grid grid-cols-3 mb-4 bg-slate-100/80">
                        <TabsTrigger value="dev" disabled={!system.environments.dev}>
                            {envLabels.dev}
                        </TabsTrigger>
                        <TabsTrigger value="test" disabled={!system.environments.test}>
                            {envLabels.test}
                        </TabsTrigger>
                        <TabsTrigger value="prod" disabled={!system.environments.prod}>
                            {envLabels.prod}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {currentEnv ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* URL Link */}
                        <div className="flex items-center gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-sm text-blue-700 hover:bg-blue-50 transition-colors group">
                            <Globe className="w-4 h-4 shrink-0" />
                            <a href={currentEnv.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate font-medium hover:underline">
                                {currentEnv.url}
                            </a>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                onClick={() => copyToClipboard(currentEnv.url, 'URL')}
                            >
                                <Copy className="w-3 h-3" />
                            </Button>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                        </div>

                        {/* Credentials */}
                        <div className="space-y-2">
                            {currentEnv.creds.length > 0 ? (
                                currentEnv.creds.map(cred => (
                                    <div key={cred.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 group">
                                        <div className="w-16 shrink-0 text-xs font-medium text-slate-500">{cred.label}</div>

                                        <div className="flex-1 flex items-center gap-2 min-w-0">
                                            {/* Username */}
                                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200">
                                                <User className="w-3 h-3 text-slate-400" />
                                                <span className="text-sm font-mono text-slate-700 truncate max-w-[100px]">
                                                    {cred.username}
                                                </span>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-5 w-5 ml-1"
                                                    onClick={() => copyToClipboard(cred.username, tr.username)}
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>

                                            <span className="text-slate-300">/</span>

                                            {/* Password */}
                                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 flex-1 min-w-0">
                                                <span className="text-sm font-mono text-slate-700 truncate">
                                                    {cred.password ? (revealedCreds[cred.id] ? cred.password : '••••••••') : tr.notSet}
                                                </span>
                                                {cred.password && (
                                                    <>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-5 w-5 ml-auto"
                                                            onClick={() => toggleReveal(cred.id)}
                                                        >
                                                            {revealedCreds[cred.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-5 w-5"
                                                            onClick={() => copyToClipboard(cred.password || '', tr.password)}
                                                        >
                                                            <Copy className="w-3 h-3" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4 text-sm text-slate-400 italic">
                                    {tr.noCredentials}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="py-8 text-center text-slate-400 text-sm">
                        {tr.envNotConfigured}
                    </div>
                )}
            </div>
        </Card>
    );
}
