import { NextRequest, NextResponse } from 'next/server';

import { ensureRbacAdmin, proxyAdminRbacRequest } from '@/lib/server/adminRbacProxy';

interface RouteContext {
    params: Promise<{ orgCode: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const { orgCode } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    return proxyAdminRbacRequest(request, `/admin/rbac/organizations/${encodeURIComponent(orgCode)}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const { orgCode } = await context.params;
    return proxyAdminRbacRequest(request, `/admin/rbac/organizations/${encodeURIComponent(orgCode)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(20000),
    });
}
