
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
    Check,
    AlertCircle,
    Languages
} from 'lucide-react';
import { toast } from 'sonner';
import CryptoJS from 'crypto-js';

type DevToolTab = 'json' | 'timestamp' | 'uuid' | 'base64' | 'url' | 'jwt' | 'hash' | 'regex';
type Language = 'zh' | 'en';

const TRANSLATIONS = {
    zh: {
        title: '开发者工具',
        subtitle: 'v1.2.0 • 内部专用',
        common: '常用工具',
        advanced: '高级工具',
        nav: {
            json: 'JSON 格式化',
            timestamp: '时间戳转换',
            uuid: 'UUID 生成',
            base64: 'Base64 编解码',
            url: 'URL 编解码',
            jwt: 'JWT 解析',
            hash: 'Hash 计算',
            regex: '正则测试'
        },
        json: {
            title: 'JSON 工具',
            desc: '验证、美化与压缩 (Formatter & Minifier)',
            input: '输入',
            output: '输出',
            placeholder: '在此粘贴 JSON 字符串...',
            clear: '清空',
            minify: '压缩',
            format: '格式化',
            copy_success: 'JSON 已复制到剪贴板'
        },
        timestamp: {
            title: '时间戳转换',
            desc: '支持 10位(秒) 和 13位(毫秒) 自动识别',
            label: 'Unix 时间戳',
            placeholder: '例如: 1678888888',
            convert: '转换',
            beijing_time: '北京时间 (CST)',
            now_label: '当前时间戳 (秒)',
            get_current: '获取当前时间',
            invalid: '无效的时间戳'
        },
        uuid: {
            title: 'UUID 生成器',
            desc: '生成符合 RFC 4122 标准的 Version 4 UUID',
            generate: '生成新的 UUID',
            copy_success: 'UUID 已复制'
        },
        base64: {
            title: 'Base64 编解码',
            desc: 'UTF-8 安全编解码 (支持中文)',
            placeholder: '输入文本进行编码或解码...',
            encode: '编码 ↓',
            decode: '解码 ↑',
            result_placeholder: '结果...',
            encode_fail: '编码失败: ',
            decode_fail: '解码失败: '
        },
        url: {
            title: 'URL 编解码',
            input_placeholder: '在此粘贴 URL...',
            encode: '编码',
            decode: '解码',
            result_placeholder: '结果...',
            error: '错误: '
        },
        jwt: {
            title: 'JWT 调试器',
            desc: '解析 JWTs 并查看 Payload (仅客户端)',
            token_label: 'Token 字符串',
            token_placeholder: '粘贴标准 JWT (header.payload.signature)...',
            header_label: 'Header',
            payload_label: 'Payload',
            invalid_format: '无效的 JWT 格式 (应包含三部分)',
            parse_fail: 'JWT 解析失败: '
        },
        hash: {
            title: 'Hash 计算器',
            desc: '实时计算 MD5, SHA1, SHA256',
            input_label: '输入文本',
            placeholder: '输入以计算 Hash...'
        },
        regex: {
            title: '正则表达式测试',
            pattern_placeholder: '正则表达式...',
            flags_placeholder: '修饰符',
            test_btn: '测试',
            test_string_label: '测试字符串',
            test_string_placeholder: '粘贴内容以进行匹配测试...',
            matches_label: '匹配结果',
            no_matches: '未找到匹配项。',
            error: '正则表达式错误: '
        }
    },
    en: {
        title: 'Developer Tools',
        subtitle: 'v1.2.0 • Internal Use Only',
        common: 'Common',
        advanced: 'Advanced',
        nav: {
            json: 'JSON Formatter',
            timestamp: 'Timestamp',
            uuid: 'UUID Generator',
            base64: 'Base64 Converter',
            url: 'URL Encoder',
            jwt: 'JWT Debugger',
            hash: 'Hash Calculator',
            regex: 'Regex Tester'
        },
        json: {
            title: 'JSON Tools',
            desc: 'Validate, Format & Minify',
            input: 'Input',
            output: 'Output',
            placeholder: 'Paste JSON here...',
            clear: 'Clear',
            minify: 'Minify',
            format: 'Format',
            copy_success: 'JSON copied to clipboard'
        },
        timestamp: {
            title: 'Timestamp Converter',
            desc: 'Auto-detects 10-digit (sec) and 13-digit (ms)',
            label: 'Unix Timestamp',
            placeholder: 'e.g. 1678888888',
            convert: 'Convert',
            beijing_time: 'Beijing Time (CST)',
            now_label: 'Now (seconds)',
            get_current: 'Get Current Time',
            invalid: 'Invalid Timestamp'
        },
        uuid: {
            title: 'UUID Generator',
            desc: 'Generate RFC 4122 compliant Version 4 UUIDs',
            generate: 'Generate New UUID',
            copy_success: 'UUID copied'
        },
        base64: {
            title: 'Base64 Converter',
            desc: 'UTF-8 safe encoder/decoder (supports Unicode)',
            placeholder: 'Type text to encode/decode...',
            encode: 'Encode ↓',
            decode: 'Decode ↑',
            result_placeholder: 'Result...',
            encode_fail: 'Encode failed: ',
            decode_fail: 'Decode failed: '
        },
        url: {
            title: 'URL Encoder / Decoder',
            input_placeholder: 'Paste URL here...',
            encode: 'Encode',
            decode: 'Decode',
            result_placeholder: 'Result...',
            error: 'Error: '
        },
        jwt: {
            title: 'JWT Debugger',
            desc: 'Parse JWTs to view their claims (client-side only)',
            token_label: 'Encoded Token',
            token_placeholder: 'Paste standard JWT (header.payload.signature)...',
            header_label: 'Header',
            payload_label: 'Payload',
            invalid_format: 'Invalid JWT format (must have 3 parts)',
            parse_fail: 'JWT Parse failed: '
        },
        hash: {
            title: 'Hash Calculator',
            desc: 'Real-time MD5, SHA1, SHA256 generation',
            input_label: 'Input Text',
            placeholder: 'Type to hash...'
        },
        regex: {
            title: 'Regex Tester',
            pattern_placeholder: 'Pattern...',
            flags_placeholder: 'flags',
            test_btn: 'Test',
            test_string_label: 'Test String',
            test_string_placeholder: 'Paste content to test against...',
            matches_label: 'Matches',
            no_matches: 'No matches found.',
            error: 'Regex Error: '
        }
    }
};

