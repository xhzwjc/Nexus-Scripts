'use client';

import { Eye, EyeOff, Lock, Loader2 } from 'lucide-react';
import React from 'react';

import { AnimatedLoginCharacters } from '@/components/Layout/AnimatedLoginCharacters';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

interface LoginScreenProps {
    userKey: string;
    isKeyInputFocused: boolean;
    isLoginKeyVisible: boolean;
    isVerifying: boolean;
    loginKeyInputRef: React.RefObject<HTMLInputElement | null>;
    setUserKey: (value: string) => void;
    setIsKeyInputFocused: (value: boolean) => void;
    setIsLoginKeyVisible: React.Dispatch<React.SetStateAction<boolean>>;
    onSubmit: () => void;
}

export function LoginScreen({
    userKey,
    isKeyInputFocused,
    isLoginKeyVisible,
    isVerifying,
    loginKeyInputRef,
    setUserKey,
    setIsKeyInputFocused,
    setIsLoginKeyVisible,
    onSubmit,
}: LoginScreenProps) {
    const { t, language } = useI18n();

    return (
        <div className="min-h-screen colorful-background">
            <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(460px,0.9fr)]">
                <AnimatedLoginCharacters
                    isTyping={isKeyInputFocused}
                    keyLength={userKey.length}
                    isKeyVisible={isLoginKeyVisible}
                />

                <div className="relative flex items-center justify-center px-6 py-10 sm:px-8 lg:my-2 lg:mr-2 lg:ml-2 lg:rounded-3xl lg:border lg:border-slate-200/80 lg:bg-white lg:px-10 lg:text-slate-900 lg:shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                    <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/20 to-background/80 lg:hidden" />
                    <div className="relative w-full max-w-md animate-fadeIn">
                        <div className="mb-8 flex items-center gap-3 lg:hidden">
                            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15">
                                <Lock className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-primary/70">
                                    {language === 'zh-CN' ? '密钥入口' : 'Key Access'}
                                </div>
                                <div className="text-lg font-semibold text-foreground">ScriptHub</div>
                            </div>
                        </div>

                        <Card className="border border-slate-200 bg-white text-slate-900 shadow-xl">
                            <CardHeader className="space-y-4 pb-4">
                                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                    <Lock className="h-3.5 w-3.5" />
                                    {language === 'zh-CN' ? '安全密钥验证' : 'Secure key verification'}
                                </div>
                                <div className="space-y-2">
                                    <CardTitle className="text-3xl tracking-tight">{t.auth.title}</CardTitle>
                                    <CardDescription className="text-sm leading-6 text-slate-500">{t.auth.description}</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <form
                                    className="space-y-5"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        if (!isVerifying) {
                                            onSubmit();
                                        }
                                    }}
                                >
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <Input
                                                ref={loginKeyInputRef}
                                                type={isLoginKeyVisible ? 'text' : 'password'}
                                                placeholder={t.auth.keyPlaceholder}
                                                value={userKey}
                                                onChange={(event) => {
                                                    setUserKey(event.target.value);
                                                    if (loginKeyInputRef.current) {
                                                        loginKeyInputRef.current.setCustomValidity('');
                                                    }
                                                }}
                                                onFocus={() => setIsKeyInputFocused(true)}
                                                onBlur={() => setIsKeyInputFocused(false)}
                                                readOnly={isVerifying}
                                                autoComplete="current-password"
                                                className="h-12 rounded-xl border-slate-300 bg-white pr-12 text-base text-slate-900 shadow-sm placeholder:text-slate-400"
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => setIsLoginKeyVisible((prev) => !prev)}
                                                disabled={isVerifying}
                                                aria-label={
                                                    isLoginKeyVisible
                                                        ? (language === 'zh-CN' ? '隐藏密钥' : 'Hide key')
                                                        : (language === 'zh-CN' ? '显示密钥' : 'Show key')
                                                }
                                            >
                                                {isLoginKeyVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            {language === 'zh-CN' ? '输入密钥后可按回车直接验证。' : 'Press Enter after typing your key to verify instantly.'}
                                        </p>
                                    </div>

                                    <Button
                                        className="h-12 w-full rounded-xl text-base font-medium !bg-black !text-white shadow-lg transition-colors hover:!bg-black/90 dark:!bg-black dark:hover:!bg-black/90 disabled:!bg-slate-300 disabled:!text-slate-500 disabled:shadow-none"
                                        type="submit"
                                        disabled={isVerifying}
                                    >
                                        {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t.auth.loginButton}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
