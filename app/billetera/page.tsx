'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BilleteraPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [amount, setAmount] = useState('5');
  const [txRef, setTxRef] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
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
    const hd = await h.json().catch(() => ({}));
    if (h.ok) setLedger(hd.ledger || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function deposit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setSending(true);
    try {
      let proofData: string | undefined;
      if (proofFile) {
        if (proofFile.size > 2_500_000) {
          setErr('La imagen debe ser menor a 2.5 MB');
          setSending(false);
          return;
        }
        proofData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
          reader.readAsDataURL(proofFile);
        });
      }
      const r = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          txRef,
          proofNote,
          proofImage: proofData,
        }),
      });
      const text = await r.text();
      let d: any = {};
      try { d = text ? JSON.parse(text) : {}; } catch { d = { error: text || 'Error' }; }
      if (!r.ok) {
        setErr(d.error || 'Error al enviar');
        return;
      }
      setMsg(d.message || 'Solicitud enviada');
      setWaLink(d.adminWhatsAppLink || '');
      setTxRef('');
      setProofFile(null);
      load();
    } catch (e: any) {
      setErr(e.message || 'Error de red');
    } finally {
      setSending(false);
    }
  }

  if (!user) {
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
      </p>
      <h1>Mi billetera</h1>

      <section className="panel">
        <p className="muted">Saldo disponible</p>
        <p className="price-usd" style={{ fontSize: '2.4rem', margin: '0.2rem 0 0.75rem' }}>
          {Number(user.balance_usd).toFixed(4)} USD
        </p>
        <p className="muted">Recarga mín. 5 USDT con Binance Pay. El admin verifica y acredita.</p>
        {binanceId && (
          <p>
            Pay ID: <strong>{binanceId}</strong>
          </p>
        )}

        <form onSubmit={deposit}>
          <label>
            Monto USDT
            <input type="number" min={5} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={sending} />
          </label>
          <label>
            TxID / referencia Binance
            <input value={txRef} onChange={(e) => setTxRef(e.target.value)} required placeholder="Pegar TxID" disabled={sending} />
          </label>
          <label>
            Nota
            <input value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Opcional" disabled={sending} />
          </label>
          <label>
            Comprobante (JPG/PNG)
            <input type="file" accept="image/jpeg,image/png,image/jpg,image/webp" onChange={(e) => setProofFile(e.target.files?.[0] || null)} disabled={sending} />
          </label>
          <button className="btn primary" type="submit" disabled={sending}>
            {sending ? 'Enviando solicitud…' : 'Solicitar recarga de saldo'}
          </button>
        </form>

        {sending && (
          <div className="alert ok" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="spinner" aria-hidden />
            Enviando solicitud…
          </div>
        )}
        {err && <div className="alert error">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}
        {waLink && (
          <a className="btn" href={waLink} target="_blank" rel="noreferrer">
            Enviar por WhatsApp
          </a>
        )}
      </section>

      <section className="panel">
        <h2>Historial de transacciones</h2>
        {ledger.map((l) => (
          <div key={l.id} className="hist-item">
            <span className="st">{l.status}</span>
            <strong>{l.kind}</strong> {Number(l.amount_usd).toFixed(4)} USD
            <div className="muted">
              {l.tx_ref || l.note || ''} · {new Date(l.created_at).toLocaleString()}
            </div>
          </div>
        ))}
        {!ledger.length && <p className="muted">Sin movimientos</p>}
      </section>
    </main>
  );
}
