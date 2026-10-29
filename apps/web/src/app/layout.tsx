import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource/noto-sans-ethiopic/400.css';
import './globals.css';
import { brand } from '@/lib/brand';
import { en } from '@/locales/en';
export const metadata: Metadata = {
  title: `${brand.name} · ${en.siteTitle}`,
  description: en.siteDescription,
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#12675B' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
