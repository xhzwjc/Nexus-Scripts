import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'ai-logos');

// 确保目录存在
function ensureLogosDir() {
    if (!fs.existsSync(LOGOS_DIR)) {
        fs.mkdirSync(LOGOS_DIR, { recursive: true });
    }
}

// GET: 检查本地logo是否存在，返回路径或空
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        }

        ensureLogosDir();

        // 检查各种可能的扩展名
        const extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp'];
        for (const ext of extensions) {
            const filePath = path.join(LOGOS_DIR, `${id}${ext}`);
            if (fs.existsSync(filePath)) {
                return NextResponse.json({
                    exists: true,
                    path: `/ai-logos/${id}${ext}`
                });
            }
        }

        return NextResponse.json({ exists: false });
    } catch (error) {
        console.error('Error checking logo:', error);
        return NextResponse.json({ exists: false });
    }
}

// POST: 下载并保存logo到本地
export async function POST(request: NextRequest) {
    try {
        const { id, logoUrl } = await request.json();

        if (!id || !logoUrl) {
            return NextResponse.json({ error: 'Missing id or logoUrl' }, { status: 400 });
        }

        ensureLogosDir();

        // 先检查是否已存在
        const extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp'];
        for (const ext of extensions) {
            const existingPath = path.join(LOGOS_DIR, `${id}${ext}`);
            if (fs.existsSync(existingPath)) {
                return NextResponse.json({
                    success: true,
                    path: `/ai-logos/${id}${ext}`,
                    cached: true
                });
            }
        }

        // 下载logo（5秒超时）
        const response = await fetch(logoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: `Failed to fetch: ${response.status}`
            });
        }

        const contentType = response.headers.get('content-type') || '';
        let ext = '.png';
        if (contentType.includes('svg')) ext = '.svg';
        else if (contentType.includes('ico')) ext = '.ico';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
        else if (contentType.includes('webp')) ext = '.webp';

        const buffer = Buffer.from(await response.arrayBuffer());
        const filePath = path.join(LOGOS_DIR, `${id}${ext}`);

        fs.writeFileSync(filePath, buffer);

        return NextResponse.json({
            success: true,
            path: `/ai-logos/${id}${ext}`
        });
    } catch (error) {
        // 下载失败，静默返回失败状态
        return NextResponse.json({
            success: false,
            error: String(error)
        });
    }
}


