'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Game = { slug: string; name: string; short: string; bigCategoryId: number; cover?: string };
type Region = { id: number; name: string; region: string };
type Product = {
  id: number; name: string; priceUsd: number; priceLocal: number;
  symbolLocal: string; currencyLocal: string; region?: string; costUsd?: number;
};
type HistOrder = {
  id: string; status: string; game_name?: string; item_name?: string;
  player_id?: string; player_name?: string; price_usd?: string;
  local_amount?: string; local_currency?: string; created_at?: string;
};

const STATUS: Record<string, string> = {
  pending_payment: 'Esperando pago',
  awaiting_confirmation: 'Verificando / En cola',
  paid: 'Pagado',
  processing: 'Enviando…',
  completed: 'Completado ✓',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  not_paid: 'No pagado',
  failed: 'Falló el envío',
};

const WA = '5511966019490';

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
  const [playerId, setPlayerId] = useState('');
  const [player, setPlayer] = useState<any>(null);
  const [category, setCategory] = useState<{ id: number; name: string; region: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hist, setHist] = useState<HistOrder[]>([]);

  useEffect(() => {
    fetch('/api/auth/me').then(async (r) => { if (r.ok) setUser((await r.json()).user); }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/catalog?list=games');
        const d = await r.json();
        if (r.ok && d.games?.length) {
          setGames(d.games);
          setGame(d.games[0]);
        }
      } catch (e: any) {
        setError(e.message || 'Error cargando juegos');
      }
    })();
  }, []);

  const apiMarket = market === 'BINANCE' ? 'BO' : market; // precios locales usan BO/BR; binance paga en USD

  const loadProducts = useCallback(async (g: Game, mkt: string, rid?: number | null) => {
    setLoading(true);
    setError('');
    setProducts([]);
    setSelected(null);
    setPlayer(null);
    try {
      const q = new URLSearchParams({ bigCategoryId: String(g.bigCategoryId), market: mkt });
      if (rid) q.set('regionId', String(rid));
      const r = await fetch(`/api/catalog?${q}`);
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo cargar');
      setRegions(d.regions || []);
      setRegionId(d.category?.id ?? null);
      setCategory(d.category || null);
      setProducts(d.products || []);
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

  function rememberOrder(id: string) {
    try {
      const arr = JSON.parse(localStorage.getItem('dinodev_order_ids') || '[]');
      localStorage.setItem('dinodev_order_ids', JSON.stringify([id, ...arr.filter((x: string) => x !== id)].slice(0, 40)));
    } catch { /* */ }
  }

  async function loadHistory() {
    try {
      let ids: string[] = [];
      try { ids = JSON.parse(localStorage.getItem('dinodev_order_ids') || '[]'); } catch { ids = []; }
      const body: any = { ids };
      if (playerId.trim()) body.playerId = playerId.trim();
      const r = await fetch('/api/my-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok && d.success) setHist(d.orders || []);
    } catch { /* */ }
  }

  useEffect(() => {
    loadHistory();
    const t = setInterval(loadHistory, 20000);
    return () => clearInterval(t);
  }, [playerId]);

  async function validate() {
    if (!selected || !category) return setError('Elige un paquete');
    const val = playerId.trim();
    if (!val) return setError('Escribe tu ID o usuario');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: selected, categoryId: category.id, playerId: val }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo validar');
      setPlayer(d.player);
      setNotice(`Jugador: ${d.player.player_name}${d.player.region ? ` · Región ${d.player.region}` : ''}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function buy(payMethod: 'wallet' | 'qr') {
    if (!product || !player || !category || !game) return;
    setBusy(true);
    setError('');
    try {
      const method = market === 'BINANCE' || payMethod === 'wallet' ? (user ? 'wallet' : 'qr') : payMethod;
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: product.id,
          categoryId: category.id,
          playerId: player.player_id,
          playerName: player.player_name,
          gameName: game.name,
          itemName: product.name,
          regionLabel: product.region || category.region,
          payCountry: market === 'BINANCE' ? 'BO' : market,
          payMethod: market === 'BINANCE' && user ? 'wallet' : method,
          costUsd: product.costUsd,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Error al crear orden');
      setNotice(d.message || 'Orden creada');
      if (d.order?.id) rememberOrder(d.order.id);
      await loadHistory();
      if (user) {
        const me = await fetch('/api/auth/me').then((x) => x.json());
        if (me.user) setUser(me.user);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const fieldLabel = /telegram|steam|xbox|epic|roblox|gift|apple|google|razer/i.test(game?.name || '')
    ? 'Usuario / ID de la cuenta'
    : 'ID del jugador';

  return (
    <main className="wrap">
      <header className="topbar">
        <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)}>☰ Menú</button>
        <a className="brand" href="/">
          <img src="/logo.jpg" alt="DinoDev" />
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
                <a href="/cuenta#billetera" onClick={() => setMenuOpen(false)}>💳 Billetera</a>
                <button type="button" className="linkish" onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  setUser(null); setMenuOpen(false);
                }}>Cerrar sesión</button>
              </>
            ) : (
              <>
                <a href="/login" onClick={() => setMenuOpen(false)}>Iniciar sesión</a>
                <a href="/register" onClick={() => setMenuOpen(false)}>Crear cuenta</a>
              </>
            )}
            <a href="/admin" onClick={() => setMenuOpen(false)}>Admin</a>
          </aside>
        </>
      )}

      <section className="hero">
        <img className="hero-logo" src="/logo.jpg" alt="DinoDev GAMES" />
        <h1>Juega más.<br /><span style={{ color: 'var(--accent)' }}>Paga sin complicaciones.</span></h1>
        <p>Recargas y gift cards. Elige Bolivia, Brasil o Binance Pay, verifica tu cuenta y listo.</p>
      </section>

      <section id="recargar">
        <div className="market-row">
          <button type="button" className={`market-btn ${market === 'BO' ? 'active' : ''}`} onClick={() => setMarket('BO')}>🇧🇴 Bolivia · Bs</button>
          <button type="button" className={`market-btn ${market === 'BR' ? 'active' : ''}`} onClick={() => setMarket('BR')}>🇧🇷 Brasil · R$</button>
          <button type="button" className={`market-btn ${market === 'BINANCE' ? 'active' : ''}`} onClick={() => setMarket('BINANCE')}>🟡 Binance Pay · USD</button>
        </div>

        <div className="game-tabs">
          {games.map((g) => (
            <button key={g.bigCategoryId} type="button" className={`game-tab ${game?.bigCategoryId === g.bigCategoryId ? 'active' : ''}`} onClick={() => setGame(g)}>
              <span className="game-cover">
                <img
                  src={`/${g.slug}.jpg`}
                  alt={g.name}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fb) {
                      img.dataset.fb = '1';
                      img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="#0f241c" width="80" height="80" rx="12"/><text x="40" y="48" text-anchor="middle" fill="#3dff9a" font-size="16">${(g.short || '?').slice(0, 4)}</text></svg>`);
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
              <button key={r.id} type="button" className={`region-chip ${regionId === r.id ? 'active' : ''}`}
                onClick={() => { setRegionId(r.id); if (game) loadProducts(game, apiMarket, r.id); }}>
                <b>{r.region}</b> <small>{r.name}</small>
              </button>
            ))}
          </div>
        )}

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert ok">{notice}</div>}

        {loading ? <p className="muted">Cargando paquetes…</p> : (
          <div className="products">
            {products.map((p) => (
              <button key={p.id} type="button" className={`product ${selected === p.id ? 'selected' : ''}`}
                onClick={() => { setSelected(p.id); setPlayer(null); }}>
                <div>{p.name}</div>
                <div className="price-usd">USD {Number(p.priceUsd).toFixed(2)}</div>
                {market !== 'BINANCE' && (
                  <div className="price-local">{p.symbolLocal} {Number(p.priceLocal).toFixed(2)}</div>
                )}
              </button>
            ))}
            {!products.length && <p className="muted">Sin paquetes. Prueba otra región.</p>}
          </div>
        )}

        <section className="panel">
          <h2>{fieldLabel}</h2>
          <p className="muted">Puedes escribir ID numérico o username según el juego/gift card. No pedimos contraseña.</p>
          <label>
            {fieldLabel}
            <input type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={playerId} onChange={(e) => setPlayerId(e.target.value)} placeholder="ID o usuario" />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={validate}>Verificar cuenta</button>
          {player && product && (
            <div style={{ marginTop: 12 }}>
              <p className="muted">✓ {player.player_name}</p>
              <p><strong>USD {Number(product.priceUsd).toFixed(4)}</strong>
                {market !== 'BINANCE' && <> · {product.symbolLocal} {Number(product.priceLocal).toFixed(2)}</>}
              </p>
              {user ? (
                <button type="button" className="btn primary" disabled={busy} onClick={() => buy('wallet')}>
                  Pagar con billetera ({Number(user.balance_usd).toFixed(2)} USD)
                </button>
              ) : (
                <p className="muted"><a href="/login">Inicia sesión</a> para billetera / Binance, o <a href="/register">regístrate</a>.</p>
              )}
              <button type="button" className="btn" style={{ marginLeft: 8 }} disabled={busy} onClick={() => buy('qr')}>Crear orden</button>
            </div>
          )}
        </section>
      </section>

      <section className="panel" id="como">
        <h2>Cómo funciona</h2>
        <ol className="steps">
          <li>1. Elige país o Binance Pay y el juego / gift card.</li>
          <li>2. Escoge la región del paquete (debe coincidir con tu cuenta).</li>
          <li>3. Verifica tu ID o username.</li>
          <li>4. Paga con billetera (USDT) o crea la orden para que el admin confirme.</li>
          <li>5. Seguimos tu pedido en el historial de este dispositivo.</li>
        </ol>
      </section>

      <section className="panel" id="historial">
        <h2>Historial en este dispositivo</h2>
        <p className="muted">Se guarda en tu navegador. Si validaste un ID, también buscamos por ese ID.</p>
        <button type="button" className="btn" onClick={loadHistory}>Actualizar historial</button>
        {hist.map((o) => (
          <div key={o.id} className="hist-item">
            <span className="st">{STATUS[o.status] || o.status}</span>
            <strong>{o.game_name} · {o.item_name}</strong>
            <div className="muted">{o.player_name || o.player_id} · {o.local_currency} {o.local_amount} · USD {o.price_usd}</div>
            <small className="muted">{o.id}</small>
          </div>
        ))}
        {!hist.length && <p className="muted">Sin pedidos aún.</p>}
      </section>

      <footer className="footer">
        <img src="/logo.jpg" alt="" width={40} height={40} style={{ borderRadius: '50%', marginBottom: 8 }} />
        <div><strong>DinoDev GAMES</strong></div>
        <div>Recargas · Bolivia · Brasil · Binance Pay</div>
        <div style={{ marginTop: 8 }}>
          <a href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">WhatsApp soporte</a>
          {' · '}
          <a href="/admin">Admin</a>
        </div>
        <div style={{ marginTop: 8 }}>© {new Date().getFullYear()} DinoDev GAMES</div>
      </footer>

      <a className="wa-float" href={`https://wa.me/${WA}?text=${encodeURIComponent('Hola DinoDev GAMES, necesito ayuda')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp">WA</a>
    </main>
  );
}
