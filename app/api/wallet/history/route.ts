import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { safeError } from '@/lib/shop2topup';

export async function GET() {
  try {
    await ensureSchema();
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const db = sql();
    const rows = await db`
      SELECT id, amount_usd::text, kind, status, note, tx_ref, created_at
      FROM wallet_ledger WHERE user_id = ${user.id}::uuid
      ORDER BY created_at DESC LIMIT 50
    `;
    return NextResponse.json({ success: true, balance_usd: user.balance_usd, ledger: rows });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
