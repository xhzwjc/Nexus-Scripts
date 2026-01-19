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

// POST: 下载并保存logo到本地（带验证）
export async function POST(request: NextRequest) {
    try {
        const { id, logoUrl } = await request.json();

        if (!id || !logoUrl) {
            return NextResponse.json({ error: 'Missing id or logoUrl' }, { status: 400 });
        }

        ensureLogosDir();

        // 先检查是否已存在
        const extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp', '.gif'];
        for (const ext of extensions) {
            const existingPath = path.join(LOGOS_DIR, `${id}${ext}`);
            if (fs.existsSync(existingPath)) {
                // 检查已存在文件是否有效（大于100字节）
                const stats = fs.statSync(existingPath);
                if (stats.size > 100) {
                    return NextResponse.json({
                        success: true,
                        path: `/ai-logos/${id}${ext}`,
                        cached: true
                    });
                } else {
                    // 删除无效的旧文件
                    fs.unlinkSync(existingPath);
                }
            }
        }

        // 下载logo（8秒超时，增加一点时间）
        const response = await fetch(logoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: `HTTP ${response.status}`
            });
        }

        const contentType = response.headers.get('content-type') || '';

        // 验证 Content-Type 是图片
        const isImageType = contentType.includes('image') ||
            contentType.includes('icon') ||
            contentType.includes('svg');

        if (!isImageType && !contentType.includes('octet-stream')) {
            // 如果明确不是图片类型（例如 text/html），跳过
            if (contentType.includes('text/html') || contentType.includes('application/json')) {
                return NextResponse.json({
                    success: false,
                    error: `Invalid content-type: ${contentType}`
                });
            }
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // 验证文件大小（至少100字节，过小通常是空白或错误）
        if (buffer.length < 100) {
            return NextResponse.json({
                success: false,
                error: `File too small: ${buffer.length} bytes`
            });
        }

        // 检查是否是 HTML 响应（很多网站返回 HTML 错误页而不是 404）
        const headerStr = buffer.slice(0, 100).toString('utf8').toLowerCase();
        if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('<head')) {
            return NextResponse.json({
                success: false,
                error: 'Response is HTML, not image'
            });
        }

        // 根据文件魔术字节检测真实格式
        let ext = detectImageFormat(buffer);

        // 如果无法检测格式，使用 content-type
        if (!ext) {
            if (contentType.includes('svg')) ext = '.svg';
            else if (contentType.includes('ico') || contentType.includes('icon')) ext = '.ico';
            else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
            else if (contentType.includes('webp')) ext = '.webp';
            else if (contentType.includes('gif')) ext = '.gif';
            else ext = '.png'; // 默认
        }

        const filePath = path.join(LOGOS_DIR, `${id}${ext}`);
        fs.writeFileSync(filePath, buffer);

        return NextResponse.json({
            success: true,
            path: `/ai-logos/${id}${ext}`,
            size: buffer.length
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: String(error)
        });
    }
}

// 根据文件头魔术字节检测图片格式
function detectImageFormat(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return '.png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return '.jpg';
    }
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return '.gif';
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return '.webp';
    }
    // ICO: 00 00 01 00
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
        return '.ico';
    }
    // SVG: 检查是否包含 <svg
    const str = buffer.slice(0, 200).toString('utf8');
    if (str.includes('<svg') || str.includes('<?xml')) {
        return '.svg';
    }

    return null;
}

// DELETE: 删除本地logo
export async function DELETE(request: NextRequest) {
    try {
        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        }

        ensureLogosDir();

        // 查找并删除匹配的文件
        const extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp'];
        let deleted = false;

        for (const ext of extensions) {
            const filePath = path.join(LOGOS_DIR, `${id}${ext}`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deleted = true;
                break;
            }
        }

        return NextResponse.json({ success: deleted });
    } catch (error) {
        console.error('Error deleting logo:', error);
        return NextResponse.json({ success: false, error: String(error) });
    }
}
