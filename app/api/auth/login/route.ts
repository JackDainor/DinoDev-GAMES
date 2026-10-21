import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { setSession, verifyPassword } from '@/lib/auth';
import { safeError } from '@/lib/shop2topup';

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos.' }, { status: 400 });
    }
    const db = sql();
    const rows = await db`
      SELECT id, email, username, role, password_hash, balance_usd::text, active
      FROM app_users WHERE email = ${email} LIMIT 1
    `;
    const u = rows[0];
    if (!u || !verifyPassword(password, u.password_hash)) {
      return NextResponse.json({ error: 'Credenciales incorrectas.' }, { status: 401 });
    }
    if (!u.active) return NextResponse.json({ error: 'Cuenta desactivada.' }, { status: 403 });
    await setSession(u.id, u.role);
    return NextResponse.json({
      success: true,
      user: { id: u.id, email: u.email, username: u.username, role: u.role, balance_usd: u.balance_usd },
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
