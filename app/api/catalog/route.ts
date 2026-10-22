import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { getSettings, localFromUsd, sellPriceUsd } from '@/lib/settings';
import { s2t, safeError } from '@/lib/shop2topup';
import { notifyTelegram } from '@/lib/notify';

function qrFor(market: string) {
  const m = market.toUpperCase();
  if (m === 'BR') return process.env.QR_URL_BR || process.env.PIX_KEY_BR || null;
  return process.env.QR_URL_BO || null;
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const user = await getSessionUser();
    const b = await req.json();
    const itemId = Number(b.itemId);
    const categoryId = Number(b.categoryId);
    const playerId = String(b.playerId || '').trim();
    const playerName = String(b.playerName || '');
    const gameName = String(b.gameName || 'Juego');
    const itemName = String(b.itemName || 'Pack');
    const regionLabel = String(b.regionLabel || '');
    const market = String(b.payCountry || 'BO').toUpperCase();
    const payMethod = String(b.payMethod || (user ? 'wallet' : 'qr'));

    if (!itemId || !categoryId || !playerId) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    let cost = Number(b.costUsd || 0);
    try {
      const q = await s2t(`/catalog/subcategory/${itemId}/price`);
      cost = Number(q?.unit_price ?? q?.price?.unit_price ?? cost);
    } catch { /* */ }

    const settings = await getSettings();
    const priceUsd = sellPriceUsd(cost, settings.markupUsd);
    const local = localFromUsd(priceUsd, market, settings.rateBo, settings.rateBr);
    const id = randomUUID();
    const db = sql();

    if (payMethod === 'wallet') {
      if (!user) return NextResponse.json({ error: 'Inicia sesión para pagar con billetera.' }, { status: 401 });
      const bal = Number(user.balance_usd);
      if (bal < priceUsd) {
        return NextResponse.json(
          { error: `Saldo insuficiente. Tienes ${bal.toFixed(4)} USD, el pack cuesta ${priceUsd.toFixed(4)} USD.` },
          { status: 402 }
        );
      }
      await db`
        UPDATE app_users SET balance_usd = balance_usd - ${priceUsd}, updated_at = now()
        WHERE id = ${user.id}::uuid AND balance_usd >= ${priceUsd}
      `;
      await db`
        INSERT INTO wallet_ledger (user_id, amount_usd, kind, status, note)
        VALUES (${user.id}::uuid, ${-priceUsd}, 'purchase', 'completed', ${'Orden ' + id})
      `;
      await db`
        INSERT INTO payment_orders (
          id, status, user_id, game_name, item_name, item_id, category_id,
          player_id, player_name, region_label, cost_usd, price_usd,
          local_amount, local_currency, pay_country, pay_method, expires_at
        ) VALUES (
          ${id}::uuid, 'awaiting_confirmation', ${user.id}::uuid, ${gameName}, ${itemName}, ${itemId}, ${categoryId},
          ${playerId}, ${playerName}, ${regionLabel}, ${cost}, ${priceUsd},
          ${local.amount}, ${local.currency}, ${market}, 'wallet', now() + interval '1 hour'
        )
      `;
      await notifyTelegram(
        `🛒 <b>Pedido billetera</b>\n${user.username} · ${gameName} ${itemName}\n` +
          `${playerName || playerId} · ${priceUsd.toFixed(4)} USD\nID: ${id}`
      );
      return NextResponse.json({
        success: true,
        order: { id, status: 'awaiting_confirmation', priceUsd, payMethod: 'wallet' },
        message: 'Pagado con billetera. El admin enviará la recarga.',
      });
    }

    // QR guest flow — order pending_payment
    if (user?.id) {
      await db`
        INSERT INTO payment_orders (
          id, status, user_id, game_name, item_name, item_id, category_id,
          player_id, player_name, region_label, cost_usd, price_usd,
          local_amount, local_currency, pay_country, pay_method, expires_at
        ) VALUES (
          ${id}::uuid, 'pending_payment', ${user.id}::uuid, ${gameName}, ${itemName}, ${itemId}, ${categoryId},
          ${playerId}, ${playerName}, ${regionLabel}, ${cost}, ${priceUsd},
          ${local.amount}, ${local.currency}, ${market}, 'qr', now() + interval '1 hour'
        )
      `;
    } else {
      await db`
        INSERT INTO payment_orders (
          id, status, game_name, item_name, item_id, category_id,
          player_id, player_name, region_label, cost_usd, price_usd,
          local_amount, local_currency, pay_country, pay_method, expires_at
        ) VALUES (
          ${id}::uuid, 'pending_payment', ${gameName}, ${itemName}, ${itemId}, ${categoryId},
          ${playerId}, ${playerName}, ${regionLabel}, ${cost}, ${priceUsd},
          ${local.amount}, ${local.currency}, ${market}, 'qr', now() + interval '1 hour'
        )
      `;
    }
    const qrUrl = qrFor(market);
    if (qrUrl) {
      await db`UPDATE payment_orders SET qr_url = ${qrUrl} WHERE id = ${id}::uuid`;
    }
    await notifyTelegram(
      `💳 <b>Nueva orden QR</b>\n${gameName} ${itemName}\n${local.symbol} ${local.amount} · ${id}`
    );
    return NextResponse.json({
      success: true,
      order: {
        id,
        status: 'pending_payment',
        priceUsd,
        localAmount: local.amount,
        localCurrency: local.currency,
        symbolLocal: local.symbol,
        payMethod: 'qr',
        qrUrl,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
