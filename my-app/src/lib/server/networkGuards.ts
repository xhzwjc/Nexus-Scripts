import dns from 'dns/promises';
import net from 'net';

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'ip6-localhost',
    'ip6-loopback',
]);

function isBlockedIpv4(address: string): boolean {
    const parts = address.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }

    const [first, second, third] = parts;

    return first === 0
        || first === 10
        || first === 127
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168)
        || (first === 100 && second >= 64 && second <= 127)
        || (first === 198 && (second === 18 || second === 19))
        || (first === 192 && second === 0 && third === 0)
        || (first === 192 && second === 0 && third === 2)
        || (first === 198 && second === 51 && third === 100)
        || (first === 203 && second === 0 && third === 113)
        || first >= 224;
}

function isBlockedIpv6(address: string): boolean {
    const normalized = address.toLowerCase();

    if (normalized === '::' || normalized === '::1') {
        return true;
    }

    if (normalized.startsWith('::ffff:')) {
        return isBlockedIpAddress(normalized.slice(7));
    }

    return normalized.startsWith('fc')
        || normalized.startsWith('fd')
        || /^fe[89ab]/.test(normalized);
}

export function isBlockedIpAddress(address: string): boolean {
    const version = net.isIP(address);
    if (version === 4) {
        return isBlockedIpv4(address);
    }
    if (version === 6) {
        return isBlockedIpv6(address);
    }
    return true;
}

async function resolveAddresses(hostname: string): Promise<string[]> {
    const records = await dns.lookup(hostname, {
        all: true,
        verbatim: true,
    });

    return records.map((record) => record.address);
}

export async function validateExternalHttpUrl(
    urlString: string,
    options: { prependHttps?: boolean } = {},
): Promise<URL> {
    const trimmed = urlString.trim();
    const candidate = options.prependHttps && !/^https?:\/\//i.test(trimmed)
        ? `https://${trimmed}`
        : trimmed;

    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error('Unsupported URL');
    }

    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
        throw new Error('Blocked host');
    }

    const directIpVersion = net.isIP(hostname);
    if (directIpVersion > 0 && isBlockedIpAddress(hostname)) {
        throw new Error('Blocked host');
    }

    try {
        const resolvedAddresses = directIpVersion > 0 ? [hostname] : await resolveAddresses(hostname);
        if (resolvedAddresses.length === 0 || resolvedAddresses.some((address) => isBlockedIpAddress(address))) {
            throw new Error('Blocked host');
        }
    } catch (error) {
        if (error instanceof Error && error.message === 'Blocked host') {
            throw error;
        }
        throw new Error('Unable to resolve host');
    }

    return parsed;
}
