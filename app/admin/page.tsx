'use client';
import { useCallback, useEffect, useState } from 'react';

type Order = {
  id: string;
  status: string;
  game_name: string;
  item_name: string;
  player_id: string;
  player_name: string;
  player_region?: string;
  region_label?: string;
  usd_price: string | number;
  local_amount: string | number;
  local_currency: string;
  pay_country: string;
  created_at: string;
  expires_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Esperando pago',
  awaiting_confirmation: 'Cliente dice que pagó',
  paid: 'Pagado',
  processing: 'Enviando…',
  completed: 'Completado',
  expired: 'Expirado',
};

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem('dinodev_admin_secret') || '';
      if (s) {
        setSecret(s);
        setSaved(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (sec: string) => {
    if (!sec.trim()) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/orders', {
        headers: { 'x-admin-secret': sec.trim() },
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudieron cargar las órdenes.');
      setOrders(d.orders || []);
      setNotice(`Actualizado · ${d.orders?.length || 0} órdenes`);
    } catch (e: any) {
      setError(e.message || 'Error al cargar');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (saved && secret) load(secret);
  }, [saved, secret, load]);

  function login(e: React.FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem('dinodev_admin_secret', secret.trim());
    } catch {
      /* ignore */
    }
    setSaved(true);
    load(secret);
  }

  function logout() {
    try {
      sessionStorage.removeItem('dinodev_admin_secret');
    } catch {
      /* ignore */
    }
    setSaved(false);
    setSecret('');
    setOrders([]);
  }

  async function fulfill(id: string) {
    if (!confirm('¿Confirmaste el pago en el banco/Yape/Pix?\nSe enviarán los diamantes y se cobrará tu wallet de Shop2TopUp.')) {
      return;
    }
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret.trim(),
        },
        body: JSON.stringify({ id, action: 'confirm_and_fulfill' }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo enviar la recarga.');
      setNotice(d.message || `Orden ${id.slice(0, 8)}… enviada (${d.status})`);
      await load(secret);
    } catch (e: any) {
      setError(e.message || 'Error al cumplir la orden');
    } finally {
      setBusyId(null);
    }
  }

  if (!saved) {
    return (
      <main className="admin-wrap">
        <div className="admin-card login-card">
          <img src="/logo.png" alt="" className="admin-logo" />
          <h1>DinoDev Admin</h1>
          <p>Ingresa la contraseña de operador (`OPERATOR_SECRET` en Vercel).</p>
          <form onSubmit={login}>
            <input
              type="password"
              className="admin-input"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Contraseña admin"
              autoFocus
            />
            <button type="submit" className="admin-btn primary">
              Entrar
            </button>
          </form>
          {error && <p className="admin-err">{error}</p>}
        </div>
      </main>
    );
  }

  const pending = orders.filter((o) => o.status === 'awaiting_confirmation' || o.status === 'pending_payment');

  return (
    <main className="admin-wrap">
      <header className="admin-top">
        <div className="admin-brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>DinoDev Admin</strong>
            <small>Órdenes de pago y envío</small>
          </div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn" onClick={() => load(secret)} disabled={loading}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <button type="button" className="admin-btn ghost" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="admin-banner err">{error}</div>}
      {notice && <div className="admin-banner ok">{notice}</div>}

      <section className="admin-section">
        <h2>Pendientes ({pending.length})</h2>
        <p className="admin-hint">
          Revisa el pago en tu banco y luego pulsa <b>Aceptar y enviar diamantes</b>.
        </p>
        {pending.length === 0 ? (
          <p className="admin-empty">No hay órdenes pendientes ahora.</p>
        ) : (
          <div className="admin-list">
            {pending.map((o) => (
              <article key={o.id} className="admin-order">
                <div className="admin-order-main">
                  <span className={`st st-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
                  <h3>
                    {o.game_name} · {o.item_name}
                  </h3>
                  <p>
                    <b>{o.player_name}</b> · ID {o.player_id}
                    {o.player_region ? ` · Región ID: ${o.player_region}` : ''}
                  </p>
                  <p>
                    Paga <b>
                      {o.local_currency} {Number(o.local_amount).toFixed(2)}
                    </b>{' '}
                    ({o.pay_country}) · Costo proveedor USD {Number(o.usd_price).toFixed(4)}
                  </p>
                  <p className="mono">Orden: {o.id}</p>
                  <p className="muted">
                    Creada: {new Date(o.created_at).toLocaleString()} · Expira:{' '}
                    {new Date(o.expires_at).toLocaleString()}
                  </p>
                </div>
                {(o.status === 'awaiting_confirmation' || o.status === 'pending_payment') && (
                  <button
                    type="button"
                    className="admin-btn primary"
                    disabled={busyId === o.id}
                    onClick={() => fulfill(o.id)}
                  >
                    {busyId === o.id ? 'Enviando…' : 'Aceptar y enviar diamantes'}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Historial reciente</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Juego / Paquete</th>
                <th>Jugador</th>
                <th>Monto</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className={`st st-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
                  </td>
                  <td>
                    {o.game_name}
                    <br />
                    <small>{o.item_name}</small>
                  </td>
                  <td>
                    {o.player_name}
                    <br />
                    <small>{o.player_id}</small>
                  </td>
                  <td>
                    {o.local_currency} {Number(o.local_amount).toFixed(2)}
                  </td>
                  <td>
                    <small>{new Date(o.created_at).toLocaleString()}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="admin-foot">
        Contraseña = variable <code>OPERATOR_SECRET</code> en Vercel. No compartas esta URL.
      </p>
    </main>
  );
}
