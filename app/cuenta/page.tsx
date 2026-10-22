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
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [waLink, setWaLink] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const binanceId = process.env.NEXT_PUBLIC_BINANCE_PAY_ID || '';

  async function load() {
    const r = await fetch('/api/auth/me');
    if (!r.ok) {
      router.push('/login');
      return;
    }
    const d = await r.json();
    setUser(d.user);
    setWhatsapp(d.user.whatsapp || '');
    const h = await fetch('/api/wallet/history');
    const hd = await h.json();
    if (h.ok) setLedger(hd.ledger || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const r = await fetch('/api/auth/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatsapp,
        password: newPass && newPass === newPass2 ? newPass : undefined,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error || 'No se pudo guardar');
      return;
    }
    setMsg('Perfil actualizado');
    setNewPass('');
    setNewPass2('');
    load();
  }

  async function deposit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    let proofData: string | undefined;
    if (proofFile) {
      if (proofFile.size > 2_500_000) {
        setErr('La imagen debe ser menor a 2.5 MB');
        return;
      }
      const buf = await proofFile.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      proofData = `data:${proofFile.type || 'image/jpeg'};base64,${b64}`;
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
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error || 'Error');
      return;
    }
    setMsg(d.message);
    setWaLink(d.adminWhatsAppLink || '');
    setTxRef('');
    setProofFile(null);
    load();
  }

  if (!user) return <main className="wrap"><p className="muted">Cargando…</p></main>;

  return (
    <main className="wrap">
      <p><a href="/">← Tienda</a></p>
      <h1>Mi cuenta</h1>

      <section className="panel">
        <h2>Datos</h2>
        <form onSubmit={saveProfile}>
          <label>Usuario<input value={user.username} disabled /></label>
          <label>Correo<input value={user.email} disabled /></label>
          <label>
            WhatsApp
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5917xxxxxxx" />
          </label>
          <label>
            Nueva contraseña (opcional)
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} minLength={6} placeholder="Mín. 6 caracteres" />
          </label>
          <label>
            Confirmar contraseña
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} minLength={6} />
          </label>
          <button className="btn primary" type="submit">Guardar cambios</button>
        </form>
      </section>

      <section className="panel" id="billetera">
        <h2>Mi billetera</h2>
        <p className="price-usd" style={{ fontSize: '2rem' }}>{Number(user.balance_usd).toFixed(4)} USD</p>
        <p className="muted">Recarga mín. 5 USDT con Binance Pay. El admin verifica y acredita.</p>
        {binanceId && <p>Pay ID: <strong>{binanceId}</strong></p>}
        <form onSubmit={deposit}>
          <label>Monto USDT<input type="number" min={5} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label>TxID / referencia Binance<input value={txRef} onChange={(e) => setTxRef(e.target.value)} required placeholder="Pegar TxID" /></label>
          <label>Nota<input value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Opcional" /></label>
          <label>
            Comprobante (JPG/PNG)
            <input type="file" accept="image/jpeg,image/png,image/jpg,image/webp" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
          </label>
          <button className="btn primary" type="submit">Solicitar recarga de saldo</button>
        </form>
        {err && <div className="alert error">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}
        {waLink && (
          <a className="btn" href={waLink} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
        )}
      </section>

      <section className="panel">
        <h2>Historial de transacciones</h2>
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
