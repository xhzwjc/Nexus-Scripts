import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET: 获取团队资源数据
export async function GET() {
    try {
        // 自动判断后端地址
        let backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8091';

        // 如果是 Docker 内部通信或外部 Tailscale 地址，直接连容器
        if (backendUrl.includes('.ts.net')) {
            backendUrl = 'http://fastapi:8091';
        }

        const res = await fetch(`${backendUrl}/team-resources/data`, {
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(15000)
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json(data);
        }

        console.error('FastAPI backend error during GET team resources');
        return NextResponse.json(
            { error: 'Failed to fetch team resources from backend' },
            { status: res.status }
        );
    } catch (error) {
        console.error('Failed to load team resources from backend:', error);

        return NextResponse.json(
            { error: 'Backend service unavailable' },
            { status: 503 }
        );
    }
}
