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

        const extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp', '.gif'];
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

// 尝试下载单个 URL 并验证
async function tryDownload(id: string, url: string): Promise<{ success: boolean; path?: string; size?: number; error?: string }> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/*,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(6000)
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const contentType = response.headers.get('content-type') || '';

        // 拒绝 HTML/JSON 响应
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
            return { success: false, error: 'HTML response' };
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // 验证文件大小
        if (buffer.length < 100) {
            return { success: false, error: 'Too small' };
        }

        // 检查是否是 HTML
        const headerStr = buffer.slice(0, 100).toString('utf8').toLowerCase();
        if (headerStr.includes('<!doctype') || headerStr.includes('<html')) {
            return { success: false, error: 'HTML content' };
        }

        // 检测格式
        let ext = detectImageFormat(buffer);
        if (!ext) {
            if (contentType.includes('svg')) ext = '.svg';
            else if (contentType.includes('ico') || contentType.includes('icon')) ext = '.ico';
            else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
            else if (contentType.includes('webp')) ext = '.webp';
            else if (contentType.includes('gif')) ext = '.gif';
            else ext = '.png';
        }

        const filePath = path.join(LOGOS_DIR, `${id}${ext}`);
        fs.writeFileSync(filePath, buffer);

        return {
            success: true,
            path: `/ai-logos/${id}${ext}`,
            size: buffer.length
        };
    } catch {
        return { success: false, error: 'Network error' };
    }
}

// POST: 下载并保存logo（支持多来源备用）
export async function POST(request: NextRequest) {
    try {
        const { id, logoUrl, siteUrl } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        }

        ensureLogosDir();

        // 检查是否已存在有效文件
        const extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp', '.gif'];
        for (const ext of extensions) {
            const existingPath = path.join(LOGOS_DIR, `${id}${ext}`);
            if (fs.existsSync(existingPath)) {
                const stats = fs.statSync(existingPath);
                if (stats.size > 100) {
                    return NextResponse.json({
                        success: true,
                        path: `/ai-logos/${id}${ext}`,
                        cached: true
                    });
                } else {
                    fs.unlinkSync(existingPath);
                }
            }
        }

        // 提取域名
        let domain = '';
        if (siteUrl) {
            try {
                domain = new URL(siteUrl).hostname;
            } catch { /* ignore */ }
        }

        // 构建尝试的 URL 列表
        const urlsToTry: string[] = [];

        // 1. 使用 logoUrl（如果不是 github.com/favicon）
        if (logoUrl && !logoUrl.includes('github.com/favicon')) {
            urlsToTry.push(logoUrl);
        }

        // 2. GitHub 项目使用 OpenGraph 图片
        if (siteUrl && siteUrl.includes('github.com/')) {
            const match = siteUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (match) {
                urlsToTry.push(`https://opengraph.githubassets.com/1/${match[1]}/${match[2]}`);
            }
        }

        // 3. 网站常见 favicon 路径
        if (domain && !domain.includes('github.com')) {
            urlsToTry.push(`https://${domain}/favicon.ico`);
            urlsToTry.push(`https://${domain}/favicon.png`);
            urlsToTry.push(`https://${domain}/apple-touch-icon.png`);
        }

        // 4. 公共 favicon 服务
        if (domain) {
            urlsToTry.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
            urlsToTry.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
        }

        // 逐个尝试
        for (const url of urlsToTry) {
            const result = await tryDownload(id, url);
            if (result.success) {
                return NextResponse.json(result);
            }
        }

        return NextResponse.json({
            success: false,
            error: 'All sources failed'
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

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return '.png';
    }
    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return '.jpg';
    }
    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return '.gif';
    }
    // WebP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return '.webp';
    }
    // ICO
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
        return '.ico';
    }
    // SVG
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

        const extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp', '.gif'];
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
