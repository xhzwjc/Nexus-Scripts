import crypto from 'crypto';
import { NextResponse } from 'next/server';

import type { User } from '@/lib/types';

const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SESSION_SECRET = 'script-hub-dev-session-secret-change-me';

interface SessionUser extends User {
    id: string;
}

export interface SessionPayload extends SessionUser {
    iat: number;
    exp: number;
}

type AccessConfig = Record<string, SessionUser>;

function getSessionSecret() {
    const configured = process.env.SCRIPT_HUB_SESSION_SECRET?.trim();
    if (configured) {
        return configured;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing SCRIPT_HUB_SESSION_SECRET configuration');
    }

    return DEFAULT_SESSION_SECRET;
}

function getSessionTtlMs() {
    const raw = Number(process.env.SCRIPT_HUB_SESSION_TTL_MS || DEFAULT_SESSION_TTL_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL_MS;
}

function base64UrlEncode(value: string | Buffer) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signSegment(segment: string) {
    return base64UrlEncode(
        crypto.createHmac('sha256', getSessionSecret()).update(segment).digest(),
    );
}

function parseAccessConfigFromEnv(raw?: string): AccessConfig | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, SessionUser>;
        return Object.entries(parsed).reduce<AccessConfig>((acc, [key, value]) => {
            if (!value || typeof value !== 'object' || !value.id || !value.role || !value.permissions) {
                return acc;
            }

            acc[key] = {
                id: String(value.id),
                role: value.role,
                name: value.name,
                permissions: value.permissions,
                teamResourcesLoginKeyEnabled: value.teamResourcesLoginKeyEnabled,
            };
            return acc;
        }, {});
    } catch {
        return null;
    }
}

function getAccessConfig(): AccessConfig {
    const config = parseAccessConfigFromEnv(process.env.SCRIPT_HUB_ACCESS_KEYS_JSON);
    if (!config || Object.keys(config).length === 0) {
        throw new Error('Missing SCRIPT_HUB_ACCESS_KEYS_JSON configuration');
    }
    return config;
}

export function authenticateAccessKey(key: string): SessionUser | null {
    if (!key) {
        return null;
    }

    const config = getAccessConfig();
    return config[key] || null;
}

export function createScriptHubSession(user: SessionUser) {
    const now = Date.now();
    const payload: SessionPayload = {
        ...user,
        iat: now,
        exp: now + getSessionTtlMs(),
    };

    const payloadSegment = base64UrlEncode(JSON.stringify(payload));
    const signature = signSegment(payloadSegment);

    return {
        token: `${payloadSegment}.${signature}`,
        user,
        expiresAt: payload.exp,
    };
}

export function verifyScriptHubSession(token: string): SessionPayload | null {
    const [payloadSegment, signature] = token.split('.');
    if (!payloadSegment || !signature) {
        return null;
    }

    const expectedSignature = signSegment(payloadSegment);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return null;
    }

    try {
        const payload = JSON.parse(base64UrlDecode(payloadSegment)) as SessionPayload;
        if (!payload || typeof payload !== 'object' || typeof payload.exp !== 'number') {
            return null;
        }

        if (Date.now() > payload.exp) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

export function getSessionTokenFromRequest(request: Request) {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return null;
    }

    return authorization.slice('Bearer '.length).trim();
}

export function requireScriptHubPermission(request: Request, permission?: string) {
    const token = getSessionTokenFromRequest(request);
    if (!token) {
        return {
            response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        };
    }

    const session = verifyScriptHubSession(token);
    if (!session) {
        return {
            response: NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 }),
        };
    }

    if (permission && !session.permissions?.[permission]) {
        return {
            response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        };
    }

    return { session };
}
