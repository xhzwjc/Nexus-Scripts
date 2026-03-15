import { NextRequest, NextResponse } from 'next/server';

import { getBackendBaseUrl } from '@/lib/server/backendBaseUrl';
import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

export const dynamic = 'force-dynamic';

// GET: 获取资源数据
export async function GET(request: NextRequest) {
    const auth = requireScriptHubPermission(request, 'ai-resources');
    if ('response' in auth) {
        return auth.response;
    }

    try {
        const backendUrl = getBackendBaseUrl();

        const res = await fetch(`${backendUrl}/ai-resources/data`, {
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Authorization: request.headers.get('authorization') || '',
            },
            signal: AbortSignal.timeout(15000)
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json(data);
        }

        console.error('FastAPI backend error during GET');
        return NextResponse.json(
            { error: 'Failed to fetch data from backend' },
            { status: res.status }
        );
    } catch (error) {
        console.error('Failed to load AI resources from backend:', error);

        return NextResponse.json(
            { error: 'Backend service unavailable' },
            { status: 503 }
        );
    }
}
