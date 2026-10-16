import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { s2t, safeError } from '@/lib/shop2topup';
import { sql } from '@/lib/db';
import { getPayCountry, localAmount, PAYMENT_TTL_MS, PAY_COUNTRIES } from '@/lib/money';
import { notifyTelegram } from '@/lib/notify';

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.requirements)) return body.requirements;
  return [];
}

async function ensureTables() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id uuid PRIMARY KEY,
      status text NOT NULL,
      game_slug text NOT NULL,
      game_name text NOT NULL,
      item_id integer NOT NULL,
      item_name text NOT NULL,
      category_id integer NOT NULL,
      region_label text,
      player_id text NOT NULL,
      player_name text NOT NULL,
      player_region text,
      usd_price numeric NOT NULL,
      local_currency text NOT NULL,
      local_amount numeric NOT NULL,
      pay_country text NOT NULL,
      qr_url text,
      expires_at timestamptz NOT NULL,
      provider_order_id text,
      provider_response jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  return db;
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const itemId = Number(b.itemId);
    const categoryId = Number(b.categoryId);
    const playerId = String(b.playerId || '').trim();
    const playerName = String(b.playerName || '').trim();
    const playerRegion = String(b.playerRegion || '').trim();
    const payCountry = String(b.payCountry || 'BO').toUpperCase();
    const gameSlug = String(b.gameSlug || 'freefire');
    const gameName = String(b.gameName || 'Free Fire');
    const itemName = String(b.itemName || 'Paquete');
    const regionLabel = String(b.regionLabel || '');

    if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isSafeInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: 'Selecciona un paquete válido.' }, { status: 400 });
    }
    if (!/^\d{5,20}$/.test(playerId) || !playerName) {
      return NextResponse.json({ error: 'Valida el ID del jugador antes de pagar.' }, { status: 400 });
    }
    if (!PAY_COUNTRIES.some((c) => c.code === payCountry)) {
      return NextResponse.json({ error: 'País de pago no soportado. Elige Bolivia o Brasil.' }, { status: 400 });
    }

    // Live price from provider
    const pd = await s2t(`/catalog/subcategory/${itemId}/price`);
    const usd = Number(pd.unit_price ?? pd.price?.unit_price);
    if (!Number.isFinite(usd) || usd <= 0) {
      return NextResponse.json({ error: 'El proveedor no devolvió un precio válido.' }, { status: 502 });
    }

    const local = localAmount(usd, payCountry);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + PAYMENT_TTL_MS).toISOString();
    const db = await ensureTables();

    await db`
      INSERT INTO payment_orders (
        id, status, game_slug, game_name, item_id, item_name, category_id, region_label,
        player_id, player_name, player_region, usd_price, local_currency, local_amount,
        pay_country, qr_url, expires_at
      ) VALUES (
        ${id}::uuid, 'pending_payment', ${gameSlug}, ${gameName}, ${itemId}, ${itemName}, ${categoryId}, ${regionLabel},
        ${playerId}, ${playerName}, ${playerRegion}, ${String(usd)}, ${local.currency}, ${String(local.amount)},
        ${payCountry}, ${local.qrUrl || null}, ${expiresAt}::timestamptz
      )
    `;

    const country = getPayCountry(payCountry);

    await notifyTelegram(
      `🟡 Nueva orden QR (esperando pago)\n` +
      `${gameName} · ${itemName}\n` +
      `Jugador: ${playerName} (${playerId})\n` +
      `Monto: ${local.currency} ${local.amount} (${payCountry})\n` +
      `Orden: ${id}`
    );

    return NextResponse.json({
      success: true,
      order: {
        id,
        status: 'pending_payment',
        expiresAt,
        gameName,
        itemName,
        regionLabel,
        playerId,
        playerName,
        playerRegion,
        usdPrice: usd,
        localAmount: local.amount,
        localCurrency: local.currency,
        localSymbol: local.symbol,
        payCountry: country.code,
        payCountryName: country.name,
        method: local.method,
        qrUrl: local.qrUrl || null,
        pixKey: local.pixKey || null,
        rate: local.rate,
      },
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
