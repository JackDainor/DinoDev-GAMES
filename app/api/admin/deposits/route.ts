import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { notifyTelegram } from '@/lib/notify';
import { safeError } from '@/lib/shop2topup';

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
      SELECT l.id, l.amount_usd::text, l.status, l.tx_ref, l.proof_note, l.note, l.created_at,
             u.username, u.email, u.whatsapp
      FROM wallet_ledger l
      JOIN app_users u ON u.id = l.user_id
      WHERE l.kind = 'deposit'
      ORDER BY l.created_at DESC
      LIMIT 80
    `;
    return NextResponse.json({ success: true, deposits: rows });
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
    const action = String(b.action || 'approve');
    const db = sql();
    const rows = await db`SELECT * FROM wallet_ledger WHERE id = ${id}::uuid AND kind = 'deposit' LIMIT 1`;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    if (row.status !== 'pending') return NextResponse.json({ error: 'Ya procesado' }, { status: 400 });

    if (action === 'reject') {
      await db`UPDATE wallet_ledger SET status = 'rejected' WHERE id = ${id}::uuid`;
      return NextResponse.json({ success: true, status: 'rejected' });
    }

    const amount = Number(row.amount_usd);
    await db`UPDATE app_users SET balance_usd = balance_usd + ${amount}, updated_at = now() WHERE id = ${row.user_id}::uuid`;
    await db`UPDATE wallet_ledger SET status = 'completed' WHERE id = ${id}::uuid`;
    await notifyTelegram(`✅ Depósito acreditado ${amount} USD · ledger ${id}`);
    return NextResponse.json({ success: true, status: 'completed' });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
