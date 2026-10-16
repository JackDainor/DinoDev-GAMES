import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { sql } from '@/lib/db';

function authed(req: NextRequest) {
  const secret = process.env.OPERATOR_SECRET || '';
  if (!secret) return false;
  const h = req.headers.get('x-admin-secret') || '';
  const q = req.nextUrl.searchParams.get('secret') || '';
  return h === secret || q === secret;
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) {
      return NextResponse.json({ error: 'No autorizado. Revisa la contraseña de admin.' }, { status: 401 });
    }
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
    const rows = await db`
      SELECT
        id, status, game_name, item_name, item_id, category_id, region_label,
        player_id, player_name, player_region, usd_price, local_currency, local_amount,
        pay_country, expires_at, created_at, updated_at
      FROM payment_orders
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ success: true, orders: rows });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const b = await req.json();
    const id = String(b.id || '');
    const action = String(b.action || 'confirm_and_fulfill');

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'ID de orden inválido.' }, { status: 400 });
    }

    const db = sql();
    const rows = await db`SELECT * FROM payment_orders WHERE id = ${id}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

    if (action === 'mark_expired') {
      await db`UPDATE payment_orders SET status = 'expired', updated_at = now() WHERE id = ${id}::uuid`;
      return NextResponse.json({ success: true, status: 'expired' });
    }

    if (action === 'confirm_and_fulfill') {
      if (!['pending_payment', 'awaiting_confirmation', 'paid'].includes(row.status)) {
        return NextResponse.json(
          { error: `No se puede cumplir desde estado "${row.status}".` },
          { status: 400 }
        );
      }

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

      const status = String(out.order?.status ?? out.status ?? 'pending');
      const finalStatus = status === 'completed' ? 'completed' : 'processing';

      await db`
        UPDATE payment_orders SET
          status = ${finalStatus},
          provider_order_id = ${id},
          provider_response = ${JSON.stringify(out)}::jsonb,
          updated_at = now()
        WHERE id = ${id}::uuid
      `;

      return NextResponse.json({
        success: true,
        status: finalStatus,
        provider: out,
        message: 'Orden enviada a Shop2TopUp. Revisa el juego del jugador.',
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
