import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

// 强制动态路由，阻止 Next.js 在构建时尝试执行此文件收集静态数据
export const dynamic = 'force-dynamic';

const MAX_EXTRACTED_TEXT_LENGTH = 100_000;

function trimExtractedText(text: string): string {
    if (text.length <= MAX_EXTRACTED_TEXT_LENGTH) {
        return text;
    }

    return `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[附件文本过长，已自动截断]`;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = file.name.toLowerCase();
        let text = '';

        if (fileName.endsWith('.pdf')) {
            // 运行时延迟加载，避免构建阶段触发 pdf-parse 的 DOMMatrix 依赖
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdf = require('pdf-parse');
            const data = await pdf(buffer);
            text = data.text;
        } else if (fileName.endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        } else if (fileName.endsWith('.xlsx')) {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            workbook.SheetNames.forEach((sheetName: string) => {
                const sheet = workbook.Sheets[sheetName];
                text += `${xlsx.utils.sheet_to_csv(sheet)}\n`;
            });
        } else {
            text = buffer.toString('utf-8');
        }

        return NextResponse.json({ text: trimExtractedText(text) });
    } catch (error: unknown) {
        console.error('File extraction error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errorMessage || 'Extraction failed' }, { status: 500 });
    }
}
