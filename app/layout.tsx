import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DinoDev GAMES — Recargas Free Fire, PUBG, MLBB y más',
  description: 'Recargas de diamantes y saldo para Free Fire, PUBG Mobile, Mobile Legends y Blood Strike. Bolivia y Brasil. Pago con QR.',
  icons: { icon: '/logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
