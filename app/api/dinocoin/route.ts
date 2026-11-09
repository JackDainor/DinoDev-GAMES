import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { safeError } from '@/lib/shop2topup';

export const dynamic = 'force-dynamic';

/** Saldo e historial de DinoCoin del usuario conectado. */
export async function GET() {
  try {
    await ensureSchema();
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const db = sql();
    const ledger = await db`
      SELECT l.id, l.amount, l.kind, l.note, l.created_at,
             o.game_name, o.item_name
      FROM dinocoin_ledger l
      LEFT JOIN payment_orders o ON o.id = l.order_id
      WHERE l.user_id = ${user.id}::uuid
      ORDER BY l.created_at DESC
      LIMIT 60
    `;
    const s = await getSettings();
    return NextResponse.json({
      success: true,
      balance: user.dinocoin,
      enabled: s.dcEnabled,
      ledger,
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
