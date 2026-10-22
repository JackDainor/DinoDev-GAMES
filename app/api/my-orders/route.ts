import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { safeError } from '@/lib/shop2topup';

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json().catch(() => ({}));
    const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean).slice(0, 50) : [];
    const playerId = String(b.playerId || '').trim();
    const user = await getSessionUser();
    const db = sql();

    let rows: any[] = [];

    if (ids.length) {
      rows = await db`
        SELECT id, status, game_name, item_name, player_id, player_name,
               price_usd::text, local_amount::text, local_currency, pay_method,
               pay_country, qr_url, created_at, expires_at
        FROM payment_orders
        WHERE id = ANY(${ids}::uuid[])
        ORDER BY created_at DESC
        LIMIT 50
      `;
    }

    if (user?.id) {
      const more = await db`
        SELECT id, status, game_name, item_name, player_id, player_name,
               price_usd::text, local_amount::text, local_currency, pay_method,
               pay_country, qr_url, created_at, expires_at
        FROM payment_orders
        WHERE user_id = ${user.id}::uuid
        ORDER BY created_at DESC
        LIMIT 50
      `;
      const seen = new Set(rows.map((r) => r.id));
      for (const r of more) if (!seen.has(r.id)) rows.push(r);
    }

    if (playerId && rows.length < 50) {
      const more = await db`
        SELECT id, status, game_name, item_name, player_id, player_name,
               price_usd::text, local_amount::text, local_currency, pay_method,
               pay_country, qr_url, created_at, expires_at
        FROM payment_orders
        WHERE player_id = ${playerId}
        ORDER BY created_at DESC
        LIMIT 20
      `;
      const seen = new Set(rows.map((r) => r.id));
      for (const r of more) if (!seen.has(r.id)) rows.push(r);
    }

    rows.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({ success: true, orders: rows.slice(0, 50) });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
