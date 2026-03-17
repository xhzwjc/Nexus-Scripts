import axios, { type AxiosRequestConfig } from 'axios';
import { NextRequest, NextResponse } from 'next/server';

import { requireScriptHubPermission } from '@/lib/server/scriptHubSession';

export const runtime = 'nodejs';

type UploadedFileRef = {
    name: string;
    mimeType: string;
    fileUri: string;
};

type AgentMessagePart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file_data'; file_data: { file_uri: string; mime_type: string } };

type AgentMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string | AgentMessagePart[];
};

type GeminiGenerationConfig = {
    candidateCount: number;
    responseMimeType: 'text/plain';
    maxOutputTokens: number;
    temperature: number;
    topP: number;
};

const DEFAULT_GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_GEMINI_TIMEOUT_MS = 60_000;
const DOCUMENT_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const DOCUMENT_MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-pro']);
const INLINE_TEXT_LIMIT = 100_000;
const GEMINI_FILE_READY_TIMEOUT_MS = 90_000;
const GEMINI_FILE_READY_POLL_INTERVAL_MS = 800;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.5;
const DOCUMENT_TEMPERATURE = 0.2;
const RESUME_ATTACHMENT_SYSTEM_INSTRUCTION = '当前请求已经包含候选人简历附件或简历内容。请直接执行模块一【简历初筛】并输出完整报告。不要复述规则，不要输出“我已阅读并理解所有规则”“我已准备就绪，请发送简历”“请上传简历”等等待性回复。';

class AgentApiError extends Error {
    status: number;
    retryAfterSeconds?: number;

