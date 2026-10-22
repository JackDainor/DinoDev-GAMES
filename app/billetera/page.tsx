'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const BINANCE_UID = '1075673223';
const BINANCE_NAME = 'Carlos_Dainor';

export default function BilleteraPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [amount, setAmount] = useState('5');
  const [proofNote, setProofNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [waLink, setWaLink] = useState('');

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
      if (!proofFile) {
        setErr('Sube la foto del comprobante de Binance Pay.');
        setSending(false);
        return;
      }
      if (proofFile.size > 2_500_000) {
        setErr('La imagen debe ser menor a 2.5 MB');
        setSending(false);
        return;
      }
      const proofData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(proofFile);
      });

      const r = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          proofNote,
          proofImage: proofData,
        }),
      });
      const text = await r.text();
      let d: any = {};
      try {
        d = text ? JSON.parse(text) : {};
      } catch {
        d = { error: text || 'Error' };
      }
      if (!r.ok) {
        setErr(d.error || 'Error al enviar');
        return;
      }
      setMsg(d.message || 'Solicitud enviada');
      setWaLink(d.adminWhatsAppLink || '');
      setProofFile(null);
      setProofNote('');
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

        <div className="panel" style={{ marginTop: 12, background: 'rgba(0,0,0,0.25)' }}>
          <strong>Dónde pagar (Binance Pay)</strong>
          <p style={{ margin: '8px 0 4px' }}>
            UID: <strong>{BINANCE_UID}</strong>
          </p>
          <p style={{ margin: '0 0 4px' }}>
            Nombre: <strong>{BINANCE_NAME}</strong>
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Envía el monto exacto en USDT y sube la captura del comprobante.
          </p>
        </div>

        <form onSubmit={deposit} style={{ marginTop: 14 }}>
          <label>
            Monto USDT
            <input
              type="number"
              min={5}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={sending}
            />
          </label>
          <label>
            Nota (opcional)
            <input
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              placeholder="Opcional"
              disabled={sending}
            />
          </label>
          <label>
            Comprobante (JPG/PNG) — obligatorio
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp"
              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
              disabled={sending}
              required
            />
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
