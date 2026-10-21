'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, whatsapp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      router.push('/cuenta');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <form className="form-card" onSubmit={onSubmit}>
        <h1>Crear cuenta</h1>
        {error && <div className="alert error">{error}</div>}
        <label>Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label>Contraseña (mín 6)<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
        <label>WhatsApp<input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5917xxxxxxx" /></label>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? '…' : 'Registrarme'}</button>
        <a href="/login">Ya tengo cuenta</a>
      </form>
    </main>
  );
}
