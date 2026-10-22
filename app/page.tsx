'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Game = { slug: string; name: string; short: string; bigCategoryId: number };
type Region = { id: number; name: string; region: string };
type Product = {
  id: number; name: string; priceUsd: number; priceLocal: number;
  symbolLocal: string; currencyLocal: string; region?: string; costUsd?: number;
  productType?: string;
};
type ReqField = {
  field_name: string; label: string; data_type: string;
  required: boolean; select_options: any[];
};
type HistOrder = {
  id: string; status: string; game_name?: string; item_name?: string;
  player_id?: string; player_name?: string; price_usd?: string;
  local_amount?: string; local_currency?: string;
};
type PayOrder = {
  id: string; status: string; priceUsd: number; localAmount?: number;
  localCurrency?: string; symbolLocal?: string; qrUrl?: string | null;
};

const STATUS: Record<string, string> = {
  pending_payment: 'Esperando pago',
  awaiting_confirmation: 'Verificando pago…',
  completed: 'Completado ✓',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  not_paid: 'No pagado',
  failed: 'Falló el envío',
};

const WA = '5511966019490';
const JACK_WA = '59163614354';
const JACK_MSG = 'Hola Jack Dainor, quisiera un sitio web igual al de DinoDev GAMES';

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [market, setMarket] = useState<'BO' | 'BR' | 'BINANCE'>('BO');
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<ReqField[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [player, setPlayer] = useState<any>(null);
  const [category, setCategory] = useState<{ id: number; name: string; region: string } | null>(null);
  const [payOrder, setPayOrder] = useState<PayOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hist, setHist] = useState<HistOrder[]>([]);
  const [rates, setRates] = useState({ rateBo: 12, rateBr: 5.5 });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (r) => { if (r.ok) setUser((await r.json()).user); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/catalog?list=games', { cache: 'no-store' });
        const text = await r.text();
        let d: any = {};
        try { d = text ? JSON.parse(text) : {}; } catch { throw new Error('Respuesta inválida del catálogo'); }
        if (!r.ok) throw new Error(d.error || `No se pudo cargar juegos (${r.status})`);
        if (d.settings) setRates({ rateBo: d.settings.rateBo, rateBr: d.settings.rateBr });
        if (d.games?.length) {
          setGames(d.games);
          setGame(d.games[0]);
        } else {
          setError('No hay juegos activos. En /admin → Juegos, marca algunos y guarda.');
        }
      } catch (e: any) {
        setError(e.message || 'Error cargando juegos');
      }
    })();
  }, []);

  const apiMarket = market === 'BINANCE' ? 'BO' : market;

  const loadProducts = useCallback(async (g: Game, mkt: string, rid?: number | null) => {
    setLoading(true);
    setError('');
    setProducts([]);
    setSelected(null);
    setPlayer(null);
    setPayOrder(null);
    setFields({});
    try {
      const q = new URLSearchParams({ bigCategoryId: String(g.bigCategoryId), market: mkt });
      if (rid) q.set('regionId', String(rid));
      const r = await fetch(`/api/catalog?${q}`, { cache: 'no-store' });
      const text = await r.text();
      let d: any = {};
      try { d = text ? JSON.parse(text) : {}; } catch { throw new Error('Respuesta inválida del catálogo'); }
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo cargar');
      if (d.settings) setRates({ rateBo: d.settings.rateBo, rateBr: d.settings.rateBr });
      setRegions(d.regions || []);
      setRegionId(d.category?.id ?? null);
      setCategory(d.category || null);
      setProducts(d.products || []);
      setRequirements(d.requirements || []);
      if (d.products?.[0]) setSelected(d.products[0].id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (game) loadProducts(game, apiMarket, null);
  }, [game, apiMarket, loadProducts]);

  const product = useMemo(() => products.find((p) => p.id === selected), [products, selected]);

  const needsPlayerFields = requirements.some((r) => r.required) || requirements.length > 0;
  const isGiftLike = useMemo(() => {
    const name = `${game?.name || ''} ${product?.name || ''} ${product?.productType || ''}`;
    return /gift|voucher|card|codigo|razer|steam|roblox|telegram|apple|google/i.test(name);
  }, [game, product]);

  function rememberOrder(id: string) {
    try {
      const arr = JSON.parse(localStorage.getItem('dinodev_order_ids') || '[]');
      localStorage.setItem(
        'dinodev_order_ids',
        JSON.stringify([id, ...arr.filter((x: string) => x !== id)].slice(0, 40))
      );
    } catch { /* */ }
  }

  async function loadHistory() {
    try {
      let ids: string[] = [];
      try { ids = JSON.parse(localStorage.getItem('dinodev_order_ids') || '[]'); } catch { ids = []; }
      const mainField =
        fields.player_id || fields.username || fields.email || Object.values(fields)[0] || '';
      const body: any = { ids };
      if (mainField) body.playerId = mainField;
      const r = await fetch('/api/my-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) setHist(d.orders || []);
    } catch { /* */ }
  }

  useEffect(() => {
    loadHistory();
    const t = setInterval(loadHistory, 20000);
    return () => clearInterval(t);
  }, []);

  async function validate() {
    if (!selected || !category) return setError('Elige un paquete');
    setBusy(true);
    setBusyLabel('Verificando…');
    setError('');
    setNotice('');
    setPayOrder(null);
    try {
      // Gift cards without required fields: skip provider validate
      if (!needsPlayerFields && isGiftLike) {
        const label = Object.values(fields).filter(Boolean).join(' · ') || 'Gift card';
        setPlayer({ player_id: label || 'gift', player_name: label || 'Gift card', region: '' });
        setNotice('Listo para comprar (gift card / código).');
        return;
      }

      const playerId =
        fields.player_id ||
        fields.username ||
        fields.user_id ||
        fields.userid ||
        fields.email ||
        Object.values(fields).find(Boolean) ||
        '';

      if (!playerId.trim()) {
        throw new Error('Completa los datos pedidos para este producto.');
      }

      const r = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selected,
          categoryId: category.id,
          playerId: playerId.trim(),
          ...fields,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo validar');
      setPlayer(d.player);
      setNotice(
        `Cuenta: ${d.player.player_name}${d.player.region ? ` · ${d.player.region}` : ''}`
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function buy(payMethod: 'wallet' | 'qr') {
    if (!product || !player || !category || !game) return;
    setBusy(true);
    setBusyLabel('Creando orden…');
    setError('');
    try {
      const method =
        market === 'BINANCE' && user ? 'wallet' : payMethod === 'wallet' && user ? 'wallet' : 'qr';
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: product.id,
          categoryId: category.id,
          playerId: player.player_id,
          playerName: player.player_name,
          gameName: game.name,
          gameSlug: game.slug,
          itemName: product.name,
          regionLabel: product.region || category.region,
          payCountry: market === 'BINANCE' ? 'BO' : market,
          payMethod: method,
          costUsd: product.costUsd,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'Error al crear orden');
      setNotice(d.message || 'Orden creada');
      if (d.order) setPayOrder(d.order);
      if (d.order?.id) rememberOrder(d.order.id);
      await loadHistory();
      if (user) {
        const me = await fetch('/api/auth/me').then((x) => x.json()).catch(() => ({}));
        if (me.user) setUser(me.user);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function claimPaid(orderId: string) {
    setBusy(true);
    setBusyLabel('Registrando pago…');
    setError('');
    try {
      const r = await fetch(`/api/checkout/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_paid' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo registrar');
      setNotice(d.message || 'Pago registrado. Verificando…');
      if (payOrder?.id === orderId) setPayOrder({ ...payOrder, status: 'awaiting_confirmation' });
      await loadHistory();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  const showFieldPanel = !!product;

  return (
    <main className="wrap">
      <header className="topbar">
        <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)}>☰ Menú</button>
        <a className="brand" href="/">
          <img src="/logo.png" alt="DinoDev" />
          <span>
            DinoDev <span style={{ color: 'var(--accent)' }}>GAMES</span>
            <small>RECARGAS ONLINE</small>
          </span>
        </a>
        <div className="top-links">
          {user ? (
            <a className="btn" href="/cuenta">{user.username}</a>
          ) : (
            <>
              <a className="btn" href="/login">Entrar</a>
              <a className="btn primary" href="/register">Registro</a>
            </>
          )}
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <strong style={{ marginBottom: 8 }}>DinoDev GAMES</strong>
            <a href="/" onClick={() => setMenuOpen(false)}>🏠 Inicio</a>
            <a href="#recargar" onClick={() => setMenuOpen(false)}>🎮 Catálogo</a>
            <a href="#como" onClick={() => setMenuOpen(false)}>❓ Cómo funciona</a>
            <a href="#historial" onClick={() => setMenuOpen(false)}>📋 Mis pedidos</a>
            {user ? (
              <>
                <a href="/cuenta" onClick={() => setMenuOpen(false)}>👤 Mi cuenta</a>
                <a href="/billetera" onClick={() => setMenuOpen(false)}>💳 Mi billetera</a>
                <button type="button" className="linkish" onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  setUser(null);
                  setMenuOpen(false);
                }}>Cerrar sesión</button>
              </>
            ) : (
              <>
                <a href="/login" onClick={() => setMenuOpen(false)}>Iniciar sesión</a>
                <a href="/register" onClick={() => setMenuOpen(false)}>Crear cuenta</a>
              </>
            )}
          </aside>
        </>
      )}

      <section className="hero">
        <img className="hero-logo" src="/logo.png" alt="DinoDev GAMES" />
        <h1>Juega más.<br /><span style={{ color: 'var(--accent)' }}>Paga sin complicaciones.</span></h1>
        <p>Recargas y gift cards. Bolivia, Brasil o Binance Pay.</p>
      </section>

      <section id="recargar">
        <div className="market-row">
          <button type="button" className={`market-btn ${market === 'BO' ? 'active' : ''}`} onClick={() => setMarket('BO')}>🇧🇴 Bolivia · Bs</button>
          <button type="button" className={`market-btn ${market === 'BR' ? 'active' : ''}`} onClick={() => setMarket('BR')}>🇧🇷 Brasil · R$</button>
          <button type="button" className={`market-btn ${market === 'BINANCE' ? 'active' : ''}`} onClick={() => setMarket('BINANCE')}>🟡 Binance Pay · USD</button>
        </div>

        <div className="game-tabs">
          {games.map((g) => (
            <button
              key={g.bigCategoryId}
              type="button"
              className={`game-tab ${game?.bigCategoryId === g.bigCategoryId ? 'active' : ''}`}
              onClick={() => setGame(g)}
            >
              <span className="game-cover">
                <img
                  src={`/${g.slug}.jpg`}
                  alt={g.name}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fb) {
                      img.dataset.fb = '1';
                      img.src =
                        'data:image/svg+xml,' +
                        encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="#0f241c" width="80" height="80" rx="12"/><text x="40" y="48" text-anchor="middle" fill="#3dff9a" font-size="16">${(g.short || '?').slice(0, 4)}</text></svg>`
                        );
                    }
                  }}
                />
              </span>
              <strong>{g.short}</strong>
              <span style={{ fontSize: 11 }}>{g.name}</span>
            </button>
          ))}
        </div>

        {regions.length > 0 && (
          <div className="region-chips">
            {regions.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`region-chip ${regionId === r.id ? 'active' : ''}`}
                onClick={() => {
                  setRegionId(r.id);
                  if (game) loadProducts(game, apiMarket, r.id);
                }}
              >
                <b>{r.region}</b> <small>{r.name}</small>
              </button>
            ))}
          </div>
        )}

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert ok">{notice}</div>}
        {busy && (
          <div className="alert ok" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="spinner" />
            {busyLabel || 'Procesando…'}
          </div>
        )}

        {loading ? (
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" /> Cargando paquetes…
          </p>
        ) : (
          <div className="products">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`product ${selected === p.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelected(p.id);
                  setPlayer(null);
                  setPayOrder(null);
                }}
              >
                <div>{p.name}</div>
                <div className="price-usd">USD {Number(p.priceUsd).toFixed(2)}</div>
                {market !== 'BINANCE' && (
                  <div className="price-local">
                    {p.symbolLocal} {Number(p.priceLocal).toFixed(2)}
                  </div>
                )}
              </button>
            ))}
            {!products.length && <p className="muted">Sin paquetes. Prueba otra región.</p>}
          </div>
        )}

        {showFieldPanel && (
          <section className="panel">
            <h2>{isGiftLike ? 'Datos de la compra' : 'Datos de la cuenta'}</h2>
            <p className="muted">
              {isGiftLike
                ? 'Este producto puede pedir usuario/email o no requerir ID de jugador.'
                : 'Ingresa el ID o los datos que pide este juego. No pedimos contraseña.'}
            </p>

            {requirements.length > 0 ? (
              requirements.map((req) => (
                <label key={req.field_name}>
                  {req.label || req.field_name}
                  {req.select_options?.length ? (
                    <select
                      value={fields[req.field_name] || ''}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, [req.field_name]: e.target.value }))
                      }
                    >
                      <option value="">Elegir…</option>
                      {req.select_options.map((o: any, i: number) => (
                        <option key={i} value={String(o.value ?? o.id ?? o)}>
                          {String(o.label ?? o.name ?? o.value ?? o)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      inputMode="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={fields[req.field_name] || ''}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, [req.field_name]: e.target.value }))
                      }
                      placeholder={req.label || req.field_name}
                    />
                  )}
                </label>
              ))
            ) : (
              <p className="muted">Este producto no pide ID de jugador. Puedes continuar.</p>
            )}

            <button type="button" className="btn" disabled={busy} onClick={validate}>
              {busy && busyLabel.includes('Verif') ? (
                <>
                  <span className="spinner" style={{ marginRight: 8 }} /> Verificando…
                </>
              ) : needsPlayerFields || !isGiftLike ? (
                'Verificar cuenta'
              ) : (
                'Continuar'
              )}
            </button>

            {player && product && !payOrder && (
              <div style={{ marginTop: 12 }}>
                <p className="muted">✓ {player.player_name}</p>
                <p>
                  <strong>USD {Number(product.priceUsd).toFixed(4)}</strong>
                  {market !== 'BINANCE' && (
                    <>
                      {' '}
                      · {product.symbolLocal} {Number(product.priceLocal).toFixed(2)}
                    </>
                  )}
                </p>
                {user && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => buy('wallet')}
                    style={{ marginRight: 8 }}
                  >
                    {busy && busyLabel.includes('orden') ? 'Creando…' : `Pagar con billetera (${Number(user.balance_usd).toFixed(2)} USD)`}
                  </button>
                )}
                <button type="button" className="btn primary" disabled={busy} onClick={() => buy('qr')}>
                  {busy && busyLabel.includes('orden') ? 'Creando…' : 'Pagar con QR / crear orden'}
                </button>
              </div>
            )}

            {payOrder && (
              <div style={{ marginTop: 14 }}>
                <p className="muted">
                  Orden: <code>{payOrder.id}</code>
                </p>
                <p>
                  <span className="st">{STATUS[payOrder.status] || payOrder.status}</span>
                </p>
                <p>
                  <strong>USD {Number(payOrder.priceUsd).toFixed(4)}</strong>
                  {payOrder.localAmount != null && (
                    <>
                      {' '}
                      · {payOrder.symbolLocal || payOrder.localCurrency} {payOrder.localAmount}
                    </>
                  )}
                </p>
                {payOrder.qrUrl && payOrder.status === 'pending_payment' && (
                  <div style={{ margin: '10px 0' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={payOrder.qrUrl}
                      alt="QR de pago"
                      style={{ maxWidth: 220, borderRadius: 12, background: '#fff', padding: 8 }}
                    />
                    <p className="muted">Escanea el QR y paga el monto exacto. Tienes 1 hora.</p>
                  </div>
                )}
                {payOrder.status === 'pending_payment' && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => claimPaid(payOrder.id)}
                  >
                    {busy && busyLabel.includes('pago') ? 'Registrando…' : 'Ya pagué'}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </section>

      <section className="panel" id="como">
        <h2>Cómo funciona</h2>
        <ol className="steps">
          <li>1. Elige país o Binance Pay y el juego / gift card.</li>
          <li>2. Región del paquete (LATAM por defecto cuando exista).</li>
          <li>3. Completa solo los datos que pide ese producto.</li>
          <li>4. Paga y pulsa <strong>Ya pagué</strong>.</li>
          <li>5. El admin confirma y entrega la recarga o código.</li>
        </ol>
      </section>

      <section className="panel" id="historial">
        <h2>Historial en este dispositivo</h2>
        <button type="button" className="btn" onClick={loadHistory} disabled={busy}>
          Actualizar historial
        </button>
        {hist.map((o) => (
          <div key={o.id} className="hist-item">
            <span className="st">{STATUS[o.status] || o.status}</span>
            <strong>
              {o.game_name} · {o.item_name}
            </strong>
            <div className="muted">
              {o.player_name || o.player_id} · {o.local_currency} {o.local_amount} · USD {o.price_usd}
            </div>
            {o.status === 'pending_payment' && (
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 6 }}
                disabled={busy}
                onClick={() => claimPaid(o.id)}
              >
                Ya pagué
              </button>
            )}
          </div>
        ))}
        {!hist.length && <p className="muted">Sin pedidos aún.</p>}
      </section>

      <footer className="footer">
        <img src="/logo.png" alt="" width={40} height={40} style={{ borderRadius: '50%', marginBottom: 8 }} />
        <div>
          <strong>DinoDev GAMES</strong>
        </div>
        <div>Recargas · Bolivia · Brasil · Binance Pay</div>
        <div style={{ marginTop: 8 }}>
          <a href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">
            WhatsApp soporte
          </a>
        </div>
        <div style={{ marginTop: 8 }}>© {new Date().getFullYear()} DinoDev GAMES</div>
        <div style={{ marginTop: 12 }}>
          Desarrollado por:{' '}
          <a
            className="btn"
            style={{ display: 'inline-block', marginLeft: 6, padding: '0.35rem 0.75rem' }}
            href={`https://wa.me/${JACK_WA}?text=${encodeURIComponent(JACK_MSG)}`}
            target="_blank"
            rel="noreferrer"
          >
            Jack Dainor
          </a>
        </div>
      </footer>

      <a
        className="wa-float"
        href={`https://wa.me/${WA}?text=${encodeURIComponent('Hola DinoDev GAMES, necesito ayuda')}`}
        target="_blank"
        rel="noreferrer"
      >
        WA
      </a>
    </main>
  );
}
