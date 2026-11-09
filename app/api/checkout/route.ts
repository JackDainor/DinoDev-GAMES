import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { getSettings, localFromUsd, sellPriceUsd, slugify } from '@/lib/settings';
import { dcConfigFrom, dcCost } from '@/lib/dinocoin';
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
    const market = String(b.payCountry || 'BO').toUpperCase() === 'BR' ? 'BR' : 'BO';
    let payMethod = String(b.payMethod || 'qr').toLowerCase();
    if (payMethod !== 'wallet' && payMethod !== 'dinocoin') payMethod = 'qr';

    if (!itemId || !categoryId) {
      return NextResponse.json({ error: 'Datos incompletos (paquete).' }, { status: 400 });
    }

    // Costo real en Shop2TopUp (nunca confiamos en el costo que manda el navegador)
    let cost = Number(b.costUsd || 0);
    let costVerified = false;
    try {
      const q = await s2t(`/catalog/subcategory/${itemId}/price`);
      const c = Number(q?.unit_price ?? q?.price?.unit_price);
      if (Number.isFinite(c) && c > 0) {
        cost = c;
        costVerified = true;
      }
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

    async function insertOrder(status: string, method: string, userId: string | null, dcSpent: number | null) {
      await db`
        INSERT INTO payment_orders (
          id, status, user_id, game_name, game_slug, item_name, item_id, category_id,
          player_id, player_name, region_label,
          cost_usd, price_usd, usd_price,
          local_amount, local_price, local_currency,
          pay_country, pay_method, qr_url, dc_cost, expires_at
        ) VALUES (
          ${id}::uuid, ${status}, ${userId}::uuid,
          ${gameName}, ${gameSlug}, ${itemName}, ${itemId}, ${categoryId},
          ${playerId}, ${playerName}, ${regionLabel},
          ${cost}, ${priceUsd}, ${priceUsd},
          ${local.amount}, ${local.amount}, ${local.currency},
          ${market}, ${method}, ${qrUrl}, ${dcSpent},
          now() + interval '1 hour'
        )
      `;
    }

    /* ───────── Pago con DinoCoin ───────── */
    if (payMethod === 'dinocoin') {
      if (!user) {
        return NextResponse.json({ error: 'Inicia sesión para pagar con DinoCoin.' }, { status: 401 });
      }
      const cfg = dcConfigFrom(settings);
      if (!cfg.enabled) {
        return NextResponse.json({ error: 'DinoCoin está desactivado por ahora.' }, { status: 400 });
      }
      if (!costVerified) {
        return NextResponse.json(
          { error: 'No se pudo confirmar el precio del pack. Intenta de nuevo.' },
          { status: 502 }
        );
      }
      const dcPrice = dcCost(cost, cfg);
      if (dcPrice <= 0) {
        return NextResponse.json({ error: 'Este pack no se puede canjear.' }, { status: 400 });
      }

      // Descuento atómico: solo si alcanza el saldo.
      const upd = await db`
        UPDATE app_users SET dinocoin = dinocoin - ${dcPrice}, updated_at = now()
        WHERE id = ${user.id}::uuid AND dinocoin >= ${dcPrice}
        RETURNING dinocoin
      `;
      if (!upd.length) {
        const missing = Math.max(0, dcPrice - Number(user.dinocoin || 0));
        return NextResponse.json(
          {
            error: `DinoCoin insuficientes. Tienes ${user.dinocoin}, este pack cuesta ${dcPrice} (te faltan ${missing}).`,
          },
          { status: 402 }
        );
      }

      try {
        await insertOrder('awaiting_confirmation', 'dinocoin', user.id, dcPrice);
        await db`
          INSERT INTO dinocoin_ledger (user_id, amount, kind, order_id, note)
          VALUES (${user.id}::uuid, ${-dcPrice}, 'spend', ${id}::uuid, ${gameName + ' · ' + itemName})
        `;
      } catch (err) {
        // Si algo falla después de descontar, devolvemos los puntos.
        await db`UPDATE app_users SET dinocoin = dinocoin + ${dcPrice}, updated_at = now() WHERE id = ${user.id}::uuid`;
        throw err;
      }

      await notifyTelegram(
        `🪙 Pedido DINOCOIN\n${user.username} (${user.email})\nWA: ${user.whatsapp || '—'}\n` +
          `${gameName} · ${itemName}\n${playerName} (${playerId})\n` +
          `${dcPrice} DC · costo S2T USD ${cost.toFixed(4)}\nOrden: ${id}`
      );

      return NextResponse.json({
        success: true,
        order: {
          id,
          status: 'awaiting_confirmation',
          priceUsd,
          payMethod: 'dinocoin',
          dcCost: dcPrice,
          dinocoinBalance: Number(upd[0].dinocoin),
          localAmount: local.amount,
          localCurrency: local.currency,
          symbolLocal: local.symbol,
        },
        message: `Pagado con ${dcPrice} DinoCoin. El admin enviará tu recarga.`,
      });
    }

    /* ───────── Pago con billetera USD ───────── */
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
      const upd = await db`
        UPDATE app_users SET balance_usd = balance_usd - ${priceUsd}, updated_at = now()
        WHERE id = ${user.id}::uuid AND balance_usd >= ${priceUsd}
        RETURNING id
      `;
      if (!upd.length) {
        return NextResponse.json({ error: 'Saldo insuficiente.' }, { status: 402 });
      }
      try {
        await db`
          INSERT INTO wallet_ledger (user_id, amount_usd, kind, status, note)
          VALUES (${user.id}::uuid, ${-priceUsd}, 'purchase', 'completed', ${'Orden ' + id})
        `;
      } catch {
        /* */
      }

      await insertOrder('awaiting_confirmation', 'wallet', user.id, null);

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

    /* ───────── Pago con QR ───────── */
    await insertOrder('pending_payment', 'qr', user?.id || null, null);

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
      message: 'Orden creada. Paga y sube el comprobante.',
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
