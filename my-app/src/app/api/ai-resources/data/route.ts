import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { INITIAL_AI_RESOURCES } from '@/lib/ai-resources-data';

export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'ai-resources.json');

// 确保data目录存在
function ensureDataDir() {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// GET: 获取资源数据
export async function GET() {
    try {
        ensureDataDir();

        if (fs.existsSync(DATA_FILE)) {
            const content = fs.readFileSync(DATA_FILE, 'utf-8');
            const data = JSON.parse(content);
            return NextResponse.json(data, {
                headers: {
                    'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
                },
            });
        }

        // 如果文件不存在，返回初始数据并保存
        fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_AI_RESOURCES, null, 2));
        return NextResponse.json(INITIAL_AI_RESOURCES);
    } catch (error) {
        console.error('Failed to load AI resources:', error);
        return NextResponse.json(INITIAL_AI_RESOURCES);
    }
}
