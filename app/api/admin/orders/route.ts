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
             pay_method, pay_country, created_at, expires_at, user_id
      FROM payment_orders
      ORDER BY created_at DESC
      LIMIT 100
    `;
    let balance: string | null = null;
    try {
      const acc = await s2t('/account');
      const data = acc.data || acc.account || acc;
      balance = String(data.balance ?? data.wallet_balance ?? data.credit ?? '');
      if (balance === 'undefined' || balance === 'null') balance = null;
    } catch {
      /* */
    }
    return NextResponse.json({ success: true, orders: rows, balance });
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

    if (action === 'not_paid') {
      await db`UPDATE payment_orders SET status = 'not_paid', updated_at = now() WHERE id = ${id}::uuid`;
      return NextResponse.json({ success: true, status: 'not_paid' });
    }

    if (action === 'claim_paid' || action === 'mark_paid') {
      await db`UPDATE payment_orders SET status = 'awaiting_confirmation', updated_at = now() WHERE id = ${id}::uuid`;
      return NextResponse.json({ success: true, status: 'awaiting_confirmation' });
    }

    // Mark completed without Shop2TopUp (third-party topup)
    if (action === 'fulfill_manual' || action === 'accept_external') {
      await db`
        UPDATE payment_orders SET
          status = 'completed',
          provider_response = ${JSON.stringify({ manual: true, note: b.note || 'external' })}::jsonb,
          updated_at = now()
        WHERE id = ${id}::uuid
      `;
      await notifyTelegram(
        `✅ Completado (externo) #${id.slice(0, 8)}\n${order.game_name || ''} ${order.item_name || ''}\n${order.player_name || order.player_id}`
      );
      return NextResponse.json({ success: true, status: 'completed', manual: true });
    }

    if (action === 'fulfill') {
      const itemId = Number(order.item_id);
      const playerId = String(order.player_id || '');
      const cost = order.cost_usd != null ? String(order.cost_usd) : undefined;

      const body: any = {
        order_id: id,
        sub_category_id: itemId,
        quantity: 1,
        requirements: { player_id: playerId },
      };
      if (cost) body.expected_unit_price = cost;

      try {
        const out = await s2t('/orders/create', {
          method: 'POST',
          body: JSON.stringify(body),
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
            ? `✅ Enviado Shop2TopUp #${id.slice(0, 8)} ${order.game_name || ''} ${order.item_name || ''}`
            : `❌ Falló Shop2TopUp #${id.slice(0, 8)}`
        );
        return NextResponse.json({ success: true, status: finalStatus, provider: out });
      } catch (e: any) {
        if (b.forceComplete) {
          await db`UPDATE payment_orders SET status = 'completed', updated_at = now() WHERE id = ${id}::uuid`;
          return NextResponse.json({ success: true, status: 'completed', forced: true });
        }
        throw e;
      }
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
