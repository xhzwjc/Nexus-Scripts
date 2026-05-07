import type { User } from './types';

const AUTH_STORAGE_KEY = 'scriptHubAuth';

export interface ScriptHubSession {
    token: string;
    user: User;
    expiresAt: number;
}

type SessionResponse = ScriptHubSession | { error?: string };

export function getStoredScriptHubSession(): ScriptHubSession | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<ScriptHubSession>;
        if (!parsed.token || !parsed.user || typeof parsed.expiresAt !== 'number') {
            return null;
        }

        return {
            token: parsed.token,
            user: parsed.user,
            expiresAt: parsed.expiresAt,
        };
    } catch {
        return null;
    }
}

export function persistScriptHubSession(session: ScriptHubSession) {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearScriptHubSession() {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getScriptHubAuthHeaders(init?: HeadersInit): Headers {
    const headers = new Headers(init);
    const session = getStoredScriptHubSession();

    if (session?.token) {
        headers.set('Authorization', `Bearer ${session.token}`);
    }

    return headers;
}

export function getScriptHubAuthHeaderRecord(init?: HeadersInit): Record<string, string> {
    return Object.fromEntries(getScriptHubAuthHeaders(init).entries());
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = getScriptHubAuthHeaders(init.headers);
    return fetch(input, {
        ...init,
        headers,
    });
}

export class AuthError extends Error {
    constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'AuthError';
    }
}

export async function requestScriptHubSession(key: string): Promise<ScriptHubSession> {
    let response: Response;
    try {
        response = await fetch('/api/auth/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key }),
        });
    } catch {
        throw new AuthError('Network error', 0);
    }

    let data: SessionResponse;
    try {
        data = await response.json() as SessionResponse;
    } catch {
        throw new AuthError('Server error', response.status);
    }

    if (!response.ok || 'error' in data || !('token' in data)) {
        throw new AuthError(('error' in data && data.error) || 'Authentication failed', response.status);
    }

    return data;
}

export async function validateStoredScriptHubSession(): Promise<ScriptHubSession | null> {
    const session = getStoredScriptHubSession();
    if (!session) {
        return null;
    }

    if (Date.now() > session.expiresAt) {
        clearScriptHubSession();
        return null;
    }

    try {
        const response = await fetch('/api/auth/session', {
            method: 'GET',
            headers: getScriptHubAuthHeaders(),
        });

        if (!response.ok) {
            clearScriptHubSession();
            return null;
        }

        const data = await response.json() as SessionResponse;
        if ('error' in data || !('token' in data)) {
            clearScriptHubSession();
            return null;
        }

        persistScriptHubSession(data);
        return data;
    } catch {
        return session;
    }
}
