import {toast} from 'sonner';

let cachedBaseUrl: string | null = null;
let missingEnvWarned = false;

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

export const getApiBaseUrl = (): string | null => {
    if (cachedBaseUrl) return cachedBaseUrl;
    const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
    if (!raw) {
        if (!missingEnvWarned) {
            toast.error('缺少环境变量 NEXT_PUBLIC_API_BASE_URL，请配置后重试');
            missingEnvWarned = true;
        }
        return null;
    }
    cachedBaseUrl = normalizeBaseUrl(raw);
    return cachedBaseUrl;
};