export default function DevTools() {
    const [activeTab, setActiveTab] = useState<DevToolTab>('json');
    const [lang, setLang] = useState<Language>('zh');

    const t = TRANSLATIONS[lang];

    // State - JSON
    const [jsonInput, setJsonInput] = useState('');
    const [jsonOutput, setJsonOutput] = useState('');
    const [jsonError, setJsonError] = useState('');

    // State - Timestamp
    const [timestamp, setTimestamp] = useState(String(Math.floor(Date.now() / 1000)));
    const [dateOutput, setDateOutput] = useState('');

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

    // ================== Handlers ==================

    const toggleLanguage = () => {
        setLang(prev => prev === 'zh' ? 'en' : 'zh');
    };

    const copyToClipboard = (text: string, msg?: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success(msg || (lang === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard'));
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
            setBase64Output(t.base64.encode_fail + (e as Error).message);
        }
    };
    const handleBase64Decode = () => {
        try {
            const decoded = CryptoJS.enc.Base64.parse(base64Input);
            const utf8Str = CryptoJS.enc.Utf8.stringify(decoded);
            setBase64Output(utf8Str || (lang === 'zh' ? '无效的 Base64 编码' : 'Invalid Base64'));
        } catch (e) {
            setBase64Output(t.base64.decode_fail + (e as Error).message);
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
            if (parts.length !== 3) throw new Error(t.jwt.invalid_format);

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
            setJwtError(t.jwt.parse_fail + (e as Error).message);
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

            {/* Lang Switcher - Top Right of the main container */}
            <div className="absolute top-0 right-0 md:top-2 md:right-6 z-10">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleLanguage}
                    className="text-slate-500 hover:text-blue-600 hover:bg-blue-50 gap-2"
                >
                    <Languages className="w-4 h-4" />
                    <span className="font-medium text-xs">{lang === 'zh' ? '中 / En' : 'En / 中'}</span>
                </Button>
            </div>

            {/* Sidebar */}
            <div className="w-full md:w-60 shrink-0 mt-8 md:mt-0">
                <div className="mb-6 px-2">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
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
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white/70 backdrop-blur-md rounded-3xl p-6 border border-white/50 shadow-sm min-h-[600px] flex flex-col pt-12 md:pt-6">

                {/* JSON */}
                {activeTab === 'json' && (
                    <div className="h-full flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.json.title}</h3>
                            <p className="text-sm text-slate-500">{t.json.desc}</p>
                        </div>
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-slate-500 ml-1">{t.json.input}</label>
                                <Textarea
                                    value={jsonInput}
                                    onChange={(e) => setJsonInput(e.target.value)}
                                    placeholder={t.json.placeholder}
                                    className="flex-1 font-mono text-xs bg-white/50 resize-none p-3"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-slate-500 ml-1">{t.json.output}</label>
                                <div className="flex-1 relative">
                                    <Textarea
                                        readOnly
                                        value={jsonError || jsonOutput}
                                        className={`
                                            h-full w-full font-mono text-xs resize-none p-3 bg-slate-50
                                            ${jsonError ? 'text-red-500 border-red-200' : 'text-slate-700'}
                                        `}
                                    />
                                    {jsonOutput && !jsonError && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(jsonOutput, t.json.copy_success)}
                                            className="absolute top-2 right-2 h-8 w-8 bg-white shadow-sm hover:bg-slate-100"
                                        >
                                            <Copy className="w-4 h-4 text-slate-500" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4 justify-end">
                            <Button variant="ghost" onClick={() => { setJsonInput(''); setJsonOutput(''); }} >{t.json.clear}</Button>
                            <Button variant="outline" onClick={handleJsonMinify}>{t.json.minify}</Button>
                            <Button onClick={handleJsonFormat} className="bg-blue-600 hover:bg-blue-700 text-white">{t.json.format}</Button>
                        </div>
                    </div>
                )}

                {/* TIMESTAMP */}
                {activeTab === 'timestamp' && (
                    <div className="space-y-6 max-w-lg">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.timestamp.title}</h3>
                            <p className="text-sm text-slate-500">{t.timestamp.desc}</p>
                        </div>

                        <div className="space-y-4 bg-white/50 p-6 rounded-2xl border border-white/50">
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
                                    <div className="text-xs text-green-600 mb-1">{t.timestamp.beijing_time}</div>
                                    <span className="font-mono text-lg text-green-900 font-bold tracking-wide">{dateOutput}</span>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(dateOutput)}>
                                        <Copy className="w-4 h-4 text-green-600" />
                                    </Button>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-200 mt-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-500">{t.timestamp.now_label}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSetCurrentTimestamp}
                                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                    >
                                        <RefreshCw className="w-3 h-3 mr-2" />
                                        {t.timestamp.get_current}
                                    </Button>
                                </div>
                            </div>
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
                                <Button size="icon" variant="ghost" onClick={() => copyToClipboard(uuidOutput, t.uuid.copy_success)}>
                                    <Copy className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* BASE64 */}
                {activeTab === 'base64' && (
                    <div className="h-full flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.base64.title}</h3>
                            <p className="text-sm text-slate-500">{t.base64.desc}</p>
                        </div>
                        <div className="flex-1 grid grid-cols-1 gap-4">
                            <Textarea
                                value={base64Input}
                                onChange={(e) => setBase64Input(e.target.value)}
                                placeholder={t.base64.placeholder}
                                className="flex-1 font-mono text-sm bg-white/50 resize-none p-4 min-h-[150px]"
                            />
                            <div className="flex gap-4 justify-center py-2">
                                <Button onClick={handleBase64Encode} className="w-32">{t.base64.encode}</Button>
                                <Button onClick={handleBase64Decode} variant="outline" className="w-32">{t.base64.decode}</Button>
                            </div>
                            <Textarea
                                readOnly
                                value={base64Output}
                                placeholder={t.base64.result_placeholder}
                                className="flex-1 font-mono text-sm bg-slate-50 resize-none p-4 min-h-[150px]"
                            />
                        </div>
                    </div>
                )}

                {/* URL */}
                {activeTab === 'url' && (
                    <div className="h-full flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.url.title}</h3>
                        </div>
                        <div className="flex-1 flex flex-col gap-4">
                            <Textarea
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder={t.url.input_placeholder}
                                className="h-40 font-mono text-sm bg-white/50 resize-none p-4"
                            />
                            <div className="flex gap-4">
                                <Button onClick={handleUrlEncode} className="flex-1">{t.url.encode}</Button>
                                <Button onClick={handleUrlDecode} variant="outline" className="flex-1">{t.url.decode}</Button>
                            </div>
                            <div className="relative flex-1">
                                <Textarea
                                    readOnly
                                    value={urlOutput}
                                    placeholder={t.url.result_placeholder}
                                    className="h-full w-full font-mono text-sm bg-slate-50 resize-none p-4"
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
                    <div className="h-full flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.jwt.title}</h3>
                            <p className="text-sm text-slate-500">{t.jwt.desc}</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-slate-500">{t.jwt.token_label}</label>
                                <Textarea
                                    value={jwtInput}
                                    onChange={(e) => handleJwtDecode(e.target.value)}
                                    placeholder={t.jwt.token_placeholder}
                                    className="flex-1 font-mono text-xs bg-white/50 resize-none p-4 leading-relaxed break-all"
                                />
                                {jwtError && (
                                    <div className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                        <AlertCircle className="w-3 h-3" />
                                        {jwtError}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-slate-500">{t.jwt.header_label}</label>
                                    <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 overflow-x-auto">
                                        {jwtHeader || '{}'}
                                    </pre>
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                    <label className="text-xs font-semibold text-purple-600">{t.jwt.payload_label}</label>
                                    <pre className="bg-slate-50 border border-purple-100 ring-1 ring-purple-50 rounded-lg p-3 text-xs font-mono text-purple-900 overflow-x-auto flex-1">
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
                                <label className="text-sm font-medium text-slate-700 mb-1 block">{t.hash.input_label}</label>
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
                    <div className="h-full flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">{t.regex.title}</h3>
                        </div>
                        <div className="flex flex-col gap-4 flex-1">
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <span className="absolute left-3 top-2.5 text-slate-400 font-mono">/</span>
                                    <Input
                                        value={regexPattern}
                                        onChange={(e) => setRegexPattern(e.target.value)}
                                        placeholder={t.regex.pattern_placeholder}
                                        className="font-mono pl-6"
                                    />
                                    <span className="absolute right-3 top-2.5 text-slate-400 font-mono">/</span>
                                </div>
                                <Input
                                    value={regexFlags}
                                    onChange={(e) => setRegexFlags(e.target.value)}
                                    placeholder={t.regex.flags_placeholder}
                                    className="w-20 font-mono"
                                />
                                <Button onClick={handleRegexTest}>{t.regex.test_btn}</Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-medium text-slate-500">{t.regex.test_string_label}</label>
                                    <Textarea
                                        value={regexText}
                                        onChange={(e) => setRegexText(e.target.value)}
                                        className="flex-1 font-mono text-sm resize-none bg-white"
                                        placeholder={t.regex.test_string_placeholder}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-medium text-slate-500">{t.regex.matches_label} ({regexResult.length})</label>
                                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-y-auto">
                                        {regexResult.length === 0 ? (
                                            <span className="text-slate-400 text-sm italic">{t.regex.no_matches}</span>
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
            </div>
        </div>
    );
}
