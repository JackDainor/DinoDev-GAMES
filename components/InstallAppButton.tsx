'use client';
import { useEffect, useState } from 'react';

export default function InstallAppButton({ className = 'btn primary' }: { className?: string }) {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [tip, setTip] = useState(false);

  useEffect(() => {
    try {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) {
        setInstalled(true);
        return;
      }
    } catch {
      /* */
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferred(null);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  if (installed) return null;

  async function install() {
    if (deferred) {
      try {
        deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice?.outcome === 'accepted') setInstalled(true);
      } catch {
        setTip(true);
      }
      setDeferred(null);
      return;
    }
    setTip(true);
  }

  return (
    <div style={{ width: '100%' }}>
      <button type="button" className={className} onClick={install} style={{ width: '100%' }}>
        📲 Instalar aplicación
      </button>
      {tip && (
        <p className="muted" style={{ marginTop: 8, fontSize: 13, textAlign: 'center' }}>
          En el menú del navegador elige <strong>Agregar a pantalla de inicio</strong> o{' '}
          <strong>Instalar app</strong>.
        </p>
      )}
    </div>
  );
}
