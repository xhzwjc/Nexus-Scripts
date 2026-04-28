'use client';

import { useEffect, useState } from 'react';
import "./globals.css";
import "../App.css";
import "../components/AgentChat/AgentChat.css";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const [lang, setLang] = useState<'en' | 'zh-CN'>('en');

    useEffect(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('i18n_language') : null;
        if (saved === 'zh-CN' || saved === 'en-US') {
            setLang(saved === 'zh-CN' ? 'zh-CN' : 'en');
        }
    }, []);

    return (
        <html lang={lang} suppressHydrationWarning>
          <head>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
          </head>
          <body className="antialiased" suppressHydrationWarning>
            {children}
          </body>
        </html>
    );
}
