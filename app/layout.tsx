import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DinoDev GAMES — Recargas',
  description: 'Recargas de juegos online · Bolivia y Brasil',
};

export const viewport: Viewport = {
  themeColor: '#0a1f14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