    constructor(status: number, message: string, retryAfterSeconds?: number) {
        super(message);
        this.name = 'AgentApiError';
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

function getApiKey(): string | null {
    return process.env.GEMINI_API_KEY
        || process.env.GOOGLE_API_KEY
        || process.env.GOOGLE_AI_STUDIO_API_KEY
        || process.env.AI_API_KEY
        || null;
}

function getGeminiBaseUrl(): string {
    return (process.env.GEMINI_API_BASE || DEFAULT_GEMINI_API_BASE).replace(/\/+$/, '');
}

function getGeminiTimeoutMs(): number {
    const value = Number(process.env.GEMINI_TIMEOUT_MS || DEFAULT_GEMINI_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_GEMINI_TIMEOUT_MS;
}
function getGeminiProxyConfig(): Pick<AxiosRequestConfig, 'proxy'> {
    const proxyUrl = process.env.GEMINI_PROXY_URL
        || process.env.HTTPS_PROXY
        || process.env.HTTP_PROXY
        || '';

    if (!proxyUrl) {
        return {};
    }

    try {
        const parsed = new URL(proxyUrl);
        const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
        return {
            proxy: {
                protocol: parsed.protocol.replace(':', ''),
                host: parsed.hostname,
                port,
                auth: parsed.username
                    ? {
                        username: decodeURIComponent(parsed.username),
                        password: decodeURIComponent(parsed.password),
                    }
                    : undefined,
            },
        };
    } catch {
        return {};
    }
}

function inferMimeType(file: File): string {
    if (file.type) {
        return file.type;
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.pdf')) return 'application/pdf';
    if (fileName.endsWith('.txt')) return 'text/plain';
    if (fileName.endsWith('.md')) return 'text/markdown';
    if (fileName.endsWith('.json')) return 'application/json';
    if (fileName.endsWith('.csv')) return 'text/csv';
    return 'application/octet-stream';
}

function isPdfMime(mimeType: string, fileName = ''): boolean {
    return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

function isTextLikeMime(mimeType: string, fileName = ''): boolean {
    if (mimeType.startsWith('text/')) {
        return true;
    }

    const lowerName = fileName.toLowerCase();
    return lowerName.endsWith('.md')
        || lowerName.endsWith('.json')
        || lowerName.endsWith('.csv')
        || lowerName.endsWith('.txt');
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) {
        return null;
    }

    return {
        mimeType: match[1] || 'application/octet-stream',
        data: match[2],
    };
}

function extractTextFromResponse(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
        return '';
    }

    const firstCandidate = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
    const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];

    return parts
        .map((part) => typeof part?.text === 'string' ? part.text : '')
        .join('');
}

function buildGenerationConfig(hasDocumentContext: boolean): GeminiGenerationConfig {
    return {
        candidateCount: 1,
        responseMimeType: 'text/plain',
        maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: hasDocumentContext ? DOCUMENT_TEMPERATURE : DEFAULT_TEMPERATURE,
        topP: hasDocumentContext ? 0.8 : 0.95,
    };
}

function normalizeMessages(messages: unknown): AgentMessage[] {
    if (!Array.isArray(messages)) {
        return [];
    }

    return messages.filter((message): message is AgentMessage => {
        return !!message && typeof message === 'object' && typeof (message as AgentMessage).role === 'string';
    });
}

function messageContentToText(content: AgentMessage['content']): string {
    if (typeof content === 'string') {
        return content;
    }

    return content
        .filter((part): part is Extract<AgentMessagePart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
}

function isResumeScreeningConversation(messages: AgentMessage[]): boolean {
    return messages.some((message) => {
        if (message.role !== 'system') {
            return false;
        }

        const text = messageContentToText(message.content);
        return text.includes('模块一：简历初筛') && text.includes('招聘助手');
    });
}

function historyContainsPdf(messages: AgentMessage[]): boolean {
    return messages.some((message) => {
        if (!Array.isArray(message.content)) {
            return false;
        }

        return message.content.some((part) => {
            return part.type === 'file_data'
                && isPdfMime(part.file_data.mime_type, part.file_data.file_uri);
        });
    });
}

function trimInlineText(text: string): string {
    if (text.length <= INLINE_TEXT_LIMIT) {
        return text;
    }

    return `${text.slice(0, INLINE_TEXT_LIMIT)}\n\n[附件文本过长，已截断]`;
}

function toErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        if (typeof error.response?.data === 'string' && error.response.data.trim()) {
            return error.response.data;
        }

        if (error.message) {
            return error.message;
        }
    }

    return error instanceof Error ? error.message : 'Unknown error';
}

function parseRetryAfterSeconds(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.ceil(value);
    }

    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)s$/i);
    if (match) {
        return Math.ceil(Number(match[1]));
    }

    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) && asNumber > 0 ? Math.ceil(asNumber) : undefined;
}

function parseGeminiErrorPayload(errorText: string): {
    message?: string;
    status?: string;
    retryAfterSeconds?: number;
    quotaModel?: string;
} {
    try {
        const parsed = JSON.parse(errorText) as {
            error?: {
                message?: string;
                status?: string;
                details?: Array<{
                    ['@type']?: string;
                    retryDelay?: string;
                    violations?: Array<{
                        quotaDimensions?: {
                            model?: string;
                        };
                    }>;
                }>;
            };
        };

        const details = Array.isArray(parsed.error?.details) ? parsed.error?.details : [];
        let retryAfterSeconds: number | undefined;
        let quotaModel: string | undefined;

        for (const detail of details) {
            const typeName = detail?.['@type'] || '';
            if (!retryAfterSeconds && typeName.includes('RetryInfo')) {
                retryAfterSeconds = parseRetryAfterSeconds(detail.retryDelay);
            }

            if (!quotaModel && typeName.includes('QuotaFailure')) {
                quotaModel = detail.violations?.find((violation) => violation?.quotaDimensions?.model)?.quotaDimensions?.model;
            }
        }

        return {
            message: parsed.error?.message,
            status: parsed.error?.status,
            retryAfterSeconds,
            quotaModel,
        };
    } catch {
        return {};
    }
}

