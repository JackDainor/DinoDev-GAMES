import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { hashPassword, setSession } from '@/lib/auth';
import { safeError } from '@/lib/shop2topup';

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    const email = String(b.email || '').trim().toLowerCase();
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    const whatsapp = String(b.whatsapp || '').replace(/\D/g, '');
    if (!email || !username || password.length < 6) {
      return NextResponse.json({ error: 'Email, username y contraseña (mín. 6) requeridos.' }, { status: 400 });
    }
    const db = sql();
    const password_hash = hashPassword(password);
    try {
      const rows = await db`
        INSERT INTO app_users (email, username, password_hash, whatsapp, role, balance_usd)
        VALUES (${email}, ${username}, ${password_hash}, ${whatsapp || null}, 'user', 0)
        RETURNING id, email, username, role, balance_usd::text
      `;
      await setSession(rows[0].id, 'user');
      return NextResponse.json({ success: true, user: rows[0] });
    } catch (e: any) {
      if (String(e?.message || '').includes('unique')) {
        return NextResponse.json({ error: 'Email o username ya existe.' }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
