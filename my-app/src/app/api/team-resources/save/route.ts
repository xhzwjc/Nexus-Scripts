import { NextRequest, NextResponse } from 'next/server';

// POST: 保存团队资源数据
export async function POST(request: NextRequest) {
    try {
        const data = await request.json();

        // 验证数据结构
        if (!data.groups || !Array.isArray(data.groups)) {
            return NextResponse.json(
                { error: 'Invalid data structure' },
                { status: 400 }
            );
        }

        // 转发到 FastAPI 后端
        let backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8091';

        // 如果是 Docker 内部通信或外部 Tailscale 地址，直接连容器
        if (backendUrl.includes('.ts.net')) {
            backendUrl = 'http://fastapi:8091';
        }

        const res = await fetch(`${backendUrl}/team-resources/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(30000) // 保存操作给更长的超时时间
        });

        if (res.ok) {
            return NextResponse.json({ success: true });
        } else {
            const errorText = await res.text();
            throw new Error(`Backend save failed: ${errorText}`);
        }
    } catch (error) {
        console.error('Failed to save team resources via backend:', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to save data' },
            { status: 500 }
        );
    }
}
