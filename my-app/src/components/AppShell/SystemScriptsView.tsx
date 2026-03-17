'use client';

import { ArrowLeft, Play } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import type { Script, SystemConfig } from '@/lib/types';

interface SystemScriptsViewProps {
    selectedSystem: string;
    system?: SystemConfig;
    scripts: Script[];
    filteredScripts: Script[];
    scriptQuery: string;
    onScriptQueryChange: (value: string) => void;
    onBack: () => void;
    onLaunchScript: (scriptId: string) => void;
    getSystemName: (systemId: string) => string;
    getSystemDesc: (systemId: string) => string;
    getScriptName: (scriptId: string) => string;
    getScriptDesc: (scriptId: string) => string;
    getStatusColor: (status: string) => string;
}

export function SystemScriptsView({
    selectedSystem,
    system,
    scripts,
    filteredScripts,
    scriptQuery,
    onScriptQueryChange,
    onBack,
    onLaunchScript,
    getSystemName,
    getSystemDesc,
    getScriptName,
    getScriptDesc,
    getStatusColor,
}: SystemScriptsViewProps) {
    const { t } = useI18n();
    const hasFewScripts = filteredScripts.length > 0 && filteredScripts.length <= 2;

    return (
        <div className="p-8 max-w-7xl mx-auto w-full">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="mr-2 h-8 w-8"
                        onClick={onBack}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-2xl font-bold">{getSystemName(selectedSystem)}</h1>
                    <Badge variant="outline" className="bg-background/50">
                        {filteredScripts.length} / {scripts.length}{t.system.scriptsCount}
                    </Badge>
                </div>
                <p className="text-muted-foreground">{getSystemDesc(selectedSystem)}</p>
            </div>

            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                    {scripts.length > 0 ? t.system.searchHint : t.system.noScripts}
                </p>
                {scripts.length > 0 && (
                    <Input
                        value={scriptQuery}
                        onChange={(event) => onScriptQueryChange(event.target.value)}
                        placeholder={t.system.searchPlaceholder}
                        className="md:max-w-sm bg-background/80"
                    />
                )}
            </div>

            <div
                className={
                    hasFewScripts
                        ? 'flex flex-col items-center justify-center min-h-[300px]'
                        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                }
            >
                {filteredScripts.map((script) => (
                    <Card
                        key={script.id}
                        className={`
                            cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 bg-card/80 backdrop-blur-sm
                            ${hasFewScripts ? 'w-full max-w-md mb-6' : ''}
                        `}
                    >
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                        {script.icon}
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">{getScriptName(script.id)}</CardTitle>
                                        <Badge className={`mt-2 border ${getStatusColor(script.status)}`}>
                                            {script.status}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <CardDescription className="mb-4 min-h-[40px]">
                                {getScriptDesc(script.id)}
                            </CardDescription>
                            <button
                                className="btn-outline-gray w-full group"
                                onClick={() => onLaunchScript(script.id)}
                            >
                                <Play className="w-4 h-4 mr-2 text-teal-500 group-hover:text-teal-400 transition-colors" />
                                {t.system.launchScript}
                            </button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {!system && (
                <div className="mt-8 text-sm text-muted-foreground">{t.system.noScripts}</div>
            )}
        </div>
    );
}
