import { NextRequest, NextResponse } from 'next/server';

import { ensureRbacAdmin, proxyAdminRbacRequest } from '@/lib/server/adminRbacProxy';

type Context = {
    params: Promise<{
        roleCode: string;
    }>;
};

export async function PATCH(request: NextRequest, context: Context) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { roleCode } = await context.params;
    return proxyAdminRbacRequest(request, `/admin/rbac/roles/${encodeURIComponent(roleCode)}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
}

export async function DELETE(request: NextRequest, context: Context) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const { roleCode } = await context.params;
    return proxyAdminRbacRequest(request, `/admin/rbac/roles/${encodeURIComponent(roleCode)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(20000),
    });
}
