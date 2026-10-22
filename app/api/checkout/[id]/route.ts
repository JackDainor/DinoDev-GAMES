import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { notifyTelegram } from '@/lib/notify';
import { safeError } from '@/lib/shop2topup';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureSchema();
    const db = sql();
    const rows = await db`
      SELECT id, status, game_name, item_name, player_id, player_name,
             price_usd::text, local_amount::text, local_currency, pay_method,
             pay_country, qr_url, created_at, expires_at
      FROM payment_orders WHERE id = ${params.id}::uuid LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, order: rows[0] });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureSchema();
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || 'claim_paid');
    const db = sql();
    const rows = await db`SELECT * FROM payment_orders WHERE id = ${params.id}::uuid LIMIT 1`;
    const order = rows[0];
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

    if (action === 'claim_paid') {
      if (order.status !== 'pending_payment') {
        return NextResponse.json({
          success: true,
          status: order.status,
          message: 'La orden ya fue marcada.',
        });
      }
      await db`
        UPDATE payment_orders
        SET status = 'awaiting_confirmation', updated_at = now()
        WHERE id = ${params.id}::uuid
      `;
      await notifyTelegram(
        `💰 <b>Cliente marcó YA PAGUÉ</b>\n` +
          `${order.game_name || ''} · ${order.item_name || ''}\n` +
          `Jugador: ${order.player_name || order.player_id}\n` +
          `${order.local_currency || ''} ${order.local_amount || ''} · USD ${order.price_usd}\n` +
          `Orden: ${params.id}\n` +
          `Confirma en /admin y envía la recarga.`
      );
      return NextResponse.json({
        success: true,
        status: 'awaiting_confirmation',
        message: 'Pago registrado. Estamos verificando…',
      });
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
