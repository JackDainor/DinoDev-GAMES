'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CuentaPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch('/api/auth/me');
    if (!r.ok) {
      router.push('/login');
      return;
    }
    const d = await r.json();
    setUser(d.user);
    setWhatsapp(d.user.whatsapp || '');
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (newPass && newPass !== newPass2) {
      setErr('Las contraseñas no coinciden');
      return;
    }
    setSaving(true);
    try {
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
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <main className="wrap"><p className="muted">Cargando…</p></main>;

  return (
    <main className="wrap">
      <p style={{ display: 'flex', gap: 12 }}>
        <a href="/">← Tienda</a>
        <a href="/billetera">Mi billetera</a>
      </p>
      <h1>Mi cuenta</h1>
      <section className="panel">
        <h2>Datos personales</h2>
        <form onSubmit={saveProfile}>
          <label>
            Usuario
            <input value={user.username} disabled />
          </label>
          <label>
            Correo
            <input value={user.email} disabled />
          </label>
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
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
        {err && <div className="alert error">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}
      </section>
    </main>
  );
}
