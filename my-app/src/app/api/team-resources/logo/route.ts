import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'team-logos');

// 确保目录存在
function ensureDir() {
    if (!fs.existsSync(LOGOS_DIR)) {
        fs.mkdirSync(LOGOS_DIR, { recursive: true });
    }
}

// POST: 上传 Logo (Base64 -> WebP 文件)
export async function POST(request: NextRequest) {
    try {
        ensureDir();

        const { groupId, base64 } = await request.json();

        if (!groupId || !base64) {
            return NextResponse.json({ error: 'Missing groupId or base64' }, { status: 400 });
        }

        // 提取 Base64 数据部分 (去掉 data:image/xxx;base64, 前缀)
        const matches = base64.match(/^data:image\/\w+;base64,(.+)$/);
        if (!matches) {
            return NextResponse.json({ error: 'Invalid base64 format' }, { status: 400 });
        }

        const imageBuffer = Buffer.from(matches[1], 'base64');
        const outputPath = path.join(LOGOS_DIR, `${groupId}.webp`);

        // 转换为 WebP 并保存
        await sharp(imageBuffer)
            .webp({ quality: 85 })
            .toFile(outputPath);

        const logoUrl = `/team-logos/${groupId}.webp`;

        return NextResponse.json({
            success: true,
            logoUrl,
            message: 'Logo uploaded successfully'
        });
    } catch (error) {
        console.error('Failed to upload logo:', error);
        return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
    }
}

// DELETE: 删除 Logo
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const groupId = searchParams.get('groupId');

        if (!groupId) {
            return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });
        }

        const logoPath = path.join(LOGOS_DIR, `${groupId}.webp`);

        if (fs.existsSync(logoPath)) {
            fs.unlinkSync(logoPath);
        }

        return NextResponse.json({
            success: true,
            message: 'Logo deleted successfully'
        });
    } catch (error) {
        console.error('Failed to delete logo:', error);
        return NextResponse.json({ error: 'Failed to delete logo' }, { status: 500 });
    }
}
