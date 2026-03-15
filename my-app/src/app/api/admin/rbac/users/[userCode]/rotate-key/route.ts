import { NextRequest, NextResponse } from 'next/server';

import { ensureRbacAdmin, proxyAdminRbacRequest } from '@/lib/server/adminRbacProxy';

type Context = {
    params: Promise<{
        userCode: string;
    }>;
};

export async function POST(request: NextRequest, context: Context) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const body = await request.json().catch(() => ({}));
    if (body !== null && typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { userCode } = await context.params;
    return proxyAdminRbacRequest(request, `/admin/rbac/users/${encodeURIComponent(userCode)}/rotate-key`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(20000),
    });
}
