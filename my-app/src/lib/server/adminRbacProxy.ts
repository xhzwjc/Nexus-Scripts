import { NextRequest, NextResponse } from 'next/server';

import { getBackendBaseUrl } from '@/lib/server/backendBaseUrl';
import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

function formatValidationErrorItem(item: unknown) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const msg = 'msg' in item && typeof item.msg === 'string' ? item.msg.trim() : '';
    const loc = 'loc' in item && Array.isArray(item.loc)
        ? item.loc
            .filter((part) => typeof part === 'string' && part !== 'body')
            .join('.')
        : '';

    if (!msg) {
        return null;
    }

    return loc ? `${loc}: ${msg}` : msg;
}

function extractErrorMessage(payload: unknown, fallback: string) {
    if (payload && typeof payload === 'object') {
        const detail = 'detail' in payload ? payload.detail : undefined;
        const error = 'error' in payload ? payload.error : undefined;
        if (Array.isArray(detail)) {
            const messages = detail
                .map((item) => formatValidationErrorItem(item))
                .filter((message): message is string => Boolean(message));
            if (messages.length > 0) {
                return messages.join('; ');
            }
        }
        if (typeof detail === 'string' && detail.trim()) {
            return detail;
        }
        if (typeof error === 'string' && error.trim()) {
            return error;
        }
    }

    return fallback;
}

export function ensureRbacAdmin(request: NextRequest) {
    return requireScriptHubPermission(request, 'rbac-manage');
}

export async function proxyAdminRbacRequest(
    request: NextRequest,
    path: string,
    init: RequestInit = {},
) {
    const backendUrl = getBackendBaseUrl();

    try {
        const response = await fetch(`${backendUrl}${path}`, {
            ...init,
            cache: 'no-store',
            headers: {
                Authorization: request.headers.get('authorization') || '',
                ...(init.headers || {}),
            },
            signal: init.signal || AbortSignal.timeout(15000),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            return NextResponse.json(
                { error: extractErrorMessage(payload, 'RBAC backend request failed') },
                { status: response.status },
            );
        }

        return NextResponse.json(payload);
    } catch (error) {
        console.error('Failed to proxy RBAC admin request', { path, error });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Backend service unavailable' },
            { status: 503 },
        );
    }
}
