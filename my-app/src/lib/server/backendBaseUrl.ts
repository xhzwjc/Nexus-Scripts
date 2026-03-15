function normalizeBaseUrl(url: string) {
    return url.replace(/\/+$/, '');
}

export function getBackendBaseUrl() {
    const internalBase = process.env.BACKEND_INTERNAL_BASE_URL?.trim();
    if (internalBase) {
        return normalizeBaseUrl(internalBase);
    }

    const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
    if (publicBase && /^https?:\/\//i.test(publicBase)) {
        return normalizeBaseUrl(publicBase);
    }

    const fallback = process.env.NODE_ENV === 'development'
        ? 'http://127.0.0.1:8000'
        : 'http://127.0.0.1:8091';

    return fallback;
}
