import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { getSettings, localFromUsd, sellPriceUsd, slugify } from '@/lib/settings';
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
    const playerId = String(b.playerId || '').trim() || 'n/a';
    const playerName = String(b.playerName || playerId);
    const gameName = String(b.gameName || 'Juego');
    const gameSlug = String(b.gameSlug || b.slug || slugify(gameName) || 'game');
    const itemName = String(b.itemName || 'Pack');
    const regionLabel = String(b.regionLabel || '');
    const market = String(b.payCountry || 'BO').toUpperCase();
    let payMethod = String(b.payMethod || 'qr').toLowerCase();
    if (payMethod !== 'wallet') payMethod = 'qr';

    if (!itemId || !categoryId) {
      return NextResponse.json({ error: 'Datos incompletos (paquete).' }, { status: 400 });
    }

    let cost = Number(b.costUsd || 0);
    try {
      const q = await s2t(`/catalog/subcategory/${itemId}/price`);
      cost = Number(q?.unit_price ?? q?.price?.unit_price ?? cost);
    } catch {
      /* */
    }

    const settings = await getSettings();
    const priceUsd = sellPriceUsd(cost, settings.markupUsd, itemId, settings.priceOverrides);
    const local = localFromUsd(priceUsd, market, settings.rateBo, settings.rateBr);
    const id = randomUUID();
    const db = sql();

    const qrBo = process.env.QR_URL_BO || null;
    const qrBr = process.env.QR_URL_BR || process.env.PIX_KEY_BR || null;
    const qrUrl = qrFor(market) || qrBo || qrBr;

    // Includes legacy columns usd_price / local_price used by older Neon schema
    if (payMethod === 'wallet') {
      if (!user) {
        return NextResponse.json({ error: 'Inicia sesión para pagar con billetera.' }, { status: 401 });
      }
      const bal = Number(user.balance_usd);
      if (bal < priceUsd) {
        return NextResponse.json(
          {
            error: `Saldo insuficiente. Tienes ${bal.toFixed(4)} USD, el pack cuesta ${priceUsd.toFixed(4)} USD.`,
          },
          { status: 402 }
        );
      }
      await db`
        UPDATE app_users SET balance_usd = balance_usd - ${priceUsd}, updated_at = now()
        WHERE id = ${user.id}::uuid AND balance_usd >= ${priceUsd}
      `;
      try {
        await db`
          INSERT INTO wallet_ledger (user_id, amount_usd, kind, status, note)
          VALUES (${user.id}::uuid, ${-priceUsd}, 'purchase', 'completed', ${'Orden ' + id})
        `;
      } catch {
        /* */
      }

      await db`
        INSERT INTO payment_orders (
          id, status, user_id, game_name, game_slug, item_name, item_id, category_id,
          player_id, player_name, region_label,
          cost_usd, price_usd, usd_price,
          local_amount, local_price, local_currency,
          pay_country, pay_method, qr_url, expires_at
        ) VALUES (
          ${id}::uuid, 'awaiting_confirmation', ${user.id}::uuid,
          ${gameName}, ${gameSlug}, ${itemName}, ${itemId}, ${categoryId},
          ${playerId}, ${playerName}, ${regionLabel},
          ${cost}, ${priceUsd}, ${priceUsd},
          ${local.amount}, ${local.amount}, ${local.currency},
          ${market}, 'wallet', ${qrUrl},
          now() + interval '1 hour'
        )
      `;

      await notifyTelegram(
        `🛒 Pedido BILLETERA\n${user.username} (${user.email})\nWA: ${user.whatsapp || '—'}\n` +
          `${gameName} · ${itemName}\n${playerName} (${playerId})\n` +
          `USD ${priceUsd.toFixed(4)}\nOrden: ${id}`
      );

      return NextResponse.json({
        success: true,
        order: {
          id,
          status: 'awaiting_confirmation',
          priceUsd,
          payMethod: 'wallet',
          localAmount: local.amount,
          localCurrency: local.currency,
          symbolLocal: local.symbol,
        },
        message: 'Pagado con billetera. El admin enviará la recarga.',
      });
    }

    const userId = user?.id || null;
    if (userId) {
      await db`
        INSERT INTO payment_orders (
          id, status, user_id, game_name, game_slug, item_name, item_id, category_id,
          player_id, player_name, region_label,
          cost_usd, price_usd, usd_price,
          local_amount, local_price, local_currency,
          pay_country, pay_method, qr_url, expires_at
        ) VALUES (
          ${id}::uuid, 'pending_payment', ${userId}::uuid,
          ${gameName}, ${gameSlug}, ${itemName}, ${itemId}, ${categoryId},
          ${playerId}, ${playerName}, ${regionLabel},
          ${cost}, ${priceUsd}, ${priceUsd},
          ${local.amount}, ${local.amount}, ${local.currency},
          ${market}, 'qr', ${qrUrl},
          now() + interval '1 hour'
        )
      `;
    } else {
      await db`
        INSERT INTO payment_orders (
          id, status, game_name, game_slug, item_name, item_id, category_id,
          player_id, player_name, region_label,
          cost_usd, price_usd, usd_price,
          local_amount, local_price, local_currency,
          pay_country, pay_method, qr_url, expires_at
        ) VALUES (
          ${id}::uuid, 'pending_payment',
          ${gameName}, ${gameSlug}, ${itemName}, ${itemId}, ${categoryId},
          ${playerId}, ${playerName}, ${regionLabel},
          ${cost}, ${priceUsd}, ${priceUsd},
          ${local.amount}, ${local.amount}, ${local.currency},
          ${market}, 'qr', ${qrUrl},
          now() + interval '1 hour'
        )
      `;
    }

    const who = user
      ? `Usuario: ${user.username} · ${user.email}${user.whatsapp ? ' · WA ' + user.whatsapp : ''}`
      : 'Invitado (sin cuenta)';

    await notifyTelegram(
      `💳 Nueva orden QR\n${who}\n${gameName} · ${itemName}\n` +
        `${playerName} (${playerId})\n${local.symbol} ${local.amount} · USD ${priceUsd.toFixed(4)}\n` +
        `Orden: ${id}`
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
        payCountry: market,
        qrUrl,
        qrOptions: {
          BO: qrBo,
          BR: qrBr,
          BINANCE: process.env.NEXT_PUBLIC_BINANCE_PAY_ID || null,
        },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      message: 'Orden creada. Elige método de pago y sube el comprobante.',
    });
  } catch (e) {
    const x = safeError(e);
    console.error('[checkout]', e);
    return NextResponse.json(
      { error: x.error || 'No se pudo crear la orden', status: x.status || 500 },
      { status: x.status || 500 }
    );
  }
}
