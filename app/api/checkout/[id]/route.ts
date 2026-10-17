import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { sql } from '@/lib/db';
import { notifyTelegram } from '@/lib/notify';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
    }
    const db = sql();
    const rows = await db`SELECT * FROM payment_orders WHERE id = ${id}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

    // Expire if past deadline
    if (row.status === 'pending_payment' && new Date(row.expires_at).getTime() < Date.now()) {
      await db`UPDATE payment_orders SET status = 'expired', updated_at = now() WHERE id = ${id}::uuid`;
      row.status = 'expired';
    }

    return NextResponse.json({ success: true, order: row });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}

/** Mark as paid (customer claims) or operator confirms + fulfills. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
    }
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || 'claim_paid'); // claim_paid | confirm_and_fulfill
    const db = sql();
    const rows = await db`SELECT * FROM payment_orders WHERE id = ${id}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

    if (new Date(row.expires_at).getTime() < Date.now() && row.status === 'pending_payment') {
      await db`UPDATE payment_orders SET status = 'expired', updated_at = now() WHERE id = ${id}::uuid`;
      return NextResponse.json({ error: 'El tiempo de pago (1 hora) expiró. Crea una nueva orden.' }, { status: 410 });
    }

    if (action === 'claim_paid') {
      if (row.status !== 'pending_payment') {
        return NextResponse.json({ error: `Estado actual: ${row.status}` }, { status: 400 });
      }
      await db`UPDATE payment_orders SET status = 'awaiting_confirmation', updated_at = now() WHERE id = ${id}::uuid`;
      const base =
        process.env.ADMIN_PUBLIC_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
      const adminUrl = base ? `${base.replace(/\/$/, '')}/admin` : '/admin';
      await notifyTelegram(
        `🟢 DinoDev: cliente dice que PAGÓ\n` +
        `${row.game_name} · ${row.item_name}\n` +
        `Jugador: ${row.player_name} (${row.player_id})\n` +
        `Monto: ${row.local_currency} ${row.local_amount} (${row.pay_country})\n` +
        `Orden: ${id}\n` +
        `Admin: ${adminUrl}`
      );
      return NextResponse.json({
        success: true,
        order: { ...row, status: 'awaiting_confirmation' },
        message: 'Registramos que ya pagaste. En cuanto confirmemos el QR, enviaremos la recarga.',
      });
    }

    if (action === 'confirm_and_fulfill') {
      const secret = process.env.OPERATOR_SECRET || '';
      if (!secret || b.secret !== secret) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
      }
      if (!['pending_payment', 'awaiting_confirmation', 'paid'].includes(row.status)) {
        return NextResponse.json({ error: `No se puede cumplir desde estado ${row.status}` }, { status: 400 });
      }

      // Fulfill via Shop2TopUp (charges wallet)
      const out = await s2t('/orders/create', {
        method: 'POST',
        body: JSON.stringify({
          order_id: id,
          sub_category_id: Number(row.item_id),
          quantity: 1,
          requirements: { player_id: row.player_id },
          expected_unit_price: String(row.usd_price),
        }),
      });
      const providerStatus = String(out.order?.status ?? out.status ?? '').toLowerCase();
      const failed = /fail|error|cancel|reject/i.test(providerStatus);
      const finalStatus = failed ? 'failed' : 'completed';
      await db`
        UPDATE payment_orders SET
          status = ${finalStatus},
          provider_order_id = ${id},
          provider_response = ${JSON.stringify(out)}::jsonb,
          updated_at = now()
        WHERE id = ${id}::uuid
      `;
      return NextResponse.json({ success: true, order: { ...row, status: finalStatus }, provider: out });
    }

    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
