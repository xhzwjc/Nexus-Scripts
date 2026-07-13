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
    const query = request.nextUrl.searchParams.toString();
    const basePath = `/admin/rbac/organizations/${encodeURIComponent(orgCode)}/users`;
    const path = query ? `${basePath}?${query}` : basePath;
    return proxyAdminRbacRequest(request, path, {
        method: 'GET',
        signal: AbortSignal.timeout(20000),
    });
}
