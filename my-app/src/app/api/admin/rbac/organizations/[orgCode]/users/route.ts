import { NextRequest } from 'next/server';

import { ensureRbacAdmin, proxyAdminRbacRequest } from '@/lib/server/adminRbacProxy';

interface RouteContext {
    params: Promise<{ orgCode: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const { orgCode } = await context.params;
    return proxyAdminRbacRequest(request, `/admin/rbac/organizations/${encodeURIComponent(orgCode)}/users`, {
        method: 'GET',
        signal: AbortSignal.timeout(20000),
    });
}
