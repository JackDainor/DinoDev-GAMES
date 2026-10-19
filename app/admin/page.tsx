'use client';
import { useCallback, useEffect, useState } from 'react';

type PayOrder = {
  id: string;
  status: string;
  game_name: string;
  item_name: string;
  player_id: string;
  player_name: string;
  local_amount: string | number;
  local_currency: string;
  pay_country?: string;
  created_at?: string;
};

type ResOrder = {
  id: string;
  status: string;
  game_name: string;
  item_name: string;
  player_id: string;
  player_name?: string;
  cost_usd: string;
  price_usd: string;
  username?: string;
  email?: string;
  created_at?: string;
};

type Reseller = {
  id: string;
  email: string;
  username: string;
  balance_usd: string;
  active: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Esperando pago',
  awaiting_confirmation: 'Cliente dice que pagó',
  pending: 'Pendiente envío',
  completed: 'Completado',
  expired: 'Expirado',
  cancelled: 'Cancelada',
  not_paid: 'No pagó',
  rejected: 'Rechazada',
  failed: 'Falló',
};

type Tab = 'qr' | 'reseller_orders' | 'resellers' | 'settings' | 'catalog';

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('qr');
  const [orders, setOrders] = useState<PayOrder[]>([]);
  const [resOrders, setResOrders] = useState<ResOrder[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [wallet, setWallet] = useState<{ balance: string | null; currency: string; note?: string } | null>(null);
  const [gamesPct, setGamesPct] = useState(20);
  const [pinsPct, setPinsPct] = useState(10);
  const [bigCategories, setBigCategories] = useState<{ id: number; name: string }[]>([]);
  const [enabledBig, setEnabledBig] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // create reseller form
  const [newEmail, setNewEmail] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [creditId, setCreditId] = useState('');
  const [creditAmt, setCreditAmt] = useState('');
  const [catalogCats, setCatalogCats] = useState<{ id: number; name: string; description?: string; known?: boolean }[]>([]);
  const [enabledIds, setEnabledIds] = useState<number[]>([]);
  const [catalogQ, setCatalogQ] = useState('');


  useEffect(() => {
    try {
      const s = sessionStorage.getItem('dinodev_admin_secret') || '';
      if (s) {
        setSecret(s);
        setSaved(true);
      }
    } catch { /* ignore */ }
  }, []);

  const headers = useCallback(() => ({ 'x-admin-secret': secret.trim(), 'Content-Type': 'application/json' }), [secret]);

  const loadQr = useCallback(async () => {
    const r = await fetch('/api/admin/orders', { headers: { 'x-admin-secret': secret.trim() } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    setOrders(d.orders || []);
    if (d.wallet) setWallet(d.wallet);
  }, [secret]);

  const loadResOrders = useCallback(async () => {
    const r = await fetch('/api/admin/reseller-orders', { headers: { 'x-admin-secret': secret.trim() } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    setResOrders(d.orders || []);
  }, [secret]);

  const loadResellers = useCallback(async () => {
    const r = await fetch('/api/admin/resellers', { headers: { 'x-admin-secret': secret.trim() } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    setResellers(d.resellers || []);
  }, [secret]);

  const loadCatalogAdmin = useCallback(async () => {
    const r = await fetch('/api/admin/catalog', { headers: { 'x-admin-secret': secret.trim() } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error catálogo');
    setCatalogCats(d.categories || []);
    setEnabledIds(d.enabledIds || []);
  }, [secret]);

  const loadSettings = useCallback(async () => {
    const r = await fetch('/api/admin/settings', { headers: { 'x-admin-secret': secret.trim() } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    setGamesPct(d.margins?.gamesPct ?? 20);
    setPinsPct(d.margins?.pinsPct ?? 10);
    setEnabledBig(d.margins?.enabledBigCategories || []);
    setBigCategories(
      (d.bigCategories || []).map((c: any) => ({
        id: Number(c.id),
        name: c.name || c.big_category_name || String(c.id),
      }))
    );
  }, [secret]);

  const refresh = useCallback(async () => {
    if (!secret.trim()) return;
    setLoading(true);
    setError('');
    try {
      if (tab === 'qr') await loadQr();
      if (tab === 'reseller_orders') await loadResOrders();
      if (tab === 'resellers') await loadResellers();
      if (tab === 'settings') await loadSettings();
      if (tab === 'catalog') await loadCatalogAdmin();
      setNotice('Actualizado');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [secret, tab, loadQr, loadResOrders, loadResellers, loadSettings, loadCatalogAdmin]);

  useEffect(() => {
    if (saved && secret) refresh();
  }, [saved, secret, tab]); // eslint-disable-line

  function login(e: React.FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem('dinodev_admin_secret', secret.trim());
    } catch { /* ignore */ }
    setSaved(true);
  }

  function logout() {
    try {
      sessionStorage.removeItem('dinodev_admin_secret');
    } catch { /* ignore */ }
    setSaved(false);
    setSecret('');
  }

  async function fulfillQr(id: string) {
    if (!confirm('¿Enviar diamantes (pedido QR)?')) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/checkout/${id}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: 'confirm_and_fulfill', secret: secret.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setNotice('Pedido QR completado');
      await loadQr();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function qrStatus(id: string, action: string, label: string) {
    if (!confirm(label)) return;
    setBusyId(id);
    try {
      const r = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      await loadQr();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function fulfillRes(id: string) {
    if (!confirm('¿Enviar producto al jugador (pedido revendedor)?')) return;
    setBusyId(id);
    try {
      const r = await fetch('/api/admin/reseller-orders', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id, action: 'fulfill' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setNotice(d.message || 'OK');
      await loadResOrders();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRes(id: string) {
    if (!confirm('Rechazar y devolver saldo al revendedor?')) return;
    setBusyId(id);
    try {
      const r = await fetch('/api/admin/reseller-orders', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id, action: 'reject' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      await loadResOrders();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function createReseller(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await fetch('/api/admin/resellers', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          action: 'create',
          email: newEmail,
          username: newUser,
          password: newPass,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setNotice(`Revendedor ${newUser} creado`);
      setNewEmail('');
      setNewUser('');
      setNewPass('');
      await loadResellers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function creditReseller(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await fetch('/api/admin/resellers', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          action: 'credit',
          id: creditId,
          amount: Number(creditAmt),
          note: 'Acreditación manual',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setNotice(`Saldo acreditado. Nuevo: ${d.reseller?.balance_usd} USD`);
      setCreditAmt('');
      await loadResellers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          gamesPct,
          pinsPct,
          enabledBigCategories: enabledBig,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setNotice('Márgenes y categorías guardados');
    } catch (err: any) {
      setError(err.message);
    }
  }

  function toggleBig(id: number) {
    setEnabledBig((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (!saved) {
    return (
      <main className="admin-wrap">
        <form className="admin-login" onSubmit={login}>
          <h1>Admin DinoDev</h1>
          <input
            type="password"
            placeholder="OPERATOR_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button type="submit" className="admin-btn primary">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-wrap">
      <div className="admin-top">
        <h1>Admin DinoDev</h1>
        <div className="admin-top-actions">
          <button type="button" className="admin-btn" onClick={refresh} disabled={loading}>
            {loading ? '…' : 'Actualizar'}
          </button>
          <button type="button" className="admin-btn" onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      {wallet && (
        <div className="wallet-card">
          <small>Saldo Shop2TopUp</small>
          <strong>{wallet.balance != null ? `${wallet.currency} ${wallet.balance}` : '—'}</strong>
        </div>
      )}

      <div className="admin-tabs">
        {(
          [
            ['qr', 'Pedidos QR'],
            ['reseller_orders', 'Pedidos revendedores'],
            ['resellers', 'Revendedores'],
            ['settings', 'Márgenes'],
            ['catalog', 'Juegos / Gift cards'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="admin-banner err">{error}</div>}
      {notice && <div className="admin-banner ok">{notice}</div>}

      {tab === 'qr' && (
        <div className="admin-list">
          {orders.length === 0 && <p className="muted">Sin pedidos QR</p>}
          {orders.map((o) => (
            <div key={o.id} className="admin-card">
              <div>
                <span className={`st st-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
                <strong>
                  {o.game_name} · {o.item_name}
                </strong>
                <small>
                  {o.player_name} ({o.player_id}) · {o.local_currency} {Number(o.local_amount).toFixed(2)}
                </small>
                <small className="mono">{o.id}</small>
              </div>
              {(o.status === 'awaiting_confirmation' || o.status === 'pending_payment') && (
                <div className="admin-order-btns">
                  {o.status === 'awaiting_confirmation' && (
                    <button type="button" className="admin-btn primary" disabled={busyId === o.id} onClick={() => fulfillQr(o.id)}>
                      Enviar diamantes
                    </button>
                  )}
                  <button type="button" className="admin-btn" disabled={busyId === o.id} onClick={() => qrStatus(o.id, 'mark_not_paid', 'Marcar no pagó')}>
                    No pagó
                  </button>
                  <button type="button" className="admin-btn ghost" disabled={busyId === o.id} onClick={() => qrStatus(o.id, 'mark_cancelled', 'Cancelar')}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'reseller_orders' && (
        <div className="admin-list">
          {resOrders.length === 0 && <p className="muted">Sin pedidos de revendedores</p>}
          {resOrders.map((o) => (
            <div key={o.id} className="admin-card">
              <div>
                <span className={`st st-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
                <strong>
                  {o.game_name} · {o.item_name}
                </strong>
                <small>
                  Revendedor: {o.username} ({o.email})
                </small>
                <small>
                  Jugador: {o.player_name || '—'} ({o.player_id})
                </small>
                <small>
                  Costo {Number(o.cost_usd).toFixed(4)} → cobrado {Number(o.price_usd).toFixed(4)} USD
                </small>
                <small className="mono">{o.id}</small>
              </div>
              {o.status === 'pending' && (
                <div className="admin-order-btns">
                  <button type="button" className="admin-btn primary" disabled={busyId === o.id} onClick={() => fulfillRes(o.id)}>
                    Enviar
                  </button>
                  <button type="button" className="admin-btn" disabled={busyId === o.id} onClick={() => rejectRes(o.id)}>
                    Rechazar + reembolso
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'resellers' && (
        <div className="admin-section">
          <form className="admin-form" onSubmit={createReseller}>
            <h3>Crear revendedor</h3>
            <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            <input placeholder="Username" value={newUser} onChange={(e) => setNewUser(e.target.value)} required />
            <input placeholder="Contraseña (mín 6)" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={6} />
            <button type="submit" className="admin-btn primary">
              Crear
            </button>
          </form>

          <form className="admin-form" onSubmit={creditReseller}>
            <h3>Acreditar saldo USD</h3>
            <select value={creditId} onChange={(e) => setCreditId(e.target.value)} required>
              <option value="">Elegir revendedor…</option>
              {resellers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.username} ({r.balance_usd} USD)
                </option>
              ))}
            </select>
            <input placeholder="Monto USD" type="number" step="0.01" min="0.01" value={creditAmt} onChange={(e) => setCreditAmt(e.target.value)} required />
            <button type="submit" className="admin-btn primary">
              Acreditar
            </button>
          </form>

          <div className="admin-list">
            {resellers.map((r) => (
              <div key={r.id} className="admin-card">
                <div>
                  <strong>{r.username}</strong>
                  <small>{r.email}</small>
                  <small>
                    Saldo: <b>{Number(r.balance_usd).toFixed(4)} USD</b> · {r.active ? 'Activo' : 'Inactivo'}
                  </small>
                  <small className="mono">{r.id}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <form className="admin-form" onSubmit={saveSettings}>
          <h3>Márgenes (%)</h3>
          <label>
            Recargas de juegos
            <input type="number" min={0} step={0.1} value={gamesPct} onChange={(e) => setGamesPct(Number(e.target.value))} />
          </label>
          <label>
            Pines / gift cards (Razer, etc.)
            <input type="number" min={0} step={0.1} value={pinsPct} onChange={(e) => setPinsPct(Number(e.target.value))} />
          </label>
          <p className="muted">Precio panel = costo Shop2TopUp × (1 + % / 100)</p>

          <h3>Categorías visibles para revendedores</h3>
          <p className="muted">Si no marcas ninguna, se muestran todas. Si marcas, solo esas.</p>
          <div className="chip-row">
            {bigCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${enabledBig.includes(c.id) ? 'active' : ''}`}
                onClick={() => toggleBig(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button type="submit" className="admin-btn primary">
            Guardar
          </button>
        </form>
      )}

      {tab === 'catalog' && (
        <div className="admin-section">
          <p className="muted">
            Marca los productos de Shop2TopUp que quieres mostrar en la tienda (juegos y gift cards).
            Luego pulsa Guardar.
          </p>
          <input
            placeholder="Buscar… Free Fire, Roblox, Steam…"
            value={catalogQ}
            onChange={(e) => setCatalogQ(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setEnabledIds(catalogCats.map((c) => c.id))}
            >
              Marcar todos
            </button>
            <button type="button" className="admin-btn" onClick={() => setEnabledIds([])}>
              Quitar todos
            </button>
            <button
              type="button"
              className="admin-btn primary"
              onClick={async () => {
                try {
                  const r = await fetch('/api/admin/catalog', {
                    method: 'POST',
                    headers: headers(),
                    body: JSON.stringify({ enabledIds }),
                  });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.error);
                  setNotice(`Guardado: ${enabledIds.length} productos visibles`);
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Guardar selección
            </button>
          </div>
          <div className="admin-list">
            {catalogCats
              .filter((c) => !catalogQ.trim() || c.name.toLowerCase().includes(catalogQ.toLowerCase()))
              .map((c) => {
                const on = enabledIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="admin-card"
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setEnabledIds((prev) =>
                          on ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                        )
                      }
                    />
                    <div>
                      <strong>{c.name}</strong>
                      <small className="mono"> ID {c.id}</small>
                      {c.known && <small> · conocido</small>}
                      {c.description && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.description.slice(0, 120)}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
          </div>
        </div>
      )}

    </main>
  );
}
