import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { safeError } from '@/lib/shop2topup';

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const user = await getSessionUser();
    const b = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(b.ids)
      ? b.ids.filter((x: any) => typeof x === 'string' && x.length > 10).slice(0, 40)
      : [];
    const db = sql();
    let rows: any[] = [];

    if (user) {
      rows = await db`
        SELECT id, status, game_name, item_name, player_id, player_name,
               price_usd::text, local_amount::text, local_currency, pay_method, created_at, expires_at
        FROM payment_orders
        WHERE user_id = ${user.id}::uuid
        ORDER BY created_at DESC
        LIMIT 40
      `;
    } else if (ids.length === 1) {
      rows = await db`
        SELECT id, status, game_name, item_name, player_id, player_name,
               price_usd::text, local_amount::text, local_currency, pay_method, created_at, expires_at
        FROM payment_orders WHERE id = ${ids[0]}::uuid
        LIMIT 1
      `;
    } else if (ids.length > 1) {
      // fetch one-by-one to avoid array binding issues on serverless driver
      const out: any[] = [];
      for (const id of ids.slice(0, 20)) {
        const r = await db`
          SELECT id, status, game_name, item_name, player_id, player_name,
                 price_usd::text, local_amount::text, local_currency, pay_method, created_at, expires_at
          FROM payment_orders WHERE id = ${id}::uuid LIMIT 1
        `;
        if (r[0]) out.push(r[0]);
      }
      rows = out;
    }

    return NextResponse.json({ success: true, orders: rows });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
