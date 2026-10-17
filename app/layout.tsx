import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SwRegister } from './sw-register';

export const metadata: Metadata = {
  title: 'DinoDev GAMES — Recargas Free Fire, PUBG, MLBB y más',
  description:
    'Recargas de diamantes y saldo para Free Fire, PUBG Mobile, Mobile Legends y Blood Strike. Bolivia y Brasil. Pago con QR.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DinoDev GAMES',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#39ff78',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
