import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'team-resources.enc.json');

export async function POST(request: Request) {
    try {
        const { encrypted } = await request.json();

        if (!encrypted) {
            return NextResponse.json({ error: 'No data provided' }, { status: 400 });
        }

        // 确保目录存在
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 写入加密数据
        fs.writeFileSync(DATA_FILE, encrypted, 'utf-8');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to save team resources:', error);
        return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
    }
}
