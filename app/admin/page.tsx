'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Tab = 'orders' | 'catalog' | 'rates' | 'users' | 'deposits';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Esperando pago',
  awaiting_confirmation: 'Pendiente',
  paid: 'Pagado',
  processing: 'Procesando',
  completed: 'Completado',
  expired: 'Expirado',
  cancelled: 'Cancelada',
  not_paid: 'No pagado',
  failed: 'Falló',
};

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('orders');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [balance, setBalance] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [enabledIds, setEnabledIds] = useState<number[]>([]);
  const [catalogQ, setCatalogQ] = useState('');
  const [rateBo, setRateBo] = useState(12);
  const [rateBr, setRateBr] = useState(5.5);
  const [markupUsd, setMarkupUsd] = useState(0);
  const [users, setUsers] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [creditId, setCreditId] = useState('');
  const [creditAmt, setCreditAmt] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem('dinodev_admin_secret') || '';
      if (s) {
        setSecret(s);
        setSaved(true);
      }
    } catch { /* */ }
  }, []);

  const headers = useCallback(
    () => ({ 'x-admin-secret': secret.trim(), 'Content-Type': 'application/json' }),
    [secret]
  );

  const pending = useMemo(
    () => orders.filter((o) => o.status === 'awaiting_confirmation' || o.status === 'pending_payment'),
    [orders]
  );

  const refresh = useCallback(async () => {
    if (!secret.trim()) return;
    setError('');
    setLoadingAdmin(true);
    try {
      if (tab === 'orders') {
        const r = await fetch('/api/admin/orders', { headers: { 'x-admin-secret': secret.trim() } });
        const text = await r.text();
        let d: any = {};
        try { d = text ? JSON.parse(text) : {}; } catch { throw new Error('Respuesta inválida'); }
        if (!r.ok) throw new Error(d.error || 'Error pedidos');
        setOrders(d.orders || []);
        // try balance from account endpoint if exposed
        try {
          const br = await fetch('/api/admin/orders?balance=1', { headers: { 'x-admin-secret': secret.trim() } });
          const bt = await br.text();
          const bd = bt ? JSON.parse(bt) : {};
          if (bd.balance != null) setBalance(String(bd.balance));
        } catch {
          setBalance(null);
        }
        setNotice(`Actualizado · ${(d.orders || []).length} órdenes`);
      }
      if (tab === 'catalog' || tab === 'rates') {
        const r = await fetch('/api/admin/catalog', { headers: { 'x-admin-secret': secret.trim() } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setCategories(d.categories || []);
        setEnabledIds(d.enabledIds || []);
        if (d.settings) {
          setRateBo(d.settings.rateBo);
          setRateBr(d.settings.rateBr);
          setMarkupUsd(d.settings.markupUsd);
        }
      }
      if (tab === 'users') {
        const r = await fetch('/api/admin/resellers', { headers: { 'x-admin-secret': secret.trim() } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setUsers(d.users || []);
      }
      if (tab === 'deposits') {
        const r = await fetch('/api/admin/deposits', { headers: { 'x-admin-secret': secret.trim() } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDeposits(d.deposits || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingAdmin(false);
    }
  }, [secret, tab]);

  useEffect(() => {
    if (saved && secret) refresh();
  }, [saved, secret, tab]); // eslint-disable-line

  async function fulfill(id: string) {
    setBusyId(id);
    setError('');
    try {
      const r = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id, action: 'fulfill' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al enviar');
      setNotice('Recarga enviada');
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  }

  async function cancelOrder(id: string) {
    setBusyId(id);
    try {
      await fetch('/api/admin/orders', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id, action: 'cancel' }),
      });
      refresh();
    } finally {
      setBusyId('');
    }
  }

  if (!saved) {
    return (
      <main className="admin-shell">
        <form
          className="admin-hero-card"
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem('dinodev_admin_secret', secret.trim());
            setSaved(true);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DinoDev" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
          <h1 style={{ margin: 0 }}>DinoDev Admin</h1>
          <p className="muted" style={{ margin: 0 }}>
            Ingresa la contraseña de operador (<code>OPERATOR_SECRET</code> en Vercel).
          </p>
          <input
            type="password"
            placeholder="Contraseña admin"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
          <button type="submit" className="btn primary">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  const tabLabel: Record<Tab, string> = {
    orders: 'Pedidos',
    catalog: 'Juegos / Gift cards',
    rates: 'Precios USD / TC',
    users: 'Usuarios / saldo',
    deposits: 'Depósitos USDT',
  };

  return (
    <main className="admin-shell">
      <div className="admin-top">
        <div className="brand-row">
          <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)}>
            ☰ Menú
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
          <div>
            <strong>DinoDev Admin</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {tabLabel[tab]}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={refresh}>
            Actualizar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              sessionStorage.removeItem('dinodev_admin_secret');
              setSaved(false);
            }}
          >
            Salir
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <strong style={{ marginBottom: 8 }}>Admin</strong>
            {(Object.keys(tabLabel) as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                className="linkish"
                onClick={() => {
                  setTab(k);
                  setMenuOpen(false);
                }}
              >
                {tabLabel[k]}
              </button>
            ))}
            <a href="/" onClick={() => setMenuOpen(false)}>
              ← Ir a la tienda
            </a>
          </aside>
        </>
      )}

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}
      {loadingAdmin && (
        <div className="alert ok" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="spinner" /> Cargando datos del admin…
        </div>
      )}

      {tab === 'orders' && (
        <>
          <div className="stat-card">
            <div className="muted">Saldo Shop2TopUp</div>
            <strong>{balance != null ? `${balance} USD` : '—'}</strong>
            {balance == null && (
              <div className="muted" style={{ fontSize: 12 }}>
                Si no carga, revisa la API key en Vercel.
              </div>
            )}
          </div>

          <h2>Pendientes ({pending.length})</h2>
          <p className="muted">
            Revisa el pago y luego pulsa <strong>Aceptar y enviar diamantes</strong>.
          </p>
          {!pending.length && <div className="stat-card muted">No hay órdenes pendientes ahora.</div>}
          {pending.map((o) => (
            <div key={o.id} className="admin-card">
              <span className="badge wait">{STATUS_LABEL[o.status] || o.status}</span>
              <strong>
                {o.game_name} · {o.item_name}
              </strong>
              <div className="muted">
                {o.player_name || '—'} ({o.player_id}) · {o.pay_method}
              </div>
              <div className="muted">
                {o.local_currency} {o.local_amount} · USD {o.price_usd}
              </div>
              <small className="muted">{o.id}</small>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busyId === o.id}
                  onClick={() => fulfill(o.id)}
                >
                  {busyId === o.id ? 'Enviando…' : 'Aceptar · Shop2TopUp'}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busyId === o.id}
                  onClick={async () => {
                    setBusyId(o.id);
                    try {
                      const r = await fetch('/api/admin/orders', {
                        method: 'POST',
                        headers: headers(),
                        body: JSON.stringify({ id: o.id, action: 'fulfill_manual' }),
                      });
                      const d = await r.json();
                      if (!r.ok) setError(d.error || 'Error');
                      else {
                        setNotice('Marcado completado (recarga externa)');
                        refresh();
                      }
                    } finally {
                      setBusyId('');
                    }
                  }}
                >
                  Aceptar · externo
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busyId === o.id}
                  onClick={async () => {
                    setBusyId(o.id);
                    try {
                      await fetch('/api/admin/orders', {
                        method: 'POST',
                        headers: headers(),
                        body: JSON.stringify({ id: o.id, action: 'not_paid' }),
                      });
                      refresh();
                    } finally {
                      setBusyId('');
                    }
                  }}
                >
                  No pagó
                </button>
                <button type="button" className="btn" disabled={busyId === o.id} onClick={() => cancelOrder(o.id)}>
                  Cancelar
                </button>
              </div>
            </div>
          ))}

          <h2>Historial reciente</h2>
          <div className="table-wrap">
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
                      <span
                        className={`badge ${
                          o.status === 'completed' ? 'ok' : o.status === 'cancelled' || o.status === 'failed' ? 'bad' : 'wait'
                        }`}
                      >
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                    </td>
                    <td>
                      {o.game_name}
                      <div className="muted">{o.item_name}</div>
                    </td>
                    <td>
                      {o.player_name || '—'}
                      <div className="muted">{o.player_id}</div>
                    </td>
                    <td>
                      {o.local_currency} {o.local_amount}
                    </td>
                    <td className="muted">{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'catalog' && (
        <div>
          <p className="muted">Marca qué juegos / gift cards se muestran en la tienda.</p>
          <input
            placeholder="Buscar…"
            value={catalogQ}
            onChange={(e) => setCatalogQ(e.target.value)}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => setEnabledIds(categories.map((c) => c.id))}>
              Todos
            </button>
            <button type="button" className="btn" onClick={() => setEnabledIds([])}>
              Ninguno
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                const r = await fetch('/api/admin/catalog', {
                  method: 'POST',
                  headers: headers(),
                  body: JSON.stringify({ enabledIds }),
                });
                const d = await r.json();
                if (!r.ok) setError(d.error);
                else { setNotice(`Guardado: ${enabledIds.length} productos activos`); setTimeout(refresh, 300); }
              }}
            >
              Guardar catálogo
            </button>
          </div>
          {categories
            .filter((c) => !catalogQ || c.name.toLowerCase().includes(catalogQ.toLowerCase()))
            .map((c) => {
              const on = enabledIds.includes(c.id);
              return (
                <label key={c.id} className="admin-card" style={{ display: 'flex', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setEnabledIds((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                    }
                  />
                  <div>
                    <strong>{c.name}</strong>
                    <small className="muted"> ID {c.id}</small>
                  </div>
                </label>
              );
            })}
        </div>
      )}

      {tab === 'rates' && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await fetch('/api/admin/catalog', {
              method: 'POST',
              headers: headers(),
              body: JSON.stringify({ rateBo, rateBr, markupUsd }),
            });
            const d = await r.json();
            if (!r.ok) setError(d.error);
            else setNotice(`Guardado: ganancia $${markupUsd} · BO ${rateBo} · BR ${rateBr}`);
          }}
        >
          <h2>Tipo de cambio y ganancia en USD</h2>
          <p className="muted">Precio venta = costo Shop2TopUp + ganancia fija en USD.</p>
          <label>
            Ganancia por pack en USD (pon 0 para mismo precio que Shop2TopUp)
            <input type="number" step="0.01" min={0} value={markupUsd} onChange={(e) => setMarkupUsd(Number(e.target.value))} />
          </label>
          <label>
            TC Bolivia (Bs por 1 USD)
            <input type="number" step="0.01" min={0.01} value={rateBo} onChange={(e) => setRateBo(Number(e.target.value))} />
          </label>
          <label>
            TC Brasil (R$ por 1 USD)
            <input type="number" step="0.01" min={0.01} value={rateBr} onChange={(e) => setRateBr(Number(e.target.value))} />
          </label>
          <button type="submit" className="btn primary">
            Guardar
          </button>
        </form>
      )}

      {tab === 'users' && (
        <div>
          <form
            className="panel"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await fetch('/api/admin/resellers', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ action: 'credit', id: creditId, amount: Number(creditAmt) }),
              });
              const d = await r.json();
              if (!r.ok) setError(d.error);
              else {
                setNotice(`Acreditado. Nuevo saldo: ${d.user?.balance_usd}`);
                setCreditAmt('');
                refresh();
              }
            }}
          >
            <h2>Acreditar saldo USD</h2>
            <select value={creditId} onChange={(e) => setCreditId(e.target.value)} required>
              <option value="">Usuario…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.balance_usd} USD)
                </option>
              ))}
            </select>
            <input type="number" step="0.01" min="0.01" placeholder="Monto USD" value={creditAmt} onChange={(e) => setCreditAmt(e.target.value)} required />
            <button type="submit" className="btn primary">
              Acreditar
            </button>
          </form>
          {users.map((u) => (
            <div key={u.id} className="admin-card">
              <strong>
                {u.username} · {u.role}
              </strong>
              <div className="muted">
                {u.email} · {u.whatsapp || '—'}
              </div>
              <div className="price-usd">{Number(u.balance_usd).toFixed(4)} USD</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'deposits' &&
        deposits.map((d) => (
          <div key={d.id} className="admin-card">
            <span className={`badge ${d.status === 'completed' ? 'ok' : d.status === 'pending' ? 'wait' : 'bad'}`}>
              {d.status}
            </span>
            <strong>
              {d.username} · {Number(d.amount_usd).toFixed(2)} USDT
            </strong>
            <div className="muted">
              {d.email} · {d.whatsapp || '—'}
            </div>
            <div className="muted">Tx: {d.tx_ref}</div>
            {d.proof_note && <div className="muted">{d.proof_note}</div>}
            {d.status === 'pending' && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    await fetch('/api/admin/deposits', {
                      method: 'POST',
                      headers: headers(),
                      body: JSON.stringify({ id: d.id, action: 'approve' }),
                    });
                    refresh();
                  }}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    await fetch('/api/admin/deposits', {
                      method: 'POST',
                      headers: headers(),
                      body: JSON.stringify({ id: d.id, action: 'reject' }),
                    });
                    refresh();
                  }}
                >
                  Rechazar
                </button>
              </div>
            )}
          </div>
        ))}
    </main>
  );
}
