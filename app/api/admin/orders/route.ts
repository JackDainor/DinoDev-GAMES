import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { s2t, safeError } from '@/lib/shop2topup';
import { notifyTelegram } from '@/lib/notify';

function authed(req: NextRequest) {
  const secret = process.env.OPERATOR_SECRET || '';
  return !!secret && (req.headers.get('x-admin-secret') || '') === secret;
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await ensureSchema();
    const db = sql();
    const rows = await db`
      SELECT id, status, game_name, item_name, player_id, player_name, region_label,
             cost_usd::text, price_usd::text, local_amount::text, local_currency,
             pay_method, pay_country, created_at, expires_at
      FROM payment_orders ORDER BY created_at DESC LIMIT 100
    `;
    return NextResponse.json({ success: true, orders: rows });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await ensureSchema();
    const b = await req.json();
    const id = String(b.id || '');
    const action = String(b.action || 'fulfill');
    const db = sql();
    const rows = await db`SELECT * FROM payment_orders WHERE id = ${id}::uuid LIMIT 1`;
    const order = rows[0];
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

    if (action === 'cancel') {
      await db`UPDATE payment_orders SET status = 'cancelled', updated_at = now() WHERE id = ${id}::uuid`;
      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    if (action === 'fulfill') {
      const out = await s2t('/orders/create', {
        method: 'POST',
        body: JSON.stringify({
          order_id: id,
          sub_category_id: Number(order.item_id),
          quantity: 1,
          requirements: { player_id: order.player_id },
          expected_unit_price: String(order.cost_usd),
        }),
      });
      const st = String(out.order?.status ?? out.status ?? '').toLowerCase();
      const failed = /fail|error|cancel|reject/i.test(st);
      const finalStatus = failed ? 'failed' : 'completed';
      await db`
        UPDATE payment_orders SET
          status = ${finalStatus},
          provider_response = ${JSON.stringify(out)}::jsonb,
          updated_at = now()
        WHERE id = ${id}::uuid
      `;
      await notifyTelegram(
        finalStatus === 'completed'
          ? `✅ Enviado #${id.slice(0, 8)} ${order.game_name}`
          : `❌ Falló envío #${id.slice(0, 8)}`
      );
      return NextResponse.json({ success: true, status: finalStatus, provider: out });
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
