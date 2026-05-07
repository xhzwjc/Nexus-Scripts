import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'team-resources.enc.json');

export async function GET(request: NextRequest) {
    const auth = requireScriptHubPermission(request, 'cert-health');
    if ('response' in auth) {
        return auth.response;
    }

    try {
        // 确保目录存在
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 如果文件不存在，返回空数据
        if (!fs.existsSync(DATA_FILE)) {
            return NextResponse.json({ encrypted: null });
        }

        const encryptedData = fs.readFileSync(DATA_FILE, 'utf-8');
        return NextResponse.json({ encrypted: encryptedData }, {
            headers: {
                'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
            },
        });
    } catch (error) {
        console.error('Failed to read team resources:', error);
        return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
    }
}
