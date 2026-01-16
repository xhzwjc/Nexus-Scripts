import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'ai-logos');

// GET: 批量获取所有本地logo文件列表
export async function GET() {
    try {
        // 确保目录存在
        if (!fs.existsSync(LOGOS_DIR)) {
            fs.mkdirSync(LOGOS_DIR, { recursive: true });
            return NextResponse.json({ logos: {} });
        }

        // 读取目录下所有文件
        const files = fs.readdirSync(LOGOS_DIR);
        const logos: Record<string, string> = {};

        for (const file of files) {
            // 获取文件名（不含扩展名）作为ID
            const ext = path.extname(file);
            const id = path.basename(file, ext);
            // 存储路径
            logos[id] = `/ai-logos/${file}`;
        }

        return NextResponse.json({ logos });
    } catch (error) {
        console.error('Error listing logos:', error);
        return NextResponse.json({ logos: {} });
    }
}
