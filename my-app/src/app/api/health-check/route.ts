import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';
import tls from 'tls';
import { URL } from 'url';

export const dynamic = 'force-dynamic';

export interface HealthCheckResult {
    url: string;
    accessible: boolean;
    responseTime: number;
    ssl: {
        valid: boolean;
        issuer?: string;
        validFrom?: string;
        validTo?: string;
        daysRemaining?: number;
        error?: string;
    } | null;
    error?: string;
    checkedAt: string;
}

// 使用TLS直接获取SSL证书信息 - 更可靠
function checkSSL(urlString: string): Promise<HealthCheckResult['ssl']> {
    return new Promise((resolve) => {
        try {
            const url = new URL(urlString);

            // 只有HTTPS才检查证书
            if (url.protocol !== 'https:') {
                resolve({ valid: true, error: 'Not HTTPS' });
                return;
            }

            const port = parseInt(url.port) || 443;

            const socket = tls.connect({
                host: url.hostname,
                port: port,
                rejectUnauthorized: false, // 允许自签名和过期证书
                servername: url.hostname, // SNI
            }, () => {
                try {
                    const cert = socket.getPeerCertificate();

                    if (!cert || Object.keys(cert).length === 0) {
                        socket.destroy();
                        resolve({ valid: true, error: 'No certificate' });
                        return;
                    }

                    const validFrom = new Date(cert.valid_from);
                    const validTo = new Date(cert.valid_to);
                    const now = new Date();
                    const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    const isValid = now >= validFrom && now <= validTo;

                    socket.destroy();
                    resolve({
                        valid: isValid,
                        issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
                        validFrom: validFrom.toISOString(),
                        validTo: validTo.toISOString(),
                        daysRemaining: daysRemaining,
                    });
                } catch (err) {
                    socket.destroy();
                    resolve({ valid: true, error: (err as Error).message });
                }
            });

            socket.setTimeout(5000, () => {
                socket.destroy();
                resolve({ valid: true, error: 'Timeout' });
            });

            socket.on('error', (err) => {
                socket.destroy();
                resolve({ valid: true, error: err.message });
            });

        } catch (err) {
            resolve({ valid: true, error: (err as Error).message });
        }
    });
}

// 检查网站可访问性
function checkAccessibility(urlString: string): Promise<{ accessible: boolean; responseTime: number; error?: string }> {
    return new Promise((resolve) => {
        const startTime = Date.now();

        try {
            const url = new URL(urlString);
            const isHttps = url.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname || '/',
                method: 'GET',
                timeout: 5000,
                rejectUnauthorized: false,
                headers: {
                    'User-Agent': 'Mozilla/5.0 HealthCheck/1.0'
                },
                // Force specific agent to bypass global proxy agents
                agent: isHttps ? new https.Agent({ keepAlive: false }) : new http.Agent({ keepAlive: false })
            };

            const req = lib.request(options, (res: { statusCode?: number }) => {
                const responseTime = Date.now() - startTime;
                const statusCode = res.statusCode || 0;
                // 2xx, 3xx, 4xx 都算可访问（服务器有响应）
                const accessible = statusCode >= 200 && statusCode < 500;

                // 消费响应数据
                (res as NodeJS.ReadableStream).resume?.();

                resolve({ accessible, responseTime });
            });

            req.on('error', (err: Error) => {
                resolve({ accessible: false, responseTime: Date.now() - startTime, error: err.message });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ accessible: false, responseTime: Date.now() - startTime, error: 'Timeout' });
            });

            req.setTimeout(5000, () => {
                req.destroy();
                resolve({ accessible: false, responseTime: Date.now() - startTime, error: 'Socket timeout' });
            });

            req.end();
        } catch (err) {
            resolve({ accessible: false, responseTime: Date.now() - startTime, error: (err as Error).message });
        }
    });
}

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // 确保URL有协议
        let fullUrl = url.trim();
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            fullUrl = 'https://' + fullUrl;
        }

        // 并行检查SSL和可访问性
        const [sslResult, accessResult] = await Promise.all([
            checkSSL(fullUrl),
            checkAccessibility(fullUrl),
        ]);

        const result: HealthCheckResult = {
            url: fullUrl,
            accessible: accessResult.accessible,
            responseTime: accessResult.responseTime,
            ssl: sslResult,
            error: accessResult.error,
            checkedAt: new Date().toISOString(),
        };

        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json(
            { error: 'Health check failed: ' + (error as Error).message },
            { status: 500 }
        );
    }
}
