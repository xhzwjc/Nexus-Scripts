import { NextRequest } from 'next/server';

import { ensureRbacAdmin, proxyAdminRbacRequest } from '@/lib/server/adminRbacProxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = ensureRbacAdmin(request);
    if ('response' in auth) {
        return auth.response;
    }

    const query = request.nextUrl.searchParams.toString();
    const path = query ? `/admin/rbac/audit-logs?${query}` : '/admin/rbac/audit-logs';
    return proxyAdminRbacRequest(request, path, { method: 'GET' });
}
