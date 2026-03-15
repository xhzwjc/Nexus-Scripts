import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

import { getBackendBaseUrl } from '@/lib/server/backendBaseUrl';
import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

const DATA_FILE = path.join(process.cwd(), 'data', 'ai-resources.json');

// 确保data目录存在
function ensureDataDir() {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// POST: 保存资源数据
export async function POST(request: NextRequest) {
    const auth = requireScriptHubPermission(request, 'ai-resources-manage');
    if ('response' in auth) {
        return auth.response;
    }

    try {
        const data = await request.json();

        // 验证数据结构
        if (!data.categories || !data.resources) {
            return NextResponse.json(
                { error: 'Invalid data structure' },
                { status: 400 }
            );
        }

        // 转发到 FastAPI 后端
        const backendUrl = getBackendBaseUrl();

        const res = await fetch(`${backendUrl}/ai-resources/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: request.headers.get('authorization') || '',
            },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(30000) // 保存操作给更长的超时时间
        });

        if (res.ok) {
            // 同时在本地也备份一份（可选，但目前为了兼容性可以保留）
            try {
                ensureDataDir();
                fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            } catch (e) {
                console.warn('Backup to local JSON failed:', e);
            }
            return NextResponse.json({ success: true });
        } else {
            const errorText = await res.text();
            throw new Error(`Backend save failed: ${errorText}`);
        }
    } catch (error) {
        console.error('Failed to save AI resources via backend:', error);

        // Note: data is already captured in the outer try block as `data` variable
        try {
            ensureDataDir();
        } catch { }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to save data' },
            { status: 500 }
        );
    }
}
