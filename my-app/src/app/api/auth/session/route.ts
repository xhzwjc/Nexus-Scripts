import { NextRequest, NextResponse } from 'next/server';

import {
    getSessionTokenFromRequest,
    verifyScriptHubSession,
} from '@/lib/server/scriptHubSession';
import { getBackendBaseUrl } from '@/lib/server/backendBaseUrl';
import type { User } from '@/lib/types';

class SessionProxyError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

type BackendSessionResponse = {
    token: string;
    user: User;
    expiresAt: number;
};

async function proxySessionRequest(path: string, init: RequestInit): Promise<BackendSessionResponse> {
    const backendUrl = getBackendBaseUrl();
    const response = await fetch(`${backendUrl}${path}`, {
        ...init,
        cache: 'no-store',
    });

    const data = await response.json().catch(() => ({ error: 'Authentication failed' })) as BackendSessionResponse & { error?: string };
    if (!response.ok) {
        throw new SessionProxyError(response.status, data.error || 'Authentication failed');
    }

    return data;
}

function createLocalSessionResponse(token: string) {
    const session = verifyScriptHubSession(token);
    if (!session) {
        return null;
    }

    return {
        token,
        user: {
            id: session.id,
            role: session.role,
            roles: Array.isArray(session.roles) ? session.roles : [],
            name: session.name,
            permissions: session.permissions,
            teamResourcesLoginKeyEnabled: session.teamResourcesLoginKeyEnabled,
        },
        expiresAt: session.exp,
    };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const key = typeof body?.key === 'string' ? body.key.trim() : '';

        if (!key) {
            return NextResponse.json({ error: 'Missing access key' }, { status: 400 });
        }

        const session = await proxySessionRequest('/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
            signal: AbortSignal.timeout(10000),
        });

        return NextResponse.json(session);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Authentication failed' },
            { status: error instanceof SessionProxyError ? error.status : 500 },
        );
    }
}

export async function GET(request: NextRequest) {
    const token = getSessionTokenFromRequest(request);
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const localSession = createLocalSessionResponse(token);
    if (!localSession) {
        return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    try {
        const refreshed = await proxySessionRequest('/auth/session', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(10000),
        });
        return NextResponse.json(refreshed);
    } catch {
        return NextResponse.json(localSession);
    }
}
