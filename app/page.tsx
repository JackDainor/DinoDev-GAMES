'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Game = { slug: string; name: string; short: string; currencyLabel: string; cover?: string };
type Region = { id: number; name: string; region: string };
type Product = {
  id: number;
  name: string;
  description: string;
  image?: string | null;
  priceUsd?: string;
  priceLocal?: string | null;
  currencyLocal?: string;
  symbolLocal?: string;
  region?: string;
  regionName?: string;
};
type Player = { player_id: string; player_name: string; region?: string };
type PayOrder = {
  id: string;
  status: string;
  expiresAt: string;
  gameName: string;
  itemName: string;
  regionLabel?: string;
  playerId: string;
  playerName: string;
  playerRegion?: string;
  usdPrice: number;
  localAmount: number;
  localCurrency: string;
  localSymbol: string;
  payCountry: string;
  payCountryName: string;
  method: string;
  qrUrl?: string | null;
  pixKey?: string | null;
  rate: number;
};

type HistOrder = {
  id: string;
  status: string;
  game_name: string;
  item_name: string;
  player_id: string;
  player_name: string;
  local_amount: string | number;
  local_currency: string;
  pay_country?: string;
  qr_url?: string | null;
  created_at?: string;
  expires_at?: string;
};

const GAMES_FALLBACK: Game[] = [
  { slug: 'freefire', name: 'Free Fire', short: 'FF', currencyLabel: 'Diamantes', cover: '/freefire.jpg' },
  { slug: 'pubg', name: 'PUBG Mobile', short: 'PUBG', currencyLabel: 'UC', cover: '/pubg.jpg' },
  { slug: 'mlbb', name: 'Mobile Legends', short: 'MLBB', currencyLabel: 'Diamantes', cover: '/mlbb.jpg' },
  { slug: 'bloodstrike', name: 'Blood Strike', short: 'BS', currencyLabel: 'Gold', cover: '/bloodstrike.jpg' },
];

const WA_NUMBER = '5511966019490'; // +55 11 96601-9490
const STATUS_USER: Record<string, string> = {
  pending_payment: 'Esperando pago',
  awaiting_confirmation: 'Verificando pago…',
  paid: 'Pagado',
  processing: 'Enviando diamantes…',
  completed: 'Completado ✓',
  expired: 'Pago no realizado',
  cancelled: 'Orden cancelada',
  not_paid: 'Pago no realizado',
  failed: 'Falló el envío',
};
const WA_TEXT = encodeURIComponent('Hola DinoDev GAMES, necesito ayuda con una recarga.');

