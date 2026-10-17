import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { safeError } from '@/lib/shop2topup';

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const ids = Array.isArray(b.ids)
      ? b.ids.map(String).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 30)
      : [];
    const playerId = String(b.playerId || '').trim();

    if (!ids.length && !/^\d{5,20}$/.test(playerId)) {
      return NextResponse.json({ error: 'Indica IDs de orden o un ID de jugador válido.' }, { status: 400 });
    }

    const db = sql();
    try {
      await db`
        UPDATE payment_orders
        SET status = 'expired', updated_at = now()
        WHERE status = 'pending_payment' AND expires_at < now()
      `;
    } catch {
      /* table may not exist yet */
    }

    let rows: any[] = [];

    if (ids.length) {
      rows = await db`
        SELECT id, status, game_name, item_name, player_id, player_name,
               local_amount, local_currency, pay_country, region_label,
               qr_url, created_at, expires_at, updated_at
        FROM payment_orders
        WHERE id = ANY(${ids}::uuid[])
        ORDER BY created_at DESC
        LIMIT 50
      `;
    }

    if (/^\d{5,20}$/.test(playerId)) {
      const byPlayer = await db`
        SELECT id, status, game_name, item_name, player_id, player_name,
               local_amount, local_currency, pay_country, region_label,
               qr_url, created_at, expires_at, updated_at
        FROM payment_orders
        WHERE player_id = ${playerId}
        ORDER BY created_at DESC
        LIMIT 30
      `;
      const seen = new Set(rows.map((r: any) => r.id));
      for (const r of byPlayer) {
        if (!seen.has(r.id)) rows.push(r);
      }
      rows.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const now = Date.now();
    const orders = rows.slice(0, 50).map((r: any) => {
      let status = r.status;
      if (status === 'pending_payment' && new Date(r.expires_at).getTime() < now) status = 'expired';
      return {
        id: r.id,
        status,
        game_name: r.game_name,
        item_name: r.item_name,
        player_id: r.player_id,
        player_name: r.player_name,
        local_amount: r.local_amount,
        local_currency: r.local_currency,
        pay_country: r.pay_country,
        region_label: r.region_label,
        qr_url: r.qr_url || null,
        created_at: r.created_at,
        expires_at: r.expires_at,
        updated_at: r.updated_at,
      };
    });

    return NextResponse.json({ success: true, orders });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
