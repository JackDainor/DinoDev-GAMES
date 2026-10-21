'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CuentaPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [amount, setAmount] = useState('5');
  const [txRef, setTxRef] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [waLink, setWaLink] = useState('');
  const binanceId = process.env.NEXT_PUBLIC_BINANCE_PAY_ID || '';

  async function load() {
    const r = await fetch('/api/auth/me');
    if (!r.ok) {
      router.push('/login');
      return;
    }
    const d = await r.json();
    setUser(d.user);
    const h = await fetch('/api/wallet/history');
    const hd = await h.json();
    if (h.ok) setLedger(hd.ledger || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function deposit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const r = await fetch('/api/wallet/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount), txRef, proofNote }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error || 'Error');
      return;
    }
    setMsg(d.message);
    setWaLink(d.adminWhatsAppLink || '');
    setTxRef('');
    load();
  }

  if (!user) return <main className="wrap"><p className="muted">Cargando…</p></main>;

  return (
    <main className="wrap">
      <p><a href="/">← Tienda</a></p>
      <h1>Hola, {user.username}</h1>
      <p className="muted">{user.email} · {user.whatsapp || 'Sin WhatsApp'}</p>

      <section className="panel" id="billetera">
        <h2>Mi billetera</h2>
        <p className="price-usd" style={{ fontSize: '1.6rem' }}>{Number(user.balance_usd).toFixed(4)} USD</p>
        <p className="muted">Recarga mínima 5 USDT vía Binance Pay. El admin verifica y acredita.</p>
        {binanceId && <p>Pay ID / cuenta: <strong>{binanceId}</strong></p>}
        <form onSubmit={deposit}>
          <label>Monto USDT<input type="number" min={5} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label>TxID / referencia Binance<input value={txRef} onChange={(e) => setTxRef(e.target.value)} required placeholder="Pegar TxID" /></label>
          <label>Nota / comprobante<input value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Opcional" /></label>
          <button className="btn primary" type="submit">Solicitar recarga</button>
        </form>
        {err && <div className="alert error">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}
        {waLink && (
          <a className="btn" href={waLink} target="_blank" rel="noreferrer">Enviar comprobante por WhatsApp</a>
        )}
      </section>

      <section className="panel">
        <h2>Historial</h2>
        {ledger.map((l) => (
          <div key={l.id} className="hist-item">
            <span className="st">{l.status}</span>
            <strong>{l.kind}</strong> {Number(l.amount_usd).toFixed(4)} USD
            <div className="muted">{l.tx_ref || l.note || ''} · {new Date(l.created_at).toLocaleString()}</div>
          </div>
        ))}
        {!ledger.length && <p className="muted">Sin movimientos</p>}
      </section>
    </main>
  );
}
