import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'team-resources.enc.json');

export async function GET() {
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
