import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET: 获取资源数据
export async function GET() {
    try {
        // 1. 自动判断后端地址
        // 如果在 Docker 中，优先使用服务名；如果在本地开发，使用 localhost
        let backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8091';

        // 如果内部请求，将 https 转换为 http (如果是内网 IP 或 hostname)
        if (backendUrl.includes('.ts.net')) {
            // 如果是外部 Tailscale 地址，在容器内部可能需要直接连 fastapi 容器
            backendUrl = 'http://fastapi:8091';
        }

        const res = await fetch(`${backendUrl}/ai-resources/data`, {
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

        console.error('FastAPI backend error during GET');
        return NextResponse.json(
            { error: 'Failed to fetch data from backend' },
            { status: res.status }
        );
    } catch (error) {
        console.error('Failed to load AI resources from backend:', error);

        return NextResponse.json(
            { error: 'Backend service unavailable' },
            { status: 503 }
        );
    }
}
