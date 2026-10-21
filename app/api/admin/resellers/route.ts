import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { hashPassword } from '@/lib/auth';
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
      SELECT id, email, username, whatsapp, role, balance_usd::text, active, created_at
      FROM app_users
      WHERE role IN ('reseller', 'user')
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ success: true, users: rows });
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
    const action = String(b.action || '');
    const db = sql();

    if (action === 'credit') {
      const id = String(b.id || '');
      const amount = Number(b.amount);
      if (!id || !(amount > 0)) return NextResponse.json({ error: 'ID y monto > 0' }, { status: 400 });
      await db`UPDATE app_users SET balance_usd = balance_usd + ${amount}, updated_at = now() WHERE id = ${id}::uuid`;
      await db`
        INSERT INTO wallet_ledger (user_id, amount_usd, kind, status, note, admin_note)
        VALUES (${id}::uuid, ${amount}, 'credit', 'completed', ${'Admin credit'}, ${String(b.note || '')})
      `;
      const rows = await db`SELECT id, balance_usd::text FROM app_users WHERE id = ${id}::uuid`;
      return NextResponse.json({ success: true, user: rows[0] });
    }

    if (action === 'set_role') {
      await db`UPDATE app_users SET role = ${String(b.role || 'user')}, updated_at = now() WHERE id = ${String(b.id)}::uuid`;
      return NextResponse.json({ success: true });
    }

    if (action === 'create_reseller') {
      const email = String(b.email || '').trim().toLowerCase();
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      if (!email || !username || password.length < 6) {
        return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
      }
      const password_hash = hashPassword(password);
      const rows = await db`
        INSERT INTO app_users (email, username, password_hash, role, balance_usd)
        VALUES (${email}, ${username}, ${password_hash}, 'reseller', 0)
        RETURNING id, email, username, balance_usd::text
      `;
      return NextResponse.json({ success: true, user: rows[0] });
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
