import { NextRequest, NextResponse } from 'next/server';

import { getBackendBaseUrl } from '@/lib/server/backendBaseUrl';
import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

export const dynamic = 'force-dynamic';

// GET: 获取团队资源数据
export async function GET(request: NextRequest) {
    const auth = requireScriptHubPermission(request, 'team-resources');
    if ('response' in auth) {
        return auth.response;
    }

    try {
        const backendUrl = getBackendBaseUrl();

        const res = await fetch(`${backendUrl}/team-resources/data`, {
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

        const errorText = await res.text();
        console.error('FastAPI backend error during GET team resources', {
            status: res.status,
            backendUrl,
            errorText,
        });

        return NextResponse.json(
            { error: errorText || 'Failed to fetch team resources from backend' },
            { status: res.status }
        );
    } catch (error) {
        console.error('Failed to load team resources from backend:', error);

        return NextResponse.json(
            { error: 'Backend service unavailable' },
            { status: 503 }
        );
    }
}
