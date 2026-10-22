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
  local_amount?: string; local_currency?: string; qr_url?: string | null;
  created_at?: string; pay_method?: string; pay_country?: string;
};

const STATUS: Record<string, string> = {
  pending_payment: 'Pendiente',
  awaiting_confirmation: 'Verificando pago',
  completed: 'Completado',
  cancelled: 'Cancelado',
  not_paid: 'No pagó',
  expired: 'Expirado',
  failed: 'Falló',
  processing: 'Procesando',
};

const WA = '5511966019490';
const JACK_WA = '59163614354';
const JACK_MSG = 'Hola Jack Dainor, quisiera un sitio web igual al de DinoDev GAMES';

// Binance Pay (public)
const BINANCE_UID = '1075673223';
const BINANCE_NAME = 'Carlos_Dainor';

const LS_ORDERS = 'dinodev_order_ids';
const LS_QR_MAP = 'dinodev_order_qr';

function loadIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_ORDERS) || '[]');
  } catch {
    return [];
  }
}
function saveIds(ids: string[]) {
  localStorage.setItem(LS_ORDERS, JSON.stringify(ids.slice(0, 40)));
}
function loadQrMap(): Record<string, { BO?: string; BR?: string; qrUrl?: string }> {
  try {
    return JSON.parse(localStorage.getItem(LS_QR_MAP) || '{}');
  } catch {
    return {};
  }
}
function saveQrMap(map: Record<string, any>) {
  localStorage.setItem(LS_QR_MAP, JSON.stringify(map));
}

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
  const [payTab, setPayTab] = useState<'BO' | 'BR' | 'BINANCE'>('BO');
  const [proofByOrder, setProofByOrder] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hist, setHist] = useState<HistOrder[]>([]);
  const [qrMap, setQrMap] = useState<Record<string, any>>({});
  const [receipt, setReceipt] = useState<HistOrder | null>(null);

  const publicQrBo =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_QR_URL_BO || ''
      : '';
  const publicQrBr =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_QR_URL_BR || process.env.NEXT_PUBLIC_PIX_KEY_BR || ''
      : '';
  const publicPix =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_PIX_KEY_BR || '' : '';

  useEffect(() => {
    setQrMap(loadQrMap());
    fetch('/api/auth/me')
      .then(async (r) => {
        if (r.ok) setUser((await r.json()).user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/catalog?list=games', { cache: 'no-store' });
        const text = await r.text();
        let d: any = {};
        try {
          d = text ? JSON.parse(text) : {};
        } catch {
          throw new Error('Respuesta inválida del catálogo');
        }
        if (!r.ok) throw new Error(d.error || `No se pudo cargar juegos (${r.status})`);
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
    setFields({});
    try {
      const q = new URLSearchParams({ bigCategoryId: String(g.bigCategoryId), market: mkt });
      if (rid) q.set('regionId', String(rid));
      const r = await fetch(`/api/catalog?${q}`, { cache: 'no-store' });
      const text = await r.text();
      let d: any = {};
      try {
        d = text ? JSON.parse(text) : {};
      } catch {
        throw new Error('Respuesta inválida del catálogo');
      }
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo cargar');
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
  const needsPlayerFields = requirements.length > 0;
  const isGiftLike = useMemo(() => {
    const name = `${game?.name || ''} ${product?.name || ''} ${product?.productType || ''}`;
    return /gift|voucher|card|codigo|razer|steam|roblox|telegram|apple|google/i.test(name);
  }, [game, product]);

  function rememberOrder(id: string, qrMeta?: any) {
    const ids = loadIds();
    saveIds([id, ...ids.filter((x) => x !== id)]);
    if (qrMeta) {
      const map = loadQrMap();
      map[id] = {
        BO: qrMeta.BO || qrMeta.qrUrl || publicQrBo || '',
        BR: qrMeta.BR || publicQrBr || publicPix || '',
        qrUrl: qrMeta.qrUrl || qrMeta.BO || publicQrBo || '',
      };
      saveQrMap(map);
      setQrMap(map);
    }
  }

  async function loadHistory() {
    try {
      const ids = loadIds();
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
      if (r.ok && d.success) {
        setHist(d.orders || []);
        // Merge qr_url from API into local map
        const map = loadQrMap();
        for (const o of d.orders || []) {
          if (o.qr_url && !map[o.id]?.qrUrl) {
            map[o.id] = { ...(map[o.id] || {}), qrUrl: o.qr_url, BO: map[o.id]?.BO || o.qr_url };
          }
        }
        saveQrMap(map);
        setQrMap(map);
      }
    } catch {
      /* */
    }
  }

  useEffect(() => {
    loadHistory();
    const t = setInterval(loadHistory, 15000);
    return () => clearInterval(t);
  }, []);

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (file.size > 2_500_000) {
        reject(new Error('La imagen debe ser menor a 2.5 MB'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
      reader.readAsDataURL(file);
    });
  }

  async function validate() {
    if (!selected || !category) return setError('Elige un paquete');
    setBusy(true);
    setBusyLabel('Verificando…');
    setError('');
    setNotice('');
    try {
      if (!needsPlayerFields && isGiftLike) {
        const label = Object.values(fields).filter(Boolean).join(' · ') || 'Gift card';
        setPlayer({ player_id: label || 'gift', player_name: label || 'Gift card', region: '' });
        setNotice('Listo para comprar.');
        return;
      }
      const playerId =
        fields.player_id ||
        fields.username ||
        fields.user_id ||
        fields.email ||
        Object.values(fields).find(Boolean) ||
        '';
      if (!String(playerId).trim()) throw new Error('Completa los datos pedidos para este producto.');

      const r = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selected,
          categoryId: category.id,
          playerId: String(playerId).trim(),
          ...fields,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo validar');
      setPlayer(d.player);
      setNotice(`Cuenta: ${d.player.player_name}${d.player.region ? ` · ${d.player.region}` : ''}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function buy(payMethod: 'wallet' | 'qr') {
    if (!product || !player || !category || !game) {
      setError('Primero verifica la cuenta / datos del producto.');
      return;
    }
    setBusy(true);
    setBusyLabel('Creando orden…');
    setError('');
    setNotice('');
    try {
      const method = payMethod === 'wallet' && user ? 'wallet' : 'qr';
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: product.id,
          categoryId: category.id,
          playerId: player.player_id || 'n/a',
          playerName: player.player_name || player.player_id || 'Jugador',
          gameName: game.name,
          gameSlug: game.slug,
          itemName: product.name,
          regionLabel: product.region || category.region || '',
          payCountry: market === 'BINANCE' ? 'BO' : market,
          payMethod: method,
          costUsd: product.costUsd,
        }),
      });
      const text = await r.text();
      let d: any = {};
      try {
        d = text ? JSON.parse(text) : {};
      } catch {
        d = { error: text || 'Respuesta inválida' };
      }
      if (!r.ok || !d.success) throw new Error(d.error || `No se pudo crear la orden (${r.status})`);

      setNotice(d.message || 'Orden creada. Revisa Mis pedidos abajo.');
      if (d.order?.id) {
        rememberOrder(d.order.id, {
          BO: d.order.qrOptions?.BO || d.order.qrUrl,
          BR: d.order.qrOptions?.BR,
          qrUrl: d.order.qrUrl,
        });
        setPayTab((d.order.payCountry as any) || market || 'BO');
        setPlayer(null); // collapse form; order lives in history only
        await loadHistory();
        // scroll to history
        setTimeout(() => {
          document.getElementById('historial')?.scrollIntoView({ behavior: 'smooth' });
        }, 200);
      }
      if (user) {
        const me = await fetch('/api/auth/me').then((x) => x.json()).catch(() => ({}));
        if (me.user) setUser(me.user);
      }
    } catch (e: any) {
      setError(e.message || 'Error al crear la orden');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function claimPaid(orderId: string) {
    const proof = proofByOrder[orderId];
    if (!proof) {
      setError('Sube el comprobante (JPG/PNG) antes de marcar Ya pagué.');
      return;
    }
    setBusy(true);
    setBusyLabel('Enviando comprobante…');
    setError('');
    try {
      const r = await fetch(`/api/checkout/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_paid', proofImage: proof }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo registrar');
      setNotice(d.message || 'Comprobante enviado. Verificando pago…');
      await loadHistory();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  function qrForOrder(order: HistOrder, tab: 'BO' | 'BR' | 'BINANCE') {
    const local = qrMap[order.id] || {};
    if (tab === 'BO') return local.BO || local.qrUrl || order.qr_url || publicQrBo || '';
    if (tab === 'BR') return local.BR || publicQrBr || publicPix || '';
    return '';
  }

  function receiptText(o: HistOrder) {
    const fecha = o.created_at
      ? new Date(o.created_at).toLocaleString('es-BO')
      : new Date().toLocaleString('es-BO');
    return (
      `🧾 RECIBO DE COMPRA\n` +
      `------------------------\n` +
      `📦 Producto: ${o.item_name || '—'} - ${o.game_name || '—'}\n` +
      `🆔 ID Jugador: ${o.player_id || '—'}\n` +
      `👤 Nick: ${o.player_name || '—'}\n` +
      `💰 Monto: ${o.local_currency || ''} ${o.local_amount || ''} · USD ${o.price_usd || ''}\n` +
      `📅 Fecha: ${fecha}\n` +
      `✅ Estado: ¡Entregado con éxito!\n` +
      `🎮 Gracias por preferirnos.\n` +
      `Orden: ${o.id}`
    );
  }

  async function copyReceipt(o: HistOrder) {
    try {
      await navigator.clipboard.writeText(receiptText(o));
      setNotice('Recibo copiado');
    } catch {
      setError('No se pudo copiar');
    }
  }

  function paymentBlock(o: HistOrder) {
    if (o.status !== 'pending_payment') {
      if (o.status === 'awaiting_confirmation') {
        return <p className="muted">Verificando pago… El admin confirmará pronto.</p>;
      }
      if (o.status === 'completed') {
        return (
          <button type="button" className="btn" style={{ marginTop: 6 }} onClick={() => setReceipt(o)}>
            Ver pedido
          </button>
        );
      }
      return null;
    }

    const qrBo = qrForOrder(o, 'BO');
    const qrBr = qrForOrder(o, 'BR');
    const activeQr = payTab === 'BO' ? qrBo : payTab === 'BR' ? qrBr : '';

    return (
      <div style={{ marginTop: 10 }}>
        <div className="market-row">
          <button
            type="button"
            className={`market-btn ${payTab === 'BO' ? 'active' : ''}`}
            onClick={() => setPayTab('BO')}
          >
            🇧🇴 QR Bolivia
          </button>
          <button
            type="button"
            className={`market-btn ${payTab === 'BR' ? 'active' : ''}`}
            onClick={() => setPayTab('BR')}
          >
            🇧🇷 Pix Brasil
          </button>
          <button
            type="button"
            className={`market-btn ${payTab === 'BINANCE' ? 'active' : ''}`}
            onClick={() => setPayTab('BINANCE')}
          >
            🟡 Binance Pay
          </button>
        </div>

        {payTab === 'BINANCE' ? (
          <div className="panel" style={{ marginTop: 8 }}>
            <p>
              Paga <strong>USD {o.price_usd}</strong> por Binance Pay
            </p>
            <p>
              UID: <strong>{BINANCE_UID}</strong>
            </p>
            <p>
              Nombre: <strong>{BINANCE_NAME}</strong>
            </p>
            <p className="muted">Envía el monto exacto y sube el comprobante.</p>
          </div>
        ) : payTab === 'BR' ? (
          <div style={{ marginTop: 8 }}>
            {qrBr && qrBr.startsWith('http') ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrBr}
                  alt="QR Pix Brasil"
                  style={{ maxWidth: 220, borderRadius: 12, background: '#fff', padding: 8 }}
                />
                <div style={{ marginTop: 8 }}>
                  <a className="btn" href={qrBr} download={`QR-BR-${o.id.slice(0, 8)}.png`} target="_blank" rel="noreferrer">
                    Descargar QR
                  </a>
                </div>
              </>
            ) : null}
            {(publicPix || qrBr) && (
              <p style={{ marginTop: 8 }}>
                Pix / llave:{' '}
                <strong
                  style={{ wordBreak: 'break-all' }}
                  onClick={() => navigator.clipboard?.writeText(publicPix || qrBr)}
                >
                  {publicPix || qrBr}
                </strong>
              </p>
            )}
            <p className="muted">
              Monto: <strong>
                {o.local_currency === 'BRL' ? 'R$' : o.local_currency} {o.local_amount}
              </strong>{' '}
              (USD {o.price_usd})
            </p>
            {!qrBr && !publicPix && (
              <p className="muted">Configura NEXT_PUBLIC_QR_URL_BR o NEXT_PUBLIC_PIX_KEY_BR en Vercel.</p>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {qrBo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrBo}
                  alt="QR Bolivia"
                  style={{ maxWidth: 220, borderRadius: 12, background: '#fff', padding: 8 }}
                />
                <div style={{ marginTop: 8 }}>
                  <a className="btn" href={qrBo} download={`QR-BO-${o.id.slice(0, 8)}.png`} target="_blank" rel="noreferrer">
                    Descargar QR
                  </a>
                </div>
                <p className="muted">
                  Monto: <strong>
                    {o.local_currency === 'BOB' ? 'Bs' : o.local_currency} {o.local_amount}
                  </strong>{' '}
                  (USD {o.price_usd}) · 1 hora
                </p>
              </>
            ) : (
              <p className="muted">Configura NEXT_PUBLIC_QR_URL_BO (o QR_URL_BO) en Vercel.</p>
            )}
          </div>
        )}

        <label style={{ marginTop: 10 }}>
          Comprobante (JPG/PNG) — obligatorio
          <input
            type="file"
            accept="image/jpeg,image/png,image/jpg,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = await fileToDataUrl(f);
                setProofByOrder((m) => ({ ...m, [o.id]: data }));
                setNotice('Comprobante listo. Ahora puedes marcar Ya pagué.');
              } catch (err: any) {
                setError(err.message);
              }
            }}
          />
        </label>
        {proofByOrder[o.id] && <p className="muted">✓ Comprobante cargado</p>}

        <button
          type="button"
          className="btn primary"
          disabled={busy || !proofByOrder[o.id]}
          onClick={() => claimPaid(o.id)}
          style={{ marginTop: 8 }}
        >
          {busy && busyLabel.includes('comprobante') ? 'Enviando…' : 'Ya pagué'}
        </button>
      </div>
    );
  }

  return (
    <main className="wrap">
      <header className="topbar">
        <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)}>
          ☰ Menú
        </button>
        <a className="brand" href="/">
          <img src="/logo.png" alt="DinoDev" />
          <span>
            DinoDev <span style={{ color: 'var(--accent)' }}>GAMES</span>
            <small>RECARGAS ONLINE</small>
          </span>
        </a>
        <div className="top-links">
          {user ? (
            <a className="btn" href="/cuenta">
              {user.username}
            </a>
          ) : (
            <>
              <a className="btn" href="/login">
                Entrar
              </a>
              <a className="btn primary" href="/register">
                Registro
              </a>
            </>
          )}
        </div>
      </header>

      {!user && (
        <div className="alert ok" style={{ marginTop: 8, fontSize: '0.9rem' }}>
          💡 Regístrate para que tus recargas sean más seguras y uses billetera USDT.{' '}
          <a href="/register">
            <strong>Crear cuenta</strong>
          </a>
        </div>
      )}

      {menuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <strong style={{ marginBottom: 8 }}>DinoDev GAMES</strong>
            <a href="/" onClick={() => setMenuOpen(false)}>
              🏠 Inicio
            </a>
            <a href="#recargar" onClick={() => setMenuOpen(false)}>
              🎮 Catálogo
            </a>
            <a href="#historial" onClick={() => setMenuOpen(false)}>
              📋 Mis pedidos
            </a>
            <a href="#como" onClick={() => setMenuOpen(false)}>
              ❓ Cómo funciona
            </a>
            {user ? (
              <>
                <a href="/cuenta" onClick={() => setMenuOpen(false)}>
                  👤 Mi cuenta
                </a>
                <a href="/billetera" onClick={() => setMenuOpen(false)}>
                  💳 Mi billetera
                </a>
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
                <a href="/login" onClick={() => setMenuOpen(false)}>
                  Iniciar sesión
                </a>
                <a href="/register" onClick={() => setMenuOpen(false)}>
                  Crear cuenta
                </a>
              </>
            )}
          </aside>
        </>
      )}

      <section className="hero">
        <img className="hero-logo" src="/logo.png" alt="DinoDev GAMES" />
        <h1>
          Juega más.
          <br />
          <span style={{ color: 'var(--accent)' }}>Paga sin complicaciones.</span>
        </h1>
        <p>Recargas y gift cards. Bolivia, Brasil o Binance Pay.</p>
      </section>

      <section id="recargar">
        <div className="market-row">
          <button
            type="button"
            className={`market-btn ${market === 'BO' ? 'active' : ''}`}
            onClick={() => setMarket('BO')}
          >
            🇧🇴 Bolivia · Bs
          </button>
          <button
            type="button"
            className={`market-btn ${market === 'BR' ? 'active' : ''}`}
            onClick={() => setMarket('BR')}
          >
            🇧🇷 Brasil · R$
          </button>
          <button
            type="button"
            className={`market-btn ${market === 'BINANCE' ? 'active' : ''}`}
            onClick={() => setMarket('BINANCE')}
          >
            🟡 Binance Pay · USD
          </button>
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

        {product && (
          <section className="panel">
            <h2>{isGiftLike ? 'Datos de la compra' : 'Datos de la cuenta'}</h2>
            <p className="muted">
              {isGiftLike
                ? 'Gift card: puede pedir usuario/email o nada.'
                : 'Ingresa el ID o datos del juego. No pedimos contraseña.'}
            </p>

            {requirements.length > 0 ? (
              requirements.map((req) => (
                <label key={req.field_name}>
                  {req.label || req.field_name}
                  {req.select_options?.length ? (
                    <select
                      value={fields[req.field_name] || ''}
                      onChange={(e) => setFields((f) => ({ ...f, [req.field_name]: e.target.value }))}
                    >
                      <option value="">Elegir…</option>
                      {req.select_options.map((opt: any, i: number) => (
                        <option key={i} value={String(opt.value ?? opt.id ?? opt)}>
                          {String(opt.label ?? opt.name ?? opt.value ?? opt)}
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
                      onChange={(e) => setFields((f) => ({ ...f, [req.field_name]: e.target.value }))}
                      placeholder={req.label || req.field_name}
                    />
                  )}
                </label>
              ))
            ) : (
              <p className="muted">Este producto no pide ID. Puedes continuar.</p>
            )}

            <button type="button" className="btn" disabled={busy} onClick={validate}>
              {needsPlayerFields || !isGiftLike ? 'Verificar cuenta' : 'Continuar'}
            </button>

            {player && product && (
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {user && (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() => buy('wallet')}
                      style={{ flex: '1 1 140px' }}
                    >
                      {busy && busyLabel.includes('orden')
                        ? 'Creando…'
                        : `Billetera (${Number(user.balance_usd).toFixed(2)} USD)`}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => buy('qr')}
                    style={{ flex: '1 1 140px' }}
                  >
                    {busy && busyLabel.includes('orden') ? 'Creando…' : 'Pagar con QR'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </section>

      <section className="panel" id="historial">
        <h2>Mis pedidos</h2>
        <p className="muted">Se guardan en este dispositivo aunque actualices la página.</p>
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
            <small className="muted">{o.id}</small>
            {paymentBlock(o)}
          </div>
        ))}
        {!hist.length && <p className="muted">Sin pedidos aún.</p>}
      </section>

      <section className="panel" id="como">
        <h2>Cómo funciona</h2>
        <ol className="steps">
          <li>1. Elige juego / gift card y región.</li>
          <li>2. Completa los datos que pide el producto.</li>
          <li>3. Crea la orden y paga (QR Bs, Pix Br o Binance).</li>
          <li>
            4. Sube el comprobante y pulsa <strong>Ya pagué</strong>.
          </li>
          <li>5. El admin verifica y completa la recarga.</li>
        </ol>
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
        aria-label="WhatsApp"
      >
        <svg width="28" height="28" viewBox="0 0 32 32" fill="currentColor" aria-hidden>
          <path d="M16.01 3C9.39 3 4 8.39 4 15c0 2.11.55 4.09 1.51 5.82L4 29l8.36-1.46A11.9 11.9 0 0 0 16 27c6.63 0 12-5.37 12-12S22.63 3 16.01 3zm0 2c5.51 0 10 4.49 10 10s-4.49 10-10 10c-1.73 0-3.36-.44-4.78-1.22l-.34-.19-4.96.87.9-4.83-.22-.36A9.93 9.93 0 0 1 6 15c0-5.51 4.49-10 10.01-10zm5.56 14.42c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.63-1.19-1.42-1.33-1.66-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62 2.41 1.04 2.41.69 2.84.66.43-.04 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z" />
        </svg>
      </a>

      {receipt && (
        <div className="drawer-backdrop" style={{ display: 'grid', placeItems: 'center', padding: 16 }} onClick={() => setReceipt(null)}>
          <div className="panel" style={{ maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2>Recibo</h2>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, margin: 0 }}>
              {receiptText(receipt)}
            </pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn primary" onClick={() => copyReceipt(receipt)}>
                Copiar recibo
              </button>
              <button type="button" className="btn" onClick={() => setReceipt(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
