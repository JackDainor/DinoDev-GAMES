'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const KIND: Record<string, string> = {
  earn: 'Ganaste',
  spend: 'Canjeaste',
  refund: 'Devolución',
  admin: 'Ajuste',
};

export default function DinoCoinPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [ledger, setLedger] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/dinocoin', { cache: 'no-store' });
      if (r.status === 401) {
        router.push('/login');
        return;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || 'No se pudo cargar');
        return;
      }
      setBalance(Number(d.balance || 0));
      setEnabled(d.enabled !== false);
      setLedger(d.ledger || []);
    })();
  }, [router]);

  if (balance === null && !err) {
    return (
      <main className="wrap">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <p style={{ display: 'flex', gap: 12 }}>
        <a href="/">← Tienda</a>
        <a href="/cuenta">Mi cuenta</a>
        <a href="/billetera">Mi billetera</a>
      </p>
      <h1>🪙 Mis DinoCoin</h1>
      {err && <div className="alert error">{err}</div>}

      <section className="panel">
        <p className="muted">Saldo disponible</p>
        <p className="price-usd" style={{ fontSize: '2.4rem', margin: '0.2rem 0 0.5rem' }}>
          {(balance || 0).toLocaleString('es-BO')} DC
        </p>
        {!enabled && (
          <div className="alert error">El sistema DinoCoin está pausado por ahora.</div>
        )}
        <a className="btn primary" href="/#recargar">
          Canjear por diamantes
        </a>
      </section>

      <section className="panel">
        <h2>¿Cómo funciona?</h2>
        <ol className="steps">
          <li>1. Recarga con QR o billetera estando con tu sesión iniciada.</li>
          <li>2. Cuando tu recarga se completa, se acreditan tus DinoCoin.</li>
          <li>3. En la tienda elige <strong>Pagar con DinoCoin</strong> y canjea el pack.</li>
        </ol>
        <p className="muted">
          Cada pack muestra cuántos DinoCoin ganas (+N 🪙) y cuántos necesitas para canjearlo.
          Los pedidos pagados con DinoCoin no generan DinoCoin nuevos.
        </p>
      </section>

      <section className="panel">
        <h2>Movimientos</h2>
        {ledger.map((l) => (
          <div key={l.id} className="hist-item">
            <span className="st">{KIND[l.kind] || l.kind}</span>
            <strong style={{ color: l.amount >= 0 ? 'var(--accent)' : undefined }}>
              {l.amount >= 0 ? '+' : ''}
              {Number(l.amount).toLocaleString('es-BO')} DC
            </strong>
            <div className="muted">
              {l.game_name ? `${l.game_name} · ${l.item_name || ''}` : l.note || ''} ·{' '}
              {new Date(l.created_at).toLocaleString()}
            </div>
          </div>
        ))}
        {!ledger.length && <p className="muted">Aún no tienes movimientos.</p>}
      </section>
    </main>
  );
}
