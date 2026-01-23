'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Sparkles, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { domToPng } from 'modern-screenshot';
import { allScripts } from '@/lib/config';
import { getApiBaseUrl } from '@/lib/api';
import { toast } from 'sonner';

interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
    hasImage?: boolean;
}

export const AiAssistant: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [pendingImage, setPendingImage] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'model',
            content: '你好！我是智能助手，专注于协助您使用本系统。\n\n试着问我：\n- "OCR工具怎么用？"\n- 点击 📷 捕获后问 "我当前在干什么？"',
            timestamp: Date.now()
        }
    ]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const chatPanelRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    // Listen for external trigger events (e.g., from Delivery page)
    useEffect(() => {
        const handleTrigger = async (e: CustomEvent<{ prompt: string; autoScreenshot?: boolean }>) => {
            const { prompt, autoScreenshot } = e.detail;

            // If auto-screenshot requested, capture BEFORE opening panel (no flash)
            if (autoScreenshot) {
                setIsCapturing(true);
                try {
                    // Take screenshot while panel is still closed
                    const dataUrl = await domToPng(document.body, {
                        scale: 0.5,
                        quality: 0.7,
                        backgroundColor: '#0f172a',
                    });

                    const base64 = dataUrl.split(',')[1];
                    setPendingImage(base64);
                    setInput(prompt);

                    // NOW open the panel after screenshot is done
                    setIsOpen(true);
                    toast.success('内容已捕获！点击发送获取AI建议');
                } catch (error) {
                    console.error('Auto-screenshot error:', error);
                    setInput(prompt);
                    setIsOpen(true);
                } finally {
                    setIsCapturing(false);
                }
            } else {
                // No screenshot - just open panel and set prompt
                setInput(prompt);
                setIsOpen(true);
            }
        };

        window.addEventListener('ai-assistant-trigger', handleTrigger as unknown as EventListener);
        return () => window.removeEventListener('ai-assistant-trigger', handleTrigger as unknown as EventListener);
    }, []);

    // Capture screenshot of the page (excluding chat panel)
    const captureScreenshot = useCallback(async () => {
        setIsCapturing(true);
        try {
            // Temporarily hide the chat panel
            if (chatPanelRef.current) {
                chatPanelRef.current.style.display = 'none';
            }

            // Use modern-screenshot for better CSS compatibility
            const dataUrl = await domToPng(document.body, {
                scale: 0.5, // Reduce size for faster upload
                quality: 0.7,
                backgroundColor: '#0f172a',
            });

            // Restore chat panel
            if (chatPanelRef.current) {
                chatPanelRef.current.style.display = 'flex';
            }

            // Convert to base64 (remove data:image/png;base64, prefix)
            const base64 = dataUrl.split(',')[1];

            setPendingImage(base64);
            toast.success('内容已捕获！输入问题后发送');
        } catch (error) {
            console.error('Screenshot error:', error);
            toast.error('内容捕获失败');
            // Restore chat panel on error
            if (chatPanelRef.current) {
                chatPanelRef.current.style.display = 'flex';
            }
        } finally {
            setIsCapturing(false);
        }
    }, []);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const hasImage = !!pendingImage;
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: hasImage ? `📷 ${input.trim()}` : input.trim(),
            timestamp: Date.now(),
            hasImage
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const baseUrl = getApiBaseUrl();
            if (!baseUrl) {
                throw new Error('API Base URL not configured');
            }

            const context = { tools: allScripts };
            const history = messages
                .filter(m => m.id !== 'welcome')
                .map(m => ({ role: m.role, parts: [m.content] }));

            const requestBody: Record<string, unknown> = {
                message: input.trim(),
                history,
                context
            };

            // Add image if captured
            if (pendingImage) {
                requestBody.image = pendingImage;
            }

            const response = await fetch(`${baseUrl}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            // Clear pending image after sending
            setPendingImage(null);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Network error' }));
                throw new Error(errorData.detail || '请求失败');
            }

            if (!response.body) throw new Error('ReadableStream not supported');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiContent = '';
            let aiMsgId = '';
            let isFirstChunk = true;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                if (!chunk) continue;

                aiContent += chunk;

                if (isFirstChunk) {
                    setIsLoading(false);
                    isFirstChunk = false;
                    aiMsgId = Date.now().toString() + '_ai';
                    setMessages(prev => [...prev, { id: aiMsgId, role: 'model', content: aiContent, timestamp: Date.now() }]);
                } else {
                    setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: aiContent } : m));
                }
            }

            const finalChunk = decoder.decode();
            if (finalChunk) {
                aiContent += finalChunk;
                if (isFirstChunk) {
                    setIsLoading(false);
                    setMessages(prev => [...prev, { id: Date.now().toString() + '_ai', role: 'model', content: aiContent, timestamp: Date.now() }]);
                } else {
                    setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: aiContent } : m));
                }
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('AI Chat Error:', error);
            toast.error(`发送失败: ${errorMessage}`);
            setMessages(prev => [...prev, { id: Date.now().toString() + '_err', role: 'model', content: `抱歉，出现错误: ${errorMessage}`, timestamp: Date.now() }]);
            setPendingImage(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div ref={chatPanelRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="pointer-events-auto mb-4 w-[400px] h-[600px] flex flex-col overflow-hidden rounded-2xl border border-white/10 dark:border-slate-700/50 shadow-2xl shadow-black/20"
                        style={{
                            background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95))',
                            backdropFilter: 'blur(20px)',
                        }}
                    >
                        {/* Header */}
                        <div className="h-16 flex items-center justify-between px-5 border-b border-white/5 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/30">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-100 text-sm">ScriptHub智能助手</h3>
                                    <p className="text-xs text-violet-400/80">Powered by Gemini</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
                            style={{ background: 'rgba(15, 23, 42, 0.5)' }}
                        >
                            {messages.map((msg) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={msg.id}
                                    className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.role === 'model' && (
                                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white mr-2 flex-shrink-0 mt-1 shadow-md shadow-violet-500/20">
                                            <Sparkles className="w-4 h-4" />
                                        </div>
                                    )}
                                    <div className={`
                                        max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                                        ${msg.role === 'user'
                                            ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-br-sm shadow-lg shadow-teal-500/20'
                                            : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-bl-sm'}
                                    `}>
                                        {msg.role === 'model' ? (
                                            <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:text-teal-400">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>
                                        ) : (
                                            <span>{msg.content}</span>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                            {isLoading && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex justify-start items-center gap-2"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    </div>
                                    <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                                        <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Pending Image Indicator */}
                        {pendingImage && (
                            <div className="px-4 py-2 bg-teal-500/10 border-t border-teal-500/20 flex items-center gap-2 text-xs text-teal-400">
                                <Camera className="w-4 h-4" />
                                <span>已捕获内容，发送消息后将一并分析</span>
                                <button
                                    onClick={() => setPendingImage(null)}
                                    className="ml-auto text-slate-400 hover:text-slate-200"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Input */}
                        <div className="p-4 border-t border-white/5 bg-slate-900/80">
                            <div className="relative flex items-center gap-2">
                                {/* Screenshot Button */}
                                <button
                                    onClick={captureScreenshot}
                                    disabled={isCapturing || isLoading}
                                    className={`p-3 rounded-xl transition-all ${pendingImage
                                        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                                        : 'bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-teal-400 hover:border-teal-500/30'
                                        } disabled:opacity-40`}
                                    title="截取当前页面"
                                >
                                    {isCapturing ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Camera className="w-5 h-5" />
                                    )}
                                </button>
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={pendingImage ? "描述你想问的问题..." : "输入问题..."}
                                    className="flex-1 resize-none bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 focus:outline-none text-slate-200 placeholder:text-slate-500 scrollbar-hide min-h-[48px] max-h-32"
                                    rows={1}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className="p-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl hover:from-teal-400 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Toggle Button */}
            <motion.button
                layout
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    pointer-events-auto w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-300
                    ${isOpen
                        ? 'bg-slate-700 text-slate-300 shadow-slate-900/50'
                        : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-violet-500/40 hover:shadow-violet-500/60'}
                `}
            >
                {isOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
            </motion.button>
        </div >
    );
};
