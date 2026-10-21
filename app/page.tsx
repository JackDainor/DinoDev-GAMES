'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Game = { slug: string; name: string; short: string; bigCategoryId: number; cover?: string; coverLocal?: string; currencyLabel?: string };
type Region = { id: number; name: string; region: string };
type Product = {
  id: number; name: string; priceUsd: number; priceLocal: number;
  symbolLocal: string; currencyLocal: string; region?: string; regionName?: string; costUsd?: number;
};

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [market, setMarket] = useState<'BO' | 'BR'>('BO');
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rates, setRates] = useState({ rateBo: 12, rateBr: 5.5, markupUsd: 0.2 });
  const [category, setCategory] = useState<{ id: number; name: string; region: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setUser(d.user);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/catalog?list=games');
        const d = await r.json();
        if (r.ok && d.games?.length) {
          setGames(
            d.games.map((g: any) => ({
              ...g,
              short: g.short || String(g.name || 'G').slice(0, 4).toUpperCase(),
              cover: g.cover,
              coverLocal: g.coverLocal || `/${g.slug}.jpg`,
            }))
          );
          setGame(d.games[0]);
          if (d.settings) setRates(d.settings);
        }
      } catch (e: any) {
        setError(e.message || 'Error cargando juegos');
      }
    })();
  }, []);

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
      if (d.settings) setRates(d.settings);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (game) loadProducts(game, market, null);
  }, [game, market, loadProducts]);

  const product = useMemo(() => products.find((p) => p.id === selected), [products, selected]);

  async function validate() {
    if (!selected || !category) return setError('Elige un paquete');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: selected, categoryId: category.id, playerId }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo validar');
      setPlayer(d.player);
      setNotice(`Jugador: ${d.player.player_name}`);
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
          payCountry: market,
          payMethod,
          costUsd: product.costUsd,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Error al comprar');
      setNotice(d.message || 'Orden creada');
      if (user && payMethod === 'wallet') {
        const me = await fetch('/api/auth/me').then((x) => x.json());
        if (me.user) setUser(me.user);
      }
      if (d.order?.id) {
        try {
          const raw = localStorage.getItem('dinodev_order_ids') || '[]';
          const arr = JSON.parse(raw);
          localStorage.setItem('dinodev_order_ids', JSON.stringify([d.order.id, ...arr].slice(0, 30)));
        } catch { /* */ }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="topbar">
        <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)}>☰ Menú</button>
        <a className="brand" href="/">
          <img src="/logo.svg" alt="DinoDev" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span>
            DinoDev <span style={{ color: 'var(--accent)' }}>GAMES</span>
            <small>RECARGAS ONLINE</small>
          </span>
        </a>
        <span className="muted">{user ? user.username : 'Invitado'}</span>
      </header>

      {menuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <div className="brand" style={{ marginBottom: 12 }}>
              <img src="/logo.svg" alt="" width={36} height={36} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <strong>DinoDev GAMES</strong>
            </div>
            <a href="/" onClick={() => setMenuOpen(false)}>🏠 Inicio / Tienda</a>
            {user ? (
              <>
                <a href="/cuenta" onClick={() => setMenuOpen(false)}>👤 Mi cuenta</a>
                <a href="/cuenta#billetera" onClick={() => setMenuOpen(false)}>💳 Mi billetera</a>
                <button
                  type="button"
                  className="linkish"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    setUser(null);
                    setMenuOpen(false);
                  }}
                >
                  Cerrar sesión
                </button>
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
        <h1>Recargas de juegos<br /><span style={{ color: 'var(--accent)' }}>rápidas y seguras</span></h1>
        <p>
          Precios en USD y en tu moneda local. Paga con billetera (USDT) o crea tu cuenta.
          Tipo de cambio admin: BO {rates.rateBo} · BR {rates.rateBr}
        </p>
      </section>

      <div className="market-row">
        <button type="button" className={`market-btn ${market === 'BO' ? 'active' : ''}`} onClick={() => setMarket('BO')}>🇧🇴 Bolivia</button>
        <button type="button" className={`market-btn ${market === 'BR' ? 'active' : ''}`} onClick={() => setMarket('BR')}>🇧🇷 Brasil</button>
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
                src={g.coverLocal || g.cover || `/${g.slug}.jpg`}
                alt={g.name}
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget;
                  // 1) try remote Shop2TopUp cover  2) placeholder
                  if (g.cover && img.src.indexOf(g.cover) === -1) {
                    img.src = g.cover;
                  } else if (!img.dataset.fallback) {
                    img.dataset.fallback = '1';
                    img.src =
                      'data:image/svg+xml,' +
                      encodeURIComponent(
                        `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="#0f241c" width="80" height="80" rx="12"/><text x="40" y="48" text-anchor="middle" fill="#3dff9a" font-size="22" font-family="sans-serif">${(g.short || '?').slice(0, 3)}</text></svg>`
                      );
                  }
                }}
              />
            </span>
            <strong>{g.short}</strong>
            <span>{g.name}</span>
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
                if (game) loadProducts(game, market, r.id);
              }}
            >
              <b>{r.region}</b> <small>{r.name}</small>
            </button>
          ))}
        </div>
      )}

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {loading ? (
        <p className="muted">Cargando paquetes…</p>
      ) : (
        <div className="products">
          {products.map((p) => (
            <button key={p.id} type="button" className={`product ${selected === p.id ? 'selected' : ''}`} onClick={() => setSelected(p.id)}>
              <div>{p.name}</div>
              <div className="price-usd">USD {Number(p.priceUsd).toFixed(2)}</div>
              <div className="price-local">{p.symbolLocal} {Number(p.priceLocal).toFixed(2)}</div>
            </button>
          ))}
          {!products.length && <p className="muted">Sin paquetes en esta región.</p>}
        </div>
      )}

      <section className="panel">
        <h2>ID del jugador</h2>
        <label>
          Player ID
          <input value={playerId} onChange={(e) => setPlayerId(e.target.value)} placeholder="Tu ID" />
        </label>
        <button type="button" className="btn" disabled={busy} onClick={validate}>Verificar ID</button>
        {player && (
          <div style={{ marginTop: 12 }}>
            <p className="ok muted">✓ {player.player_name}</p>
            {product && (
              <>
                <p>
                  <strong>USD {Number(product.priceUsd).toFixed(4)}</strong>
                  {' · '}
                  {product.symbolLocal} {Number(product.priceLocal).toFixed(2)}
                </p>
                {user ? (
                  <button type="button" className="btn primary" disabled={busy} onClick={() => buy('wallet')}>
                    Pagar con billetera ({Number(user.balance_usd).toFixed(2)} USD)
                  </button>
                ) : (
                  <p className="muted">
                    <a href="/login">Inicia sesión</a> para pagar con billetera o{' '}
                    <a href="/register">crea cuenta</a>.
                  </p>
                )}
                <button type="button" className="btn" style={{ marginLeft: 8 }} disabled={busy} onClick={() => buy('qr')}>
                  Orden QR (admin)
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
