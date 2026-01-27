import type { AppProps } from 'next/app';
import { I18nProvider } from '../lib/i18n';
import { ThemeProvider } from '@/lib/theme';
import '../App.css';

export default function MyApp({ Component, pageProps }: AppProps) {
    return (
        <ThemeProvider>
            <I18nProvider>
                <Component {...pageProps} />
            </I18nProvider>
        </ThemeProvider>
    );
}
