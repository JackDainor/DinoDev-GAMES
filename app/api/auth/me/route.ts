import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, hashPassword } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { safeError } from '@/lib/shop2topup';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  return NextResponse.json({ success: true, user });
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const b = await req.json();
    const db = sql();
    const whatsapp = b.whatsapp != null ? String(b.whatsapp).replace(/\D/g, '') : null;
    if (whatsapp != null) {
      await db`UPDATE app_users SET whatsapp = ${whatsapp || null}, updated_at = now() WHERE id = ${user.id}::uuid`;
    }
    if (b.password && String(b.password).length >= 6) {
      const password_hash = hashPassword(String(b.password));
      await db`UPDATE app_users SET password_hash = ${password_hash}, updated_at = now() WHERE id = ${user.id}::uuid`;
    }
    const fresh = await getSessionUser();
    return NextResponse.json({ success: true, user: fresh });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
