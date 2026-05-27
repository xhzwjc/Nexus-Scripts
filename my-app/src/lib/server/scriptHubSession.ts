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

const LEGACY_RECRUITMENT_VIEW_PERMISSIONS = [
    'recruitment-dashboard-view',
    'recruitment-position-manage',
    'recruitment-candidate-manage',
    'recruitment-process-execute',
    'recruitment-log-view',
    'recruitment-review-view',
    'recruitment-interview-view',
    'recruitment-skill-view',
    'recruitment-skill-bind',
    'recruitment-mail-view',
    'recruitment-mail-send',
];

const LEGACY_RECRUITMENT_MANAGE_PERMISSIONS = [
    'recruitment-skill-manage',
    'recruitment-review-act',
    'recruitment-review-manage',
    'recruitment-interview-act',
    'recruitment-interview-manage',
    'recruitment-mail-config-manage',
    'recruitment-mail-sender-manage',
    'recruitment-llm-config-view',
    'recruitment-llm-config-manage',
    'resource-sharing-manage',
];

function expandPermissionAliases(permissions: User['permissions'] = {}) {
    const expanded: User['permissions'] = { ...permissions };

    if (expanded['ai-recruitment']) {
        LEGACY_RECRUITMENT_VIEW_PERMISSIONS.forEach((key) => {
            expanded[key] = true;
        });
    }

    if (expanded['ai-recruitment-manage']) {
        expanded['ai-recruitment'] = true;
        [...LEGACY_RECRUITMENT_VIEW_PERMISSIONS, ...LEGACY_RECRUITMENT_MANAGE_PERMISSIONS].forEach((key) => {
            expanded[key] = true;
        });
    }

    if ([...LEGACY_RECRUITMENT_VIEW_PERMISSIONS, ...LEGACY_RECRUITMENT_MANAGE_PERMISSIONS].some((key) => expanded[key])) {
        expanded['ai-recruitment'] = true;
    }

    if (LEGACY_RECRUITMENT_MANAGE_PERMISSIONS.some((key) => expanded[key])) {
        expanded['ai-recruitment-manage'] = true;
    }

    if (expanded['rbac-manage']) {
        expanded['audit-log-view'] = true;
    }

    return expanded;
}

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

    const permissions = expandPermissionAliases(session.permissions);
    if (permission && !permissions[permission]) {
        return {
            response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        };
    }

    return { session };
}

export function requireScriptHubAnyPermission(request: Request, permissions: string[]) {
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

    const expandedPermissions = expandPermissionAliases(session.permissions);
    if (!permissions.some((permission) => expandedPermissions[permission])) {
        return {
            response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        };
    }

    return { session };
}
