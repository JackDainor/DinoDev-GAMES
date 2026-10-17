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

async function ensureTable(db: ReturnType<typeof sql>) {
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
}

/** Mark overdue pending_payment as expired */
async function expireStale(db: ReturnType<typeof sql>) {
  await db`
    UPDATE payment_orders
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending_payment' AND expires_at < now()
  `;
}

async function fetchBalance() {
  try {
    const b = await s2t('/account');
    // Docs: { success, account: { balance, currency, status } } — also tolerate flat fields
    const acc = b?.account ?? b?.data?.account ?? b?.data ?? b;
    const raw = acc?.balance ?? b?.balance ?? null;
    const currency = String(acc?.currency ?? b?.currency ?? 'USD');
    if (raw != null && raw !== '') {
      return { balance: String(raw), currency, source: '/account' };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) {
      return NextResponse.json({ error: 'No autorizado. Revisa la contraseña de admin.' }, { status: 401 });
    }
    const db = sql();
    await ensureTable(db);
    await expireStale(db);

    const rows = await db`
      SELECT
        id, status, game_name, item_name, item_id, category_id, region_label,
        player_id, player_name, player_region, usd_price, local_currency, local_amount,
        pay_country, expires_at, created_at, updated_at
      FROM payment_orders
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const wallet = await fetchBalance();

    return NextResponse.json({
      success: true,
      orders: rows,
      wallet: wallet
        ? { balance: wallet.balance, currency: wallet.currency }
        : { balance: null, currency: 'USD', note: 'No se pudo leer el saldo (revisa API o endpoint).' },
    });
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
    await ensureTable(db);
    await expireStale(db);

    const rows = await db`SELECT * FROM payment_orders WHERE id = ${id}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

    if (action === 'mark_expired' || action === 'mark_cancelled' || action === 'mark_not_paid') {
      const st = action === 'mark_not_paid' ? 'not_paid' : 'cancelled';
      // expired kept for time-out; not_paid / cancelled for admin rejection
      const final = action === 'mark_expired' ? 'expired' : st;
      await db`UPDATE payment_orders SET status = ${final}, updated_at = now() WHERE id = ${id}::uuid`;
      return NextResponse.json({ success: true, status: final });
    }

    if (action === 'confirm_and_fulfill') {
      if (row.status === 'expired') {
        return NextResponse.json({ error: 'Orden expirada / compra cancelada. El cliente debe crear una nueva.' }, { status: 410 });
      }
      if (row.status === 'completed') {
        return NextResponse.json({ success: true, status: 'completed', message: 'Esta orden ya estaba completada.' });
      }
      if (!['pending_payment', 'awaiting_confirmation', 'paid', 'processing'].includes(row.status)) {
        return NextResponse.json({ error: `No se puede cumplir desde estado "${row.status}".` }, { status: 400 });
      }

      // Si sigue pending_payment y ya pasó 1h → no enviar
      if (row.status === 'pending_payment' && new Date(row.expires_at).getTime() < Date.now()) {
        await db`UPDATE payment_orders SET status = 'expired', updated_at = now() WHERE id = ${id}::uuid`;
        return NextResponse.json({ error: 'Tiempo de pago expirado. Compra cancelada.' }, { status: 410 });
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

      // Tras envío exitoso desde admin → siempre "completed" en nuestra BD
      // (el proveedor puede reportar pending interno; para el cliente ya se despachó)
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

      return NextResponse.json({
        success: true,
        status: finalStatus,
        provider: out,
        message:
          finalStatus === 'completed'
            ? 'Diamantes enviados. Orden marcada como completada.'
            : 'El proveedor reportó un problema. Revisa la respuesta.',
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
