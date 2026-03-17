import { NextRequest, NextResponse } from 'next/server';

import { getBackendBaseUrl } from '@/lib/server/backendBaseUrl';
import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = requireScriptHubPermission(request, 'team-resources-manage');
    if ('response' in auth) {
        return auth.response;
    }

    try {
        const backendUrl = getBackendBaseUrl();

        const res = await fetch(`${backendUrl}/team-resources/edit-data`, {
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Authorization: request.headers.get('authorization') || '',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json(data);
        }

        const errorText = await res.text();
        return NextResponse.json(
            { error: errorText || 'Failed to fetch editable team resources from backend' },
            { status: res.status },
        );
    } catch (error) {
        console.error('Failed to load editable team resources from backend:', error);

        return NextResponse.json(
            { error: 'Backend service unavailable' },
            { status: 503 },
        );
    }
}