function buildGeminiApiError(status: number, errorText: string, effectiveModel: string): AgentApiError {
    const parsed = parseGeminiErrorPayload(errorText);

    if (status === 429) {
        const quotaModel = parsed.quotaModel || effectiveModel;
        const retryText = parsed.retryAfterSeconds
            ? `请约 ${parsed.retryAfterSeconds} 秒后再试。`
            : '请稍后再试。';
        const nextStep = effectiveModel === 'gemini-2.5-flash'
            ? `我已将系统兜底模型设为 ${DOCUMENT_FALLBACK_MODEL}，刷新页面后也会默认优先使用它。`
            : '如果频繁出现，请检查 AI Studio 项目额度、计费和模型选择。';

        return new AgentApiError(
            429,
            `当前模型 ${quotaModel} 的 Gemini 配额已用尽。${retryText}${nextStep}`,
            parsed.retryAfterSeconds,
        );
    }

    const detail = parsed.message || errorText;
    return new AgentApiError(status, `Gemini API error: ${status} - ${detail}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapGeminiFile(payload: unknown): { name?: string; uri?: string; state?: unknown } {
    if (!payload || typeof payload !== 'object') {
        return {};
    }

    const root = payload as {
        file?: { name?: string; uri?: string; state?: unknown };
        name?: string;
        uri?: string;
        state?: unknown;
    };
    const file = root.file && typeof root.file === 'object' ? root.file : root;
    return {
        name: file.name,
        uri: file.uri,
        state: file.state,
    };
}

function getGeminiFileStateName(state: unknown): string {
    if (typeof state === 'string') {
        return state.toUpperCase();
    }

    if (state && typeof state === 'object' && typeof (state as { name?: unknown }).name === 'string') {
        return ((state as { name: string }).name).toUpperCase();
    }

    return '';
}

async function waitForGeminiFileActive(resourceName: string, apiKey: string, baseUrl: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + Math.min(Math.max(timeoutMs, 5_000), GEMINI_FILE_READY_TIMEOUT_MS);

    while (true) {
        let response;
        try {
            response = await axios.get(`${baseUrl}/v1beta/${resourceName}`, {
                headers: {
                    'x-goog-api-key': apiKey,
                },
                timeout: timeoutMs,
                validateStatus: () => true,
                ...getGeminiProxyConfig(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });
        } catch (error) {
            throw buildConnectivityError('查询文件状态', baseUrl, error);
        }

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`查询文件状态失败: ${typeof response.data === 'string' ? response.data : JSON.stringify(response.data)}`);
        }

        const fileState = getGeminiFileStateName(unwrapGeminiFile(response.data).state);
        if (!fileState || fileState === 'ACTIVE') {
            return;
        }

        if (fileState === 'FAILED' || fileState === 'ERROR') {
            throw new Error('文件已上传，但 Gemini 处理该文件失败，请重新上传后再试。');
        }

        if (Date.now() >= deadline) {
            throw new Error('文件已上传，但 Gemini 仍在处理中。请稍后重试。');
        }

        await sleep(GEMINI_FILE_READY_POLL_INTERVAL_MS);
    }
}
function buildConnectivityError(action: string, baseUrl: string, error: unknown): Error {
    const rawMessage = toErrorMessage(error);
    const lowerMessage = rawMessage.toLowerCase();
    const code = axios.isAxiosError(error) ? error.code : undefined;
    const isConnectivityError = code === 'ECONNABORTED'
        || code === 'ETIMEDOUT'
        || code === 'ENOTFOUND'
        || code === 'ECONNREFUSED'
        || code === 'ECONNRESET'
        || lowerMessage.includes('timeout')
        || lowerMessage.includes('network error')
        || lowerMessage.includes('socket hang up');

    if (!isConnectivityError) {
        return new Error(`${action}失败: ${rawMessage}`);
    }

    return new Error(
        `${action}失败：当前服务器无法连接 Gemini API。已尝试访问 ${baseUrl}。` +
        `如果你当前在中国大陆或受限网络环境，需要可访问 Google 的代理，` +
        `或者把 GEMINI_API_BASE 配置为可转发 Gemini 原生 API 的网关。`
    );
}

async function readNodeStreamAsText(stream: NodeJS.ReadableStream, limit = 20_000): Promise<string> {
    const decoder = new TextDecoder();
    let text = '';

    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
        text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        if (text.length >= limit) {
            break;
        }
    }

    return text;
}

async function uploadGeminiFile(file: File, apiKey: string, baseUrl: string, timeoutMs: number): Promise<UploadedFileRef> {
    const mimeType = inferMimeType(file);

    let startResponse;
    try {
        startResponse = await axios.post(
            `${baseUrl}/upload/v1beta/files`,
            {
                file: {
                    display_name: file.name,
                },
            },
            {
                headers: {
                    'x-goog-api-key': apiKey,
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': String(file.size),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json',
                },
                timeout: timeoutMs,
                validateStatus: () => true,
                ...getGeminiProxyConfig(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            }
        );
    } catch (error) {
        throw buildConnectivityError('文件上传初始化', baseUrl, error);
    }

    if (startResponse.status < 200 || startResponse.status >= 300) {
        throw new Error(`文件上传初始化失败: ${typeof startResponse.data === 'string' ? startResponse.data : JSON.stringify(startResponse.data)}`);
    }

    const uploadUrl = startResponse.headers['x-goog-upload-url'];
    if (!uploadUrl || typeof uploadUrl !== 'string') {
        throw new Error('文件上传初始化失败：未返回上传地址');
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    let uploadResponse;
    try {
        uploadResponse = await axios.post(uploadUrl, fileBuffer, {
            headers: {
                'x-goog-api-key': apiKey,
                'Content-Length': String(fileBuffer.length),
                'X-Goog-Upload-Offset': '0',
                'X-Goog-Upload-Command': 'upload, finalize',
            },
            timeout: timeoutMs,
            validateStatus: () => true,
            ...getGeminiProxyConfig(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
    } catch (error) {
        throw buildConnectivityError('文件上传', baseUrl, error);
    }

    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        throw new Error(`文件上传失败: ${typeof uploadResponse.data === 'string' ? uploadResponse.data : JSON.stringify(uploadResponse.data)}`);
    }

    const uploadedFile = unwrapGeminiFile(uploadResponse.data);
    if (!uploadedFile.uri) {
        throw new Error('文件上传失败：未返回文件 URI');
    }

    if (uploadedFile.name) {
        await waitForGeminiFileActive(uploadedFile.name, apiKey, baseUrl, timeoutMs);
    }

    return {
        name: file.name,
        mimeType,
        fileUri: uploadedFile.uri,
    };
}
async function buildGeminiParts(content: AgentMessage['content']): Promise<Array<Record<string, unknown>>> {
    if (typeof content === 'string') {
        return content ? [{ text: content }] : [];
    }

    const parts: Array<Record<string, unknown>> = [];
    for (const part of content) {
        if (part.type === 'text' && part.text) {
            parts.push({ text: part.text });
            continue;
        }

        if (part.type === 'image_url') {
            const parsed = parseDataUrl(part.image_url.url);
            if (parsed) {
                parts.push({
                    inline_data: {
                        mime_type: parsed.mimeType,
                        data: parsed.data,
                    },
                });
            }
            continue;
        }

        if (part.type === 'file_data' && part.file_data.file_uri) {
            parts.push({
                file_data: {
                    mime_type: part.file_data.mime_type || 'application/pdf',
                    file_uri: part.file_data.file_uri,
                },
            });
        }
    }

    return parts;
}

async function buildCurrentFileParts(files: File[], apiKey: string, baseUrl: string, timeoutMs: number): Promise<{ parts: Array<Record<string, unknown>>; uploadedFiles: UploadedFileRef[] }> {
    const parts: Array<Record<string, unknown>> = [];
    const uploadedFiles: UploadedFileRef[] = [];

    for (const file of files) {
        const mimeType = inferMimeType(file);

        if (mimeType.startsWith('image/')) {
            const fileBuffer = Buffer.from(await file.arrayBuffer());
            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: fileBuffer.toString('base64'),
                },
            });
            continue;
        }

        if (isPdfMime(mimeType, file.name)) {
            const uploadedFile = await uploadGeminiFile(file, apiKey, baseUrl, timeoutMs);
            uploadedFiles.push(uploadedFile);
            parts.push({
                file_data: {
                    mime_type: uploadedFile.mimeType,
                    file_uri: uploadedFile.fileUri,
                },
            });
            continue;
        }

        if (isTextLikeMime(mimeType, file.name)) {
            parts.push({
                text: `[附件 ${file.name}]\n${trimInlineText(await file.text())}`,
            });
            continue;
        }

        throw new Error(`暂不支持的附件类型: ${file.name}`);
    }

    return { parts, uploadedFiles };
}

async function parseIncomingRequest(request: NextRequest): Promise<{ messages: AgentMessage[]; model: string; files: File[] }> {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const payloadRaw = formData.get('payload');
        if (typeof payloadRaw !== 'string') {
            throw new Error('payload is required');
        }

        const payload = JSON.parse(payloadRaw) as { messages?: unknown; model?: string };
        const files = formData
            .getAll('files')
            .filter((item): item is File => item instanceof File);

        return {
            messages: normalizeMessages(payload.messages),
            model: payload.model || 'gemini-2.5-flash-lite',
            files,
        };
    }

    const body = await request.json();
    return {
        messages: normalizeMessages(body.messages),
        model: body.model || 'gemini-2.5-flash-lite',
        files: [],
    };
}


async function requestGeminiStream(
    effectiveModel: string,
    requestBody: Record<string, unknown>,
    apiKey: string,
    baseUrl: string,
    timeoutMs: number,
): Promise<NodeJS.ReadableStream> {
    let response;
    try {
        response = await axios.post(
            `${baseUrl}/v1beta/models/${encodeURIComponent(effectiveModel)}:streamGenerateContent?alt=sse`,
            requestBody,
            {
                headers: {
                    'x-goog-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                responseType: 'stream',
                timeout: timeoutMs,
                validateStatus: () => true,
                ...getGeminiProxyConfig(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            }
        );
    } catch (error) {
        throw buildConnectivityError('Gemini 请求', baseUrl, error);
    }

    if (response.status < 200 || response.status >= 300) {
        const errorText = await readNodeStreamAsText(response.data as NodeJS.ReadableStream);
        throw buildGeminiApiError(response.status, errorText, effectiveModel);
    }

    return response.data as NodeJS.ReadableStream;
}



function createGeminiTextResponse(stream: NodeJS.ReadableStream, effectiveModel: string, uploadedFiles: UploadedFileRef[] = []) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';

    const webStream = new ReadableStream({
        async start(controller) {
            const flushEvent = (rawEvent: string) => {
                const dataLines = rawEvent
                    .split('\n')
                    .map((line) => line.trimEnd())
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trim());

                if (dataLines.length === 0) {
                    return;
                }

                const payload = dataLines.join('\n');
                if (!payload || payload === '[DONE]') {
                    return;
                }

                try {
                    const parsed = JSON.parse(payload);
                    const text = extractTextFromResponse(parsed);
                    if (text) {
                        controller.enqueue(encoder.encode(text));
                    }
                } catch {
                    // Ignore partial SSE chunks.
                }
            };

            try {
                for await (const chunk of stream as AsyncIterable<Buffer | string>) {
                    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
                    buffer = buffer.replace(/\r\n/g, '\n');

                    let boundary = buffer.indexOf('\n\n');
                    while (boundary !== -1) {
                        const rawEvent = buffer.slice(0, boundary);
                        buffer = buffer.slice(boundary + 2);
                        flushEvent(rawEvent);
                        boundary = buffer.indexOf('\n\n');
                    }
                }

                buffer += decoder.decode();
                buffer = buffer.replace(/\r\n/g, '\n');

                if (buffer.trim()) {
                    flushEvent(buffer);
                }

                controller.close();
            } catch (error) {
                controller.error(error);
            }
        },
    });

    const headers = new Headers({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'x-agent-model': effectiveModel,
    });

    if (uploadedFiles.length > 0) {
        headers.set('x-agent-uploaded-files', encodeURIComponent(JSON.stringify(uploadedFiles)));
    }

    return new Response(webStream, { headers });
}

export async function POST(request: NextRequest) {
    const auth = requireScriptHubPermission(request, 'agent-chat');
    if ('response' in auth) {
        return auth.response;
    }

    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Missing GEMINI_API_KEY / GOOGLE_API_KEY / GOOGLE_AI_STUDIO_API_KEY / AI_API_KEY server env.' },
                { status: 500 }
            );
        }

        const baseUrl = getGeminiBaseUrl();
        const timeoutMs = getGeminiTimeoutMs();
        const { messages, model, files } = await parseIncomingRequest(request);
        if (messages.length === 0 && files.length === 0) {
            return NextResponse.json({ error: 'messages or files are required' }, { status: 400 });
        }

        const historyHasPdf = historyContainsPdf(messages);
        const isResumeScreeningFlow = isResumeScreeningConversation(messages);
        const shouldUseDocumentModel = (files.some((file) => isPdfMime(inferMimeType(file), file.name)) || historyHasPdf)
            && !DOCUMENT_MODELS.has(model);
        const effectiveModel = shouldUseDocumentModel ? DOCUMENT_FALLBACK_MODEL : model;
        const hasDocumentContext = files.length > 0 || historyHasPdf;

        const systemParts: Array<{ text: string }> = [];
        const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];
        let lastUserIndex = -1;

        for (const message of messages) {
            if (message.role === 'system') {
                const systemText = messageContentToText(message.content).trim();
                if (systemText) {
                    systemParts.push({ text: systemText });
                }
                continue;
            }

            const parts = await buildGeminiParts(message.content);
            if (parts.length === 0) {
                parts.push({ text: ' ' });
            }

            const role = message.role === 'assistant' ? 'model' : 'user';
            contents.push({ role, parts });
            if (role === 'user') {
                lastUserIndex = contents.length - 1;
            }
        }

        if (lastUserIndex === -1) {
            contents.push({ role: 'user', parts: [] });
            lastUserIndex = contents.length - 1;
        }

        let uploadedFiles: UploadedFileRef[] = [];
        if (files.length > 0) {
            const currentFileParts = await buildCurrentFileParts(files, apiKey, baseUrl, timeoutMs);
            contents[lastUserIndex].parts.push(...currentFileParts.parts);
            uploadedFiles = currentFileParts.uploadedFiles;
        }

        if (files.length > 0 && isResumeScreeningFlow) {
            systemParts.push({ text: RESUME_ATTACHMENT_SYSTEM_INSTRUCTION });
        }

        const requestBody: Record<string, unknown> = {
            contents,
            generationConfig: buildGenerationConfig(hasDocumentContext),
        };
        if (systemParts.length > 0) {
            requestBody.systemInstruction = { parts: systemParts };
        }

        let responseModel = effectiveModel;

        try {
            const geminiStream = await requestGeminiStream(responseModel, requestBody, apiKey, baseUrl, timeoutMs);
            return createGeminiTextResponse(geminiStream, responseModel, uploadedFiles);
        } catch (error) {
            const shouldRetryWithLite = error instanceof AgentApiError
                && error.status === 429
                && responseModel === 'gemini-2.5-flash';
            if (!shouldRetryWithLite) {
                throw error;
            }

            responseModel = DOCUMENT_FALLBACK_MODEL;
            const geminiStream = await requestGeminiStream(responseModel, requestBody, apiKey, baseUrl, timeoutMs);
            return createGeminiTextResponse(geminiStream, responseModel, uploadedFiles);
        }
    } catch (error) {
        console.error('Agent chat API error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        if (error instanceof AgentApiError) {
            return NextResponse.json(
                { error: errorMessage },
                {
                    status: error.status,
                    headers: error.retryAfterSeconds
                        ? { 'Retry-After': String(error.retryAfterSeconds) }
                        : undefined,
                }
            );
        }

        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}











