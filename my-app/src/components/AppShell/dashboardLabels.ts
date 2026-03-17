import type { Translations } from '@/lib/i18n';

const scriptIdToKey: Record<string, keyof Translations['scriptConfig']['items']> = {
    settlement: 'settlement',
    commission: 'commission',
    balance: 'balance',
    'task-automation': 'taskAutomation',
    sms_operations_center: 'smsOperationsCenter',
    'tax-reporting': 'taxReporting',
    'tax-calculation': 'taxCalculation',
    'payment-stats': 'paymentStats',
    'delivery-tool': 'deliveryTool',
    'server-monitoring': 'serverMonitoring',
};

export function getSystemName(t: Translations, systemId: string): string {
    if (systemId === 'chunmiao') return t.scriptConfig.systems.chunmiao.name;
    if (systemId === 'haoshi') return t.scriptConfig.systems.haoshi.name;
    return systemId;
}

export function getSystemDesc(t: Translations, systemId: string): string {
    if (systemId === 'chunmiao') return t.scriptConfig.systems.chunmiao.description;
    if (systemId === 'haoshi') return t.scriptConfig.systems.haoshi.description;
    return '';
}

export function getScriptName(t: Translations, scriptId: string): string {
    const key = scriptIdToKey[scriptId];
    if (key && t.scriptConfig.items[key]) {
        return t.scriptConfig.items[key].name;
    }
    return scriptId;
}

export function getScriptDesc(t: Translations, scriptId: string): string {
    const key = scriptIdToKey[scriptId];
    if (key && t.scriptConfig.items[key]) {
        return t.scriptConfig.items[key].description;
    }
    return '';
}
