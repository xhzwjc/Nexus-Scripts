import { NextRequest, NextResponse } from 'next/server';

import { ensureRbacAdmin, proxyAdminRbacRequest } from '@/lib/server/adminRbacProxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const query = request.nextUrl.searchParams.toString();
    const path = query ? `/admin/rbac/users?${query}` : '/admin/rbac/users';
    return proxyAdminRbacRequest(request, path, { method: 'GET' });
}

export async function POST(request: NextRequest) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    return proxyAdminRbacRequest(request, '/admin/rbac/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
}