export default function Home() {
  const [games] = useState<Game[]>(GAMES_FALLBACK);
  const [gameSlug, setGameSlug] = useState('freefire');
  const [market, setMarket] = useState<'BO' | 'BR'>('BO');
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<{ id: number; name: string; region: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [player, setPlayer] = useState<Player | null>(null);
  const [payOrder, setPayOrder] = useState<PayOrder | null>(null);
  const [histOrders, setHistOrders] = useState<HistOrder[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());

  const game = useMemo(() => games.find((g) => g.slug === gameSlug) || games[0], [games, gameSlug]);
  const product = useMemo(() => products.find((p) => p.id === selected), [products, selected]);

  const loadCatalog = useCallback(async (slug: string, mkt: string, rid?: number | null) => {
    setLoading(true);
    setError('');
    setProducts([]);
    setSelected(null);
    setPlayer(null);
    setPayOrder(null);
    try {
      const q = new URLSearchParams({ game: slug, market: mkt });
      if (rid) q.set('regionId', String(rid));
      const r = await fetch(`/api/catalog?${q}`);
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo cargar el catálogo.');
      setRegions(d.regions || []);
      setRegionId(d.category?.id ?? null);
      setCategory(d.category || null);
      setProducts(d.products || []);
      if (d.products?.[0]) setSelected(d.products[0].id);
    } catch (e: any) {
      setError(e.message || 'Error al cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog(gameSlug, market, null);
  }, [gameSlug, market, loadCatalog]);

  useEffect(() => {
    const needTick =
      !!payOrder?.expiresAt ||
      histOrders.some((o) => o.status === 'pending_payment' && o.expires_at);
    if (!needTick) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [payOrder?.expiresAt, histOrders]);

  const remaining = useMemo(() => {
    if (!payOrder?.expiresAt) return '';
    const ms = new Date(payOrder.expiresAt).getTime() - now;
    if (ms <= 0) return 'Expirado';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [payOrder?.expiresAt, now]);

  async function validate() {
    setError('');
    setNotice('');
    setPlayer(null);
    setPayOrder(null);
    if (!selected || !category) {
      setError('Selecciona un paquete.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: selected, categoryId: category.id, playerId }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo validar el ID.');
      setPlayer(d.player);
      const reg = d.player?.region ? ` Región del ID: ${d.player.region}.` : '';
      setNotice(`Jugador verificado: ${d.player.player_name}.${reg}`);
    } catch (e: any) {
      setError(e.message || 'No se pudo validar el jugador.');
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout() {
    if (!product || !player || !category) return;
    setError('');
    setBusy(true);
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: product.id,
          categoryId: category.id,
          playerId: player.player_id,
          playerName: player.player_name,
          playerRegion: player.region || '',
          payCountry: market,
          gameSlug: game.slug,
          gameName: game.name,
          itemName: product.name,
          regionLabel: product.region || category.region,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo crear la orden de pago.');
      setPayOrder(d.order);
      if (d.order?.id) rememberOrderId(d.order.id);
      setNotice('Orden creada. Tienes 1 hora para pagar con el QR.');
      loadHistory();
    } catch (e: any) {
      setError(e.message || 'Error al iniciar el pago.');
    } finally {
      setBusy(false);
    }
  }

  async function claimPaid(orderId: string) {
    if (!orderId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch(`/api/checkout/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_paid' }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo registrar el pago.');
      if (payOrder?.id === orderId) {
        setPayOrder({ ...payOrder, status: 'awaiting_confirmation' });
      }
      setNotice(d.message || 'Pago registrado. Estamos verificando…');
      await loadHistory();
    } catch (e: any) {
      setError(e.message || 'Error al registrar el pago.');
    } finally {
      setBusy(false);
    }
  }

  function downloadQr(url: string, orderId: string) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-DinoDev-${orderId.slice(0, 8)}.png`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function histRemaining(expiresAt?: string) {
    if (!expiresAt) return '';
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return 'Expirado';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  }


  function rememberOrderId(id: string) {
    try {
      const raw = localStorage.getItem('dinodev_order_ids') || '[]';
      const arr = JSON.parse(raw) as string[];
      const next = [id, ...arr.filter((x) => x !== id)].slice(0, 30);
      localStorage.setItem('dinodev_order_ids', JSON.stringify(next));
    } catch { /* ignore */ }
  }

  async function loadHistory() {
    setHistLoading(true);
    try {
      let ids: string[] = [];
      try {
        ids = JSON.parse(localStorage.getItem('dinodev_order_ids') || '[]');
      } catch { ids = []; }
      const body: any = { ids };
      if (/^\d{5,20}$/.test(playerId)) body.playerId = playerId;
      if (!ids.length && !body.playerId) {
        setHistOrders([]);
        return;
      }
      const r = await fetch('/api/my-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok && d.success) setHistOrders(d.orders || []);
    } catch { /* ignore */ }
    finally { setHistLoading(false); }
  }

  useEffect(() => {
    loadHistory();
    const t = setInterval(loadHistory, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  return (
    <main>
      <nav className="nav wrap">
        <a className="brand" href="#top">
          <img src="/logo.png" alt="DinoDev" className="brand-logo" />
          <span>
            DinoDev <span className="accent">GAMES</span>
            <small>RECARGAS · BO & BR</small>
          </span>
        </a>
        <div className="nav-right">
          <span className="live-dot" /> ONLINE
          <a className="help" href="#como">
            ¿Cómo funciona?
          </a>
        </div>
      </nav>

      <section className="hero wrap" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> RECARGAS RÁPIDAS Y SEGURAS
          </div>
          <h1>
            Juega más.
            <br />
            <span>Paga menos complicaciones.</span>
          </h1>
          <p>
            Free Fire, PUBG, MLBB y Blood Strike. Elige <strong>Bolivia</strong> o <strong>Brasil</strong>, verifica tu
            ID y paga con QR en tu moneda local.
          </p>
          <div className="hero-points">
            <span>✓ Varios juegos</span>
            <span>✓ Precios locales</span>
            <span>✓ QR 1 hora</span>
          </div>
          <a className="primary-link" href="#recargar">
            Recargar ahora <b>↘</b>
          </a>
        </div>
        <div className="hero-art">
          <img src="/logo.png" alt="" className="hero-dino" />
        </div>
      </section>

      <section className="shop wrap" id="recargar">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / PAÍS Y JUEGO</div>
            <h2>Catálogo de recargas</h2>
          </div>
        </div>

        <div className="market-row">
          <button type="button" className={`market-btn ${market === 'BO' ? 'active' : ''}`} onClick={() => setMarket('BO')}>
            🇧🇴 Bolivia · Bs
          </button>
          <button type="button" className={`market-btn ${market === 'BR' ? 'active' : ''}`} onClick={() => setMarket('BR')}>
            🇧🇷 Brasil · R$
          </button>
        </div>

        <div className="game-tabs">
          {games.map((g) => (
            <button
              key={g.slug}
              type="button"
              className={`game-tab ${gameSlug === g.slug ? 'active' : ''}`}
              onClick={() => setGameSlug(g.slug)}
            >
              <span className="game-cover">
                <img src={g.cover || `/${g.slug}.jpg`} alt={g.name} />
              </span>
              <strong>{g.short}</strong>
              <span>{g.name}</span>
            </button>
          ))}
        </div>

        {regions.length > 0 && (
          <div className="region-row">
            <span className="region-label">Región del paquete (debe coincidir con tu cuenta)</span>
            <div className="region-chips">
              {regions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`region-chip ${regionId === r.id ? 'active' : ''}`}
                  onClick={() => {
                    setRegionId(r.id);
                    loadCatalog(gameSlug, market, r.id);
                  }}
                >
                  <b>{r.region}</b>
                  <small>{r.name}</small>
                </button>
              ))}
            </div>
            {category && (
              <p className="region-hint">
                Paquetes de <strong>{category.region}</strong> · Precios en{' '}
                <strong>{market === 'BO' ? 'bolivianos (Bs)' : 'reales (R$)'}</strong>
              </p>
            )}
          </div>
        )}

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}

        {loading ? (
          <div className="loading">Cargando {game.name}…</div>
        ) : products.length === 0 ? (
          <div className="empty">
            <strong>Sin paquetes</strong>
            <p>Prueba otra región o juego.</p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelected(p.id);
                  setPlayer(null);
                  setPayOrder(null);
                }}
                className={`product ${selected === p.id ? 'selected' : ''}`}
              >
                <span className="product-icon">
                  {p.image ? <img src={p.image} alt="" /> : <img src={game.cover || `/${gameSlug}.jpg`} alt="" className="product-cover-fallback" />}
                </span>
                <span className="product-name">{p.name}</span>
                <span className="product-region">🌐 {p.region || '—'}</span>
                <span className="product-bottom">
                  <span className="price-local">
                    {p.priceLocal ? `${p.symbolLocal || ''} ${p.priceLocal}` : '—'}
                  </span>
                  <span className="choose">{selected === p.id ? '✓' : '+'}</span>
                </span>
                {p.priceUsd && (
                  <span className="price-usd">≈ USD {p.priceUsd}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="panel" id="cuenta">
          <div className="eyebrow">02 / TU CUENTA</div>
          <h3>¿A qué ID recargamos?</h3>
          <p className="muted">ID de jugador de {game.name}. No pedimos contraseña.</p>
          <label className="field-label">ID de jugador</label>
          <input
            className="input"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value.replace(/\D/g, ''))}
            placeholder="Ej. 123456789"
            inputMode="numeric"
          />
          <button className="btn" type="button" disabled={busy || !selected} onClick={validate}>
            Verificar ID
          </button>
          {player && (
            <div className="player-card">
              <div>
                <small>Jugador</small>
                <strong>{player.player_name}</strong>
              </div>
              <div>
                <small>ID</small>
                <strong>{player.player_id}</strong>
              </div>
              <div>
                <small>Región ID</small>
                <strong>{player.region || '—'}</strong>
              </div>
              <div>
                <small>Región paquete</small>
                <strong>{product?.region || category?.region || '—'}</strong>
              </div>
            </div>
          )}
        </div>

        {player && product && !payOrder && (
          <div className="panel" id="pago">
            <div className="eyebrow">03 / PAGO</div>
            <h3>
              Pagar en {market === 'BO' ? 'Bolivia (Bs)' : 'Brasil (R$)'}
            </h3>
            <p className="muted">
              {product.name} ·{' '}
              <strong>
                {product.symbolLocal} {product.priceLocal}
              </strong>{' '}
              · Región {product.region}
            </p>
            <button className="btn primary" type="button" disabled={busy} onClick={startCheckout}>
              Generar orden QR (válida 1 hora)
            </button>
          </div>
        )}

        {payOrder && (
          <div className="panel pay-panel" id="qr">
            <div className="eyebrow">04 / PAGA AHORA</div>
            <h3>
              {payOrder.method} · {payOrder.payCountryName}
            </h3>
            <div className="pay-summary">
              <div>
                <small>Total</small>
                <strong className="total">
                  {payOrder.localSymbol} {Number(payOrder.localAmount).toFixed(2)}
                </strong>
              </div>
              <div>
                <small>Tiempo</small>
                <strong className={remaining === 'Expirado' ? 'expired' : 'timer'}>{remaining}</strong>
              </div>
              <div>
                <small>Orden</small>
                <strong className="mono">{payOrder.id.slice(0, 8)}…</strong>
              </div>
              <div>
                <small>Estado</small>
                <strong>{payOrder.status}</strong>
              </div>
            </div>
            <p className="muted">
              {payOrder.gameName} · {payOrder.itemName} · {payOrder.playerName} ({payOrder.playerId})
            </p>
            <div className="qr-box">
              {payOrder.qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={payOrder.qrUrl} alt="QR de pago" />
              ) : (
                <div className="qr-placeholder">
                  <p>
                    <strong>Configura el QR</strong>
                  </p>
                  <p>
                    En Vercel: <code>QR_URL_BO</code> / <code>QR_URL_BR</code>
                  </p>
                  <p>
                    Monto: <b>
                      {payOrder.localSymbol} {Number(payOrder.localAmount).toFixed(2)}
                    </b>
                  </p>
                </div>
              )}
            </div>
            {payOrder.pixKey && (
              <div className="pix-key-box">
                <small>Chave Pix (aleatória)</small>
                <strong>{payOrder.pixKey}</strong>
              </div>
            )}
            {payOrder.qrUrl && (
              <button
                className="btn"
                type="button"
                style={{ marginTop: '0.5rem' }}
                onClick={() => downloadQr(payOrder.qrUrl!, payOrder.id)}
              >
                Descargar QR
              </button>
            )}
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Cuando pagues, ve a <strong>Mis pedidos</strong> abajo y pulsa <strong>Ya pagué</strong> en esta orden.
            </p>
            {payOrder.status === 'awaiting_confirmation' && (
              <div className="alert success">Pago en verificación. Te avisaremos al completar la recarga.</div>
            )}
            {remaining === 'Expirado' && <div className="alert error">Tiempo de pago agotado (pago no realizado). Genera una nueva orden.</div>}
          </div>
        )}
      </section>


        <div className="panel" id="historial">
          <div className="eyebrow">05 / MIS PEDIDOS</div>
          <h3>Historial en este dispositivo</h3>
          <p className="muted">
            Se guarda en tu navegador. Si ya validaste un ID, también buscamos por ese ID. Actualiza la página sin miedo.
          </p>
          <button className="btn" type="button" disabled={histLoading} onClick={() => loadHistory()}>
            {histLoading ? 'Actualizando…' : 'Actualizar historial'}
          </button>
          {histOrders.length === 0 ? (
            <p className="muted" style={{ marginTop: '0.75rem' }}>Aún no hay pedidos guardados aquí.</p>
          ) : (
            <div className="hist-list">
              {histOrders.map((o) => {
                const left = histRemaining(o.expires_at);
                const canPay =
                  o.status === 'pending_payment' && left !== 'Expirado';
                return (
                  <div key={o.id} className="hist-item">
                    <div>
                      <span className={`st st-${o.status}`}>{STATUS_USER[o.status] || o.status}</span>
                      <strong>
                        {o.game_name} · {o.item_name}
                      </strong>
                      <small>
                        {o.player_name} ({o.player_id}) · {o.local_currency}{' '}
                        {Number(o.local_amount).toFixed(2)}
                      </small>
                      {o.status === 'pending_payment' && o.expires_at && (
                        <small>Tiempo para pagar: {left}</small>
                      )}
                      <small className="mono">{o.id}</small>
                    </div>
                    <div className="hist-actions">
                      {o.qr_url && canPay && (
                        <button type="button" className="btn" onClick={() => downloadQr(o.qr_url!, o.id)}>
                          Descargar QR
                        </button>
                      )}
                      {canPay && (
                        <button
                          type="button"
                          className="btn primary"
                          disabled={busy}
                          onClick={() => claimPaid(o.id)}
                        >
                          Ya pagué
                        </button>
                      )}
                      {o.status === 'awaiting_confirmation' && (
                        <span className="hist-hint">Verificando tu pago…</span>
                      )}
                      {o.status === 'completed' && (
                        <span className="hist-hint ok">Recarga completada</span>
                      )}
                      {(o.status === 'expired' || o.status === 'not_paid' || o.status === 'cancelled') && (
                        <span className="hist-hint bad">Pago no realizado / cancelada</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      <section className="how wrap" id="como">
        <div className="eyebrow">CÓMO FUNCIONA</div>
        <h2>4 pasos</h2>
        <ol className="steps">
          <li>Elige país (Bolivia o Brasil) y el juego.</li>
          <li>Elige la región del paquete igual a tu cuenta y el monto.</li>
          <li>Verifica tu ID (verás nombre y región).</li>
          <li>Paga el QR en moneda local (1 hora) y marca “Ya pagué”.</li>
        </ol>
      </section>

      <footer className="footer wrap">
        <span>DinoDev GAMES · Recargas digitales</span>
        <span>Precios locales según tasa configurada · Entrega vía proveedor</span>
      </footer>
      <a
        className="wa-float"
        href={`https://wa.me/${WA_NUMBER}?text=${WA_TEXT}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp soporte"
      >
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <path
            fill="#fff"
            d="M16.1 3C9.5 3 4.1 8.3 4.1 14.8c0 2.6.8 5 2.3 7L4 28.5l6.9-2.2c1.9 1 4 1.6 6.2 1.6 6.6 0 12-5.3 12-11.9S22.7 3 16.1 3zm0 21.6c-2 0-3.9-.5-5.6-1.5l-.4-.2-4.1 1.3 1.3-4-.3-.4c-1.1-1.7-1.7-3.7-1.7-5.8 0-5.5 4.5-10 10.1-10s10.1 4.5 10.1 10-4.5 10-10.1 10zm5.8-7.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6 0-.3-.2-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.2-.7-1.6-1-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 1.7.7 2.4.8 3.3.7.5-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4 0-.2-.3-.3-.6-.4z"
          />
        </svg>
      </a>
    </main>
  );
}

