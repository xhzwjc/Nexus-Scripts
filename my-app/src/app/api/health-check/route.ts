import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';
import tls from 'tls';

import { validateExternalHttpUrl } from '@/lib/server/networkGuards';
import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

export const dynamic = 'force-dynamic';

export interface HealthCheckResult {
    url: string;
    accessible: boolean;
    statusCode?: number;
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

function detectSoftHttpError(body: string): string | null {
    const normalized = body.toLowerCase().replace(/\s+/g, ' ').trim();
    const softErrorPatterns: Array<{ regex: RegExp; label: string }> = [
        { regex: /<title>\s*404[^<]*<\/title>/i, label: '404' },
        { regex: /<h1>\s*404[^<]*<\/h1>/i, label: '404' },
        { regex: /<title>\s*403[^<]*<\/title>/i, label: '403' },
        { regex: /<h1>\s*403[^<]*<\/h1>/i, label: '403' },
        { regex: /<title>\s*500[^<]*<\/title>/i, label: '500' },
        { regex: /<h1>\s*500[^<]*<\/h1>/i, label: '500' },
        { regex: /<title>\s*502[^<]*<\/title>/i, label: '502' },
        { regex: /<h1>\s*502[^<]*<\/h1>/i, label: '502' },
        { regex: /<title>\s*503[^<]*<\/title>/i, label: '503' },
        { regex: /<h1>\s*503[^<]*<\/h1>/i, label: '503' },
    ];

    for (const pattern of softErrorPatterns) {
        if (pattern.regex.test(normalized)) {
            return pattern.label;
        }
    }

    return null;
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

            socket.setTimeout(8000, () => {
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
function checkAccessibility(urlString: string): Promise<{ accessible: boolean; statusCode?: number; responseTime: number; error?: string }> {
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
                timeout: 8000,
                rejectUnauthorized: false,
                headers: {
                    'User-Agent': 'Mozilla/5.0 HealthCheck/1.0'
                },
                // Force specific agent to bypass global proxy agents
                agent: isHttps ? new https.Agent({ keepAlive: false }) : new http.Agent({ keepAlive: false })
            };

            const req = lib.request(options, (res: NodeJS.ReadableStream & { statusCode?: number }) => {
                const responseTime = Date.now() - startTime;
                const statusCode = res.statusCode || 0;
                const chunks: Buffer[] = [];
                let receivedLength = 0;
                const maxInspectLength = 4096;

                res.on('data', (chunk: Buffer | string) => {
                    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    if (receivedLength < maxInspectLength) {
                        const remaining = maxInspectLength - receivedLength;
                        chunks.push(bufferChunk.subarray(0, remaining));
                    }
                    receivedLength += bufferChunk.length;
                });

                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf8');
                    const softHttpError = statusCode >= 200 && statusCode < 400 ? detectSoftHttpError(body) : null;
                    const accessible = statusCode >= 200 && statusCode < 400 && !softHttpError;

                    resolve({
                        accessible,
                        statusCode,
                        responseTime,
                        error: softHttpError ? `Soft HTTP error page: ${softHttpError}` : undefined,
                    });
                });
            });

            req.on('error', (err: Error) => {
                resolve({ accessible: false, responseTime: Date.now() - startTime, error: err.message });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ accessible: false, responseTime: Date.now() - startTime, error: 'Timeout' });
            });

            req.setTimeout(8000, () => {
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
    const auth = requireScriptHubPermission(request, 'cert-health');
    if ('response' in auth) {
        return auth.response;
    }

    try {
        const { url } = await request.json();

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        const parsedUrl = await validateExternalHttpUrl(url, { prependHttps: true });

        // 并行检查SSL和可访问性
        const [sslResult, accessResult] = await Promise.all([
            checkSSL(parsedUrl.toString()),
            checkAccessibility(parsedUrl.toString()),
        ]);

        const result: HealthCheckResult = {
            url: parsedUrl.toString(),
            accessible: accessResult.accessible,
            statusCode: accessResult.statusCode,
            responseTime: accessResult.responseTime,
            ssl: sslResult,
            error: accessResult.error,
            checkedAt: new Date().toISOString(),
        };

        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof Error && ['Unsupported URL', 'Blocked host', 'Unable to resolve host'].includes(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json(
            { error: 'Health check failed: ' + (error as Error).message },
            { status: 500 }
        );
    }
}
