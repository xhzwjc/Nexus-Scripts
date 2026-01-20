
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
    Terminal,
    Clock,
    Key,
    Copy,
    RefreshCw,
    Braces,
    ArrowRightLeft,
    Link,
    ShieldCheck,
    Hash,
    Code,
    AlertCircle,
    ArrowLeft,
    Unlock,
    ChevronRight,
    ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import CryptoJS from 'crypto-js';
import { useI18n } from '@/lib/i18n';

type DevToolTab = 'json' | 'timestamp' | 'uuid' | 'base64' | 'url' | 'jwt' | 'hash' | 'regex' | 'decrypt';

interface DevToolsProps {
    onBack?: () => void;
}

export default function DevTools({ onBack }: DevToolsProps) {
    const { t: globalT } = useI18n();
    const t = globalT.devTools;  // Smart alias - all t.xxx references now work with global i18n

    const [activeTab, setActiveTab] = useState<DevToolTab>('json');

    // State - JSON
    const [jsonInput, setJsonInput] = useState('');
    const [jsonOutput, setJsonOutput] = useState('');
    const [jsonError, setJsonError] = useState('');

    // State - Timestamp
    const [timestamp, setTimestamp] = useState(String(Math.floor(Date.now() / 1000)));
    const [dateOutput, setDateOutput] = useState('');
    const [datetimeInput, setDatetimeInput] = useState(() => {
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    });
    const [timestampOutput, setTimestampOutput] = useState('');

    // State - UUID
    const [uuidOutput, setUuidOutput] = useState('');

    // State - Base64
    const [base64Input, setBase64Input] = useState('');
    const [base64Output, setBase64Output] = useState('');

    // State - URL
    const [urlInput, setUrlInput] = useState('');
    const [urlOutput, setUrlOutput] = useState('');

    // State - JWT
    const [jwtInput, setJwtInput] = useState('');
    const [jwtHeader, setJwtHeader] = useState('');
    const [jwtPayload, setJwtPayload] = useState('');
    const [jwtError, setJwtError] = useState('');

    // State - Hash
    const [hashInput, setHashInput] = useState('');
    const [hashOutputMD5, setHashOutputMD5] = useState('');
    const [hashOutputSHA1, setHashOutputSHA1] = useState('');
    const [hashOutputSHA256, setHashOutputSHA256] = useState('');

    // State - Regex
    const [regexPattern, setRegexPattern] = useState('');
    const [regexFlags, setRegexFlags] = useState('g');
    const [regexText, setRegexText] = useState('');
    const [regexResult, setRegexResult] = useState<string[]>([]);

    // State - Decrypt
    const [decryptInput, setDecryptInput] = useState('');
    const [decryptKey, setDecryptKey] = useState('');
    const [decryptOutput, setDecryptOutput] = useState('');
    const [decryptError, setDecryptError] = useState('');

    // State - JSON Tree (collapsible)
    const [jsonCollapsed, setJsonCollapsed] = useState<Set<string>>(new Set());

    // Default encryption key (same as team-resources-data.ts)
    const DEFAULT_ENCRYPTION_KEY = 'ScriptHub@TeamResources#2024!Secure';

    // ================== Handlers ==================

    const copyToClipboard = (text: string, msg?: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success(msg || globalT.common.copied);
    };

    // JSON Handler
    const handleJsonFormat = () => {
        try {
            if (!jsonInput.trim()) return;
            const parsed = JSON.parse(jsonInput);
            setJsonOutput(JSON.stringify(parsed, null, 4));
            setJsonError('');
        } catch (e) {
            setJsonError((e as Error).message);
            setJsonOutput('');
        }
    };
    const handleJsonMinify = () => {
        try {
            if (!jsonInput.trim()) return;
            const parsed = JSON.parse(jsonInput);
            setJsonOutput(JSON.stringify(parsed));
            setJsonError('');
        } catch (e) {
            setJsonError((e as Error).message);
            setJsonOutput('');
        }
    };

    // JSON Tree toggle
    const toggleJsonNode = (path: string) => {
        setJsonCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    // Render collapsible JSON
    const renderJsonTree = (data: unknown, path: string = 'root', indent: number = 0): React.ReactNode => {
        if (data === null) return <span className="text-purple-600">null</span>;
        if (typeof data === 'boolean') return <span className="text-orange-600">{String(data)}</span>;
        if (typeof data === 'number') return <span className="text-blue-600">{data}</span>;
        if (typeof data === 'string') return <span className="text-green-600">&quot;{data}&quot;</span>;

        const isArray = Array.isArray(data);
        const entries = isArray ? data.map((v, i) => [i, v] as [number, unknown]) : Object.entries(data as object);
        const isCollapsed = jsonCollapsed.has(path);

        if (entries.length === 0) {
            return <span className="text-slate-500">{isArray ? '[]' : '{}'}</span>;
        }

        return (
            <span>
                <button
                    onClick={() => toggleJsonNode(path)}
                    className="inline-flex items-center text-slate-400 hover:text-blue-600 mr-1"
                >
                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <span className="text-slate-500">{isArray ? '[' : '{'}</span>
                {isCollapsed ? (
                    <span className="text-slate-400 text-xs ml-1">
                        {entries.length} {isArray ? 'items' : 'keys'}...
                    </span>
                ) : (
                    <div className="ml-0 border-l border-slate-200/50 pl-2">
                        {entries.map(([key, value], idx) => (
                            <div key={String(key)} className="flex">
                                {!isArray && <span className="text-red-600">&quot;{key}&quot;</span>}
                                {!isArray && <span className="text-slate-500">: </span>}
                                {isArray && <span className="text-slate-400 mr-2">{key}:</span>}
                                {renderJsonTree(value, `${path}.${key}`, indent + 1)}
                                {idx < entries.length - 1 && <span className="text-slate-500">,</span>}
                            </div>
                        ))}
                    </div>
                )}
                <span className="text-slate-500">{isArray ? ']' : '}'}</span>
            </span>
        );
    };

    // Timestamp Handler
    const handleTimestampConvert = (value?: string) => {
        try {
            const inputVal = value !== undefined ? value : timestamp;
            const ts = parseInt(inputVal);
            if (isNaN(ts)) throw new Error(t.timestamp.invalid);
            const date = new Date(ts.toString().length === 13 ? ts : ts * 1000);
            setDateOutput(date.toLocaleString('zh-CN', { hour12: false }));
        } catch {
            setDateOutput(t.timestamp.invalid);
        }
    };
    const handleSetCurrentTimestamp = () => {
        const now = Math.floor(Date.now() / 1000).toString();
        setTimestamp(now);
        handleTimestampConvert(now);
    };

    // UUID Handler
    const generateUUID = () => {
        setUuidOutput(crypto.randomUUID());
    };

    // Base64 Handler
    const handleBase64Encode = () => {
        try {
            const utf8Bytes = CryptoJS.enc.Utf8.parse(base64Input);
            const encoded = CryptoJS.enc.Base64.stringify(utf8Bytes);
            setBase64Output(encoded);
        } catch (e) {
            setBase64Output(t.base64.encodeFail + (e as Error).message);
        }
    };
    const handleBase64Decode = () => {
        try {
            const decoded = CryptoJS.enc.Base64.parse(base64Input);
            const utf8Str = CryptoJS.enc.Utf8.stringify(decoded);
            setBase64Output(utf8Str || t.base64.invalidBase64);
        } catch (e) {
            setBase64Output(t.base64.decodeFail + (e as Error).message);
        }
    };

    // URL Handler
    const handleUrlEncode = () => {
        try {
            setUrlOutput(encodeURIComponent(urlInput));
        } catch (e) {
            setUrlOutput(t.url.error + (e as Error).message);
        }
    };
    const handleUrlDecode = () => {
        try {
            setUrlOutput(decodeURIComponent(urlInput));
        } catch (e) {
            setUrlOutput(t.url.error + (e as Error).message);
        }
    };

    // JWT Handler
    const handleJwtDecode = (token: string) => {
        setJwtInput(token);
        setJwtError('');
        setJwtHeader('');
        setJwtPayload('');

        if (!token) return;

        try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error(t.jwt.invalidFormat);

            const decodePart = (part: string) => {
                const padding = '='.repeat((4 - part.length % 4) % 4);
                const base64 = (part + padding).replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                return JSON.stringify(JSON.parse(jsonPayload), null, 4);
            };

            setJwtHeader(decodePart(parts[0]));
            setJwtPayload(decodePart(parts[1]));
        } catch (e) {
            setJwtError(t.jwt.parseFail + (e as Error).message);
        }
    };

    // Hash Handler
    const handleHashCalculate = (val: string) => {
        setHashInput(val);
        if (!val) {
            setHashOutputMD5('');
            setHashOutputSHA1('');
            setHashOutputSHA256('');
            return;
        }
        setHashOutputMD5(CryptoJS.MD5(val).toString());
        setHashOutputSHA1(CryptoJS.SHA1(val).toString());
        setHashOutputSHA256(CryptoJS.SHA256(val).toString());
    };

    // Regex Handler
    const handleRegexTest = () => {
        try {
            if (!regexPattern) {
                setRegexResult([]);
                return;
            }
            const regex = new RegExp(regexPattern, regexFlags);
            if (regexFlags.includes('g')) {
                const matches = regexText.match(regex);
                setRegexResult(matches || []);
            } else {
                const match = regexText.match(regex);
                setRegexResult(match ? [match[0]] : []);
            }
        } catch (e) {
            setRegexResult([t.regex.error + (e as Error).message]);
        }
    };

    // Decrypt Handler
    const handleDecrypt = () => {
        setDecryptError('');
        setDecryptOutput('');

        if (!decryptInput.trim()) {
            setDecryptError(t.decrypt.emptyInput);
            return;
        }

        try {
            const key = decryptKey.trim() || DEFAULT_ENCRYPTION_KEY;
            const bytes = CryptoJS.AES.decrypt(decryptInput.trim(), key);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);

            if (!decrypted) {
                throw new Error(t.decrypt.wrongKey);
            }

            // Try to parse and format as JSON
            try {
                const parsed = JSON.parse(decrypted);
                setDecryptOutput(JSON.stringify(parsed, null, 2));
            } catch {
                // Not JSON, just show as is
                setDecryptOutput(decrypted);
            }

            toast.success(t.decrypt.success);
        } catch (e) {
            setDecryptError(t.decrypt.fail + (e as Error).message);
        }
    };

    // Nav Button
    const NavBtn = ({ id, icon, label }: { id: DevToolTab, icon: React.ReactElement, label: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full text-left text-sm mb-1
                ${activeTab === id
                    ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm ring-1 ring-blue-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
            `}
        >
            {React.cloneElement(icon, { className: "w-4 h-4" } as React.HTMLAttributes<HTMLElement>)}
            <span>{label}</span>
        </button>
    );

    return (
        <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto w-full h-full relative">

            {/* Sidebar */}
            <div className="w-full md:w-60 shrink-0 mt-8 md:mt-0">
                <div className="mb-6 px-2">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {onBack && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onBack}
                                className="-ml-3 mr-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        )}
                        <Terminal className="w-6 h-6 text-blue-600" />
                        {t.title}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 pl-8">{t.subtitle}</p>
                </div>

                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-white/60 shadow-sm">
                    <div className="text-xs font-semibold text-slate-400 px-3 mb-2 uppercase tracking-wider">{t.common}</div>
                    <NavBtn id="json" icon={<Braces />} label={t.nav.json} />
                    <NavBtn id="timestamp" icon={<Clock />} label={t.nav.timestamp} />
                    <NavBtn id="uuid" icon={<Key />} label={t.nav.uuid} />
                    <NavBtn id="base64" icon={<ArrowRightLeft />} label={t.nav.base64} />
                    <NavBtn id="url" icon={<Link />} label={t.nav.url} />

                    <div className="text-xs font-semibold text-slate-400 px-3 mt-4 mb-2 uppercase tracking-wider">{t.advanced}</div>
                    <NavBtn id="jwt" icon={<ShieldCheck />} label={t.nav.jwt} />
                    <NavBtn id="hash" icon={<Hash />} label={t.nav.hash} />
                    <NavBtn id="regex" icon={<Code />} label={t.nav.regex} />
                    <NavBtn id="decrypt" icon={<Unlock />} label={t.nav.decrypt} />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white/70 backdrop-blur-md rounded-3xl p-6 border border-white/50 shadow-sm min-h-[600px] flex flex-col pt-12 md:pt-6">

                {/* JSON */}
                {activeTab === 'json' && (
                    <div className="h-full flex flex-col overflow-hidden">
                        <div className="mb-4 shrink-0">
                            <h3 className="text-lg font-semibold text-slate-800">{t.json.title}</h3>
                            <p className="text-sm text-slate-500">{t.json.desc}</p>
                        </div>
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
                            <div className="flex flex-col gap-2 overflow-hidden">
                                <label className="text-xs font-medium text-slate-500 ml-1 shrink-0">{t.json.input}</label>
                                <textarea
                                    value={jsonInput}
                                    onChange={(e) => setJsonInput(e.target.value)}
                                    placeholder={t.json.placeholder}
                                    className="flex-1 font-mono text-xs bg-white/50 resize-none p-3 border border-slate-200 rounded-md overflow-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    style={{ minHeight: 0 }}
                                />
                            </div>
                            <div className="flex flex-col gap-2 overflow-hidden">
                                <label className="text-xs font-medium text-slate-500 ml-1 shrink-0">{t.json.output}</label>
                                <div className="flex-1 relative overflow-hidden">
                                    {jsonError ? (
                                        <div className="h-full w-full font-mono text-xs p-3 bg-red-50 border border-red-200 rounded-md overflow-auto text-red-500">
                                            {jsonError}
                                        </div>
                                    ) : jsonOutput ? (
                                        <div className="h-full w-full font-mono text-xs p-3 bg-slate-50 border border-slate-200 rounded-md overflow-auto text-slate-700">
                                            {(() => {
                                                try {
                                                    const parsed = JSON.parse(jsonOutput);
                                                    return renderJsonTree(parsed);
                                                } catch {
                                                    // If not valid JSON, show raw text
                                                    return <pre>{jsonOutput}</pre>;
                                                }
                                            })()}
                                        </div>
                                    ) : (
                                        <div className="h-full w-full font-mono text-xs p-3 bg-slate-50 border border-slate-200 rounded-md overflow-auto text-slate-400">
                                            {t.json.placeholder}
                                        </div>
                                    )}
                                    {jsonOutput && !jsonError && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(jsonOutput, t.json.copySuccess)}
                                            className="absolute top-2 right-2 h-8 w-8 bg-white shadow-sm hover:bg-slate-100"
                                        >
                                            <Copy className="w-4 h-4 text-slate-500" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4 justify-end shrink-0">
                            <Button variant="ghost" onClick={() => { setJsonInput(''); setJsonOutput(''); setJsonCollapsed(new Set()); }} >{t.json.clear}</Button>
                            <Button variant="outline" onClick={handleJsonMinify}>{t.json.minify}</Button>
                            <Button onClick={handleJsonFormat} className="bg-blue-600 hover:bg-blue-700 text-white">{t.json.format}</Button>
                        </div>
                    </div>
                )}

                {/* TIMESTAMP */}
                {activeTab === 'timestamp' && (
                    <div className="space-y-6 max-w-xl">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.timestamp.title}</h3>
                            <p className="text-sm text-slate-500">{t.timestamp.desc}</p>
                        </div>

                        {/* 时间戳转日期 */}
                        <div className="space-y-4 bg-white/50 p-6 rounded-2xl border border-white/50">
                            <div className="text-sm font-semibold text-slate-600 mb-2">时间戳 → 日期时间</div>
                            <div className="flex items-end gap-3">
                                <div className="flex-1 space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t.timestamp.label}</label>
                                    <Input
                                        value={timestamp}
                                        onChange={(e) => setTimestamp(e.target.value)}
                                        className="font-mono bg-white"
                                        placeholder={t.timestamp.placeholder}
                                    />
                                </div>
                                <Button onClick={() => handleTimestampConvert()} className="mb-[2px]">{t.timestamp.convert}</Button>
                            </div>

                            {dateOutput && (
                                <div className="p-4 bg-green-50 border border-green-100 rounded-xl relative group">
                                    <div className="text-xs text-green-600 mb-1">{t.timestamp.beijingTime}</div>
                                    <span className="font-mono text-lg text-green-900 font-bold tracking-wide">{dateOutput}</span>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(dateOutput)}>
                                        <Copy className="w-4 h-4 text-green-600" />
                                    </Button>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-200 mt-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-500">{t.timestamp.nowLabel}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSetCurrentTimestamp}
                                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                    >
                                        <RefreshCw className="w-3 h-3 mr-2" />
                                        {t.timestamp.getCurrent}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* 日期转时间戳 */}
                        <div className="space-y-4 bg-white/50 p-6 rounded-2xl border border-white/50">
                            <div className="text-sm font-semibold text-slate-600 mb-2">日期时间 → 时间戳</div>
                            <div className="flex items-end gap-3">
                                <div className="flex-1 space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t.timestamp.datetimeLabel}</label>
                                    <Input
                                        type="datetime-local"
                                        step="1"
                                        value={datetimeInput}
                                        onChange={(e) => setDatetimeInput(e.target.value)}
                                        className="font-mono bg-white"
                                    />
                                </div>
                                <Button
                                    onClick={() => {
                                        if (!datetimeInput) {
                                            // 默认使用当前时间
                                            const now = new Date();
                                            const ts = Math.floor(now.getTime() / 1000);
                                            setTimestampOutput(`${ts} (秒) / ${ts * 1000} (毫秒)`);
                                        } else {
                                            const date = new Date(datetimeInput);
                                            if (isNaN(date.getTime())) {
                                                setTimestampOutput(t.timestamp.invalidDatetime);
                                            } else {
                                                const ts = Math.floor(date.getTime() / 1000);
                                                setTimestampOutput(`${ts} (秒) / ${ts * 1000} (毫秒)`);
                                            }
                                        }
                                    }}
                                    className="mb-[2px]"
                                >
                                    {t.timestamp.toTimestamp}
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const now = new Date();
                                        const pad = (n: number) => n.toString().padStart(2, '0');
                                        const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
                                        setDatetimeInput(formatted);
                                    }}
                                    className="text-xs"
                                >
                                    使用当前时间
                                </Button>
                            </div>

                            {timestampOutput && (
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl relative group">
                                    <div className="text-xs text-blue-600 mb-1">{t.timestamp.timestampResult}</div>
                                    <span className="font-mono text-lg text-blue-900 font-bold tracking-wide">{timestampOutput}</span>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(timestampOutput.split(' ')[0])}>
                                        <Copy className="w-4 h-4 text-blue-600" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* UUID */}
                {activeTab === 'uuid' && (
                    <div className="space-y-6 max-w-xl">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.uuid.title}</h3>
                            <p className="text-sm text-slate-500">{t.uuid.desc}</p>
                        </div>
                        <Button onClick={generateUUID} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {t.uuid.generate}
                        </Button>
                        {uuidOutput && (
                            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between group">
                                <span className="font-mono text-2xl text-slate-700 tracking-wider">{uuidOutput}</span>
                                <Button size="icon" variant="ghost" onClick={() => copyToClipboard(uuidOutput, t.uuid.copySuccess)}>
                                    <Copy className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* BASE64 */}
                {activeTab === 'base64' && (
                    <div className="h-full flex flex-col overflow-hidden">
                        <div className="mb-4 shrink-0">
                            <h3 className="text-lg font-semibold text-slate-800">{t.base64.title}</h3>
                            <p className="text-sm text-slate-500">{t.base64.desc}</p>
                        </div>
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                            <textarea
                                value={base64Input}
                                onChange={(e) => setBase64Input(e.target.value)}
                                placeholder={t.base64.placeholder}
                                className="flex-1 font-mono text-sm bg-white/50 resize-none p-4 border border-slate-200 rounded-md overflow-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ minHeight: 0 }}
                            />
                            <div className="flex gap-4 justify-center py-2 shrink-0">
                                <Button onClick={handleBase64Encode} className="w-32">{t.base64.encode}</Button>
                                <Button onClick={handleBase64Decode} variant="outline" className="w-32">{t.base64.decode}</Button>
                            </div>
                            <textarea
                                readOnly
                                value={base64Output}
                                placeholder={t.base64.resultPlaceholder}
                                className="flex-1 font-mono text-sm bg-slate-50 resize-none p-4 border border-slate-200 rounded-md overflow-auto"
                                style={{ minHeight: 0 }}
                            />
                        </div>
                    </div>
                )}

                {/* URL */}
                {activeTab === 'url' && (
                    <div className="h-full flex flex-col overflow-hidden">
                        <div className="mb-4 shrink-0">
                            <h3 className="text-lg font-semibold text-slate-800">{t.url.title}</h3>
                        </div>
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                            <textarea
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder={t.url.inputPlaceholder}
                                className="flex-1 font-mono text-sm bg-white/50 resize-none p-4 border border-slate-200 rounded-md overflow-auto break-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ minHeight: 0 }}
                            />
                            <div className="flex gap-4 shrink-0">
                                <Button onClick={handleUrlEncode} className="flex-1">{t.url.encode}</Button>
                                <Button onClick={handleUrlDecode} variant="outline" className="flex-1">{t.url.decode}</Button>
                            </div>
                            <div className="relative flex-1 overflow-hidden">
                                <textarea
                                    readOnly
                                    value={urlOutput}
                                    placeholder={t.url.resultPlaceholder}
                                    className="h-full w-full font-mono text-sm bg-slate-50 resize-none p-4 border border-slate-200 rounded-md overflow-auto break-all"
                                    style={{ minHeight: 0 }}
                                />
                                {urlOutput && (
                                    <Button size="icon" variant="ghost" className="absolute top-2 right-2" onClick={() => copyToClipboard(urlOutput)}>
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* JWT */}
                {activeTab === 'jwt' && (
                    <div className="h-full flex flex-col overflow-hidden">
                        <div className="mb-4 shrink-0">
                            <h3 className="text-lg font-semibold text-slate-800">{t.jwt.title}</h3>
                            <p className="text-sm text-slate-500">{t.jwt.desc}</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
                            <div className="flex flex-col gap-2 overflow-hidden">
                                <label className="text-xs font-semibold text-slate-500 shrink-0">{t.jwt.tokenLabel}</label>
                                <textarea
                                    value={jwtInput}
                                    onChange={(e) => handleJwtDecode(e.target.value)}
                                    placeholder={t.jwt.tokenPlaceholder}
                                    className="flex-1 font-mono text-xs bg-white/50 resize-none p-4 leading-relaxed break-all border border-slate-200 rounded-md overflow-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    style={{ minHeight: 0 }}
                                />
                                {jwtError && (
                                    <div className="text-xs text-red-500 flex items-center gap-1 mt-1 shrink-0">
                                        <AlertCircle className="w-3 h-3" />
                                        {jwtError}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-4 overflow-hidden">
                                <div className="flex flex-col gap-1 shrink-0">
                                    <label className="text-xs font-semibold text-slate-500">{t.jwt.headerLabel}</label>
                                    <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 overflow-auto max-h-[120px]">
                                        {jwtHeader || '{}'}
                                    </pre>
                                </div>
                                <div className="flex flex-col gap-1 flex-1 overflow-hidden">
                                    <label className="text-xs font-semibold text-purple-600 shrink-0">{t.jwt.payloadLabel}</label>
                                    <pre className="flex-1 bg-slate-50 border border-purple-100 ring-1 ring-purple-50 rounded-lg p-3 text-xs font-mono text-purple-900 overflow-auto" style={{ minHeight: 0 }}>
                                        {jwtPayload || '{}'}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* HASH */}
                {activeTab === 'hash' && (
                    <div className="max-w-xl space-y-6">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.hash.title}</h3>
                            <p className="text-sm text-slate-500">{t.hash.desc}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700 mb-1 block">{t.hash.inputLabel}</label>
                                <Textarea
                                    value={hashInput}
                                    onChange={(e) => handleHashCalculate(e.target.value)}
                                    className="font-mono bg-white h-24 resize-none"
                                    placeholder={t.hash.placeholder}
                                />
                            </div>

                            <div className="space-y-3">
                                {[
                                    { name: 'MD5', val: hashOutputMD5 },
                                    { name: 'SHA1', val: hashOutputSHA1 },
                                    { name: 'SHA256', val: hashOutputSHA256 },
                                ].map((item) => (
                                    <div key={item.name} className="relative">
                                        <div className="text-xs font-semibold text-slate-400 mb-1 uppercase">{item.name}</div>
                                        <input
                                            readOnly
                                            value={item.val}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 font-mono text-sm text-slate-600"
                                        />
                                        {item.val && (
                                            <Button size="icon" variant="ghost" className="absolute right-1 top-6 h-8 w-8" onClick={() => copyToClipboard(item.val)}>
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* REGEX */}
                {activeTab === 'regex' && (
                    <div className="h-full flex flex-col overflow-hidden">
                        <div className="mb-4 shrink-0">
                            <h3 className="text-lg font-semibold text-slate-800">{t.regex.title}</h3>
                        </div>
                        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
                            <div className="flex gap-2 shrink-0">
                                <div className="flex-1 relative">
                                    <span className="absolute left-3 top-2.5 text-slate-400 font-mono">/</span>
                                    <Input
                                        value={regexPattern}
                                        onChange={(e) => setRegexPattern(e.target.value)}
                                        placeholder={t.regex.patternPlaceholder}
                                        className="font-mono pl-6"
                                    />
                                    <span className="absolute right-3 top-2.5 text-slate-400 font-mono">/</span>
                                </div>
                                <Input
                                    value={regexFlags}
                                    onChange={(e) => setRegexFlags(e.target.value)}
                                    placeholder={t.regex.flagsPlaceholder}
                                    className="w-20 font-mono"
                                />
                                <Button onClick={handleRegexTest}>{t.regex.testBtn}</Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
                                <div className="flex flex-col gap-2 overflow-hidden">
                                    <label className="text-xs font-medium text-slate-500 shrink-0">{t.regex.testStringLabel}</label>
                                    <textarea
                                        value={regexText}
                                        onChange={(e) => setRegexText(e.target.value)}
                                        className="flex-1 font-mono text-sm resize-none bg-white border border-slate-200 rounded-md p-3 overflow-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder={t.regex.testStringPlaceholder}
                                        style={{ minHeight: 0 }}
                                    />
                                </div>
                                <div className="flex flex-col gap-2 overflow-hidden">
                                    <label className="text-xs font-medium text-slate-500 shrink-0">{t.regex.matchesLabel} ({regexResult.length})</label>
                                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-auto" style={{ minHeight: 0 }}>
                                        {regexResult.length === 0 ? (
                                            <span className="text-slate-400 text-sm italic">{t.regex.noMatches}</span>
                                        ) : (
                                            <ul className="space-y-2">
                                                {regexResult.map((match, i) => (
                                                    <li key={i} className="bg-yellow-100 text-yellow-900 px-2 py-1 rounded font-mono text-sm border border-yellow-200 break-all">
                                                        {match}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Decrypt */}
                {activeTab === 'decrypt' && (
                    <div className="h-full flex flex-col overflow-hidden">
                        <div className="mb-4 shrink-0">
                            <h3 className="text-lg font-semibold text-slate-800">{t.decrypt.title}</h3>
                            <p className="text-sm text-slate-500">{t.decrypt.desc}</p>
                        </div>
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
                            <div className="flex flex-col gap-3 overflow-hidden">
                                <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                                    <label className="text-xs font-medium text-slate-500 shrink-0">{t.decrypt.inputLabel}</label>
                                    <textarea
                                        value={decryptInput}
                                        onChange={(e) => setDecryptInput(e.target.value)}
                                        placeholder={t.decrypt.inputPlaceholder}
                                        className="flex-1 font-mono text-sm resize-none overflow-auto border border-slate-200 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        style={{ minHeight: 0 }}
                                    />
                                </div>
                                <div className="flex flex-col gap-2 shrink-0">
                                    <label className="text-xs font-medium text-slate-500">{t.decrypt.keyLabel}</label>
                                    <Input
                                        value={decryptKey}
                                        onChange={(e) => setDecryptKey(e.target.value)}
                                        placeholder={t.decrypt.keyPlaceholder}
                                        type="password"
                                    />
                                </div>
                                <Button onClick={handleDecrypt} className="bg-green-600 hover:bg-green-700 shrink-0">
                                    <Unlock className="w-4 h-4 mr-2" />
                                    {t.decrypt.decryptBtn}
                                </Button>
                                {decryptError && (
                                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg shrink-0">
                                        <AlertCircle className="w-4 h-4" />
                                        {decryptError}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 overflow-hidden">
                                <div className="flex items-center justify-between shrink-0">
                                    <label className="text-xs font-medium text-slate-500">{t.decrypt.outputLabel}</label>
                                    {decryptOutput && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyToClipboard(decryptOutput, t.decrypt.copySuccess)}
                                            className="text-slate-500 hover:text-blue-600"
                                        >
                                            <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                                        </Button>
                                    )}
                                </div>
                                <textarea
                                    value={decryptOutput}
                                    readOnly
                                    placeholder={t.decrypt.outputPlaceholder}
                                    className="flex-1 font-mono text-sm bg-slate-50 resize-none overflow-auto border border-slate-200 rounded-md p-3"
                                    style={{ minHeight: 0 }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
