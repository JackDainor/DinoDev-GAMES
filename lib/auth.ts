import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';

const COOKIE = 'dinodev_session';
const DAYS = 14;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function sign(userId: string, role: string) {
  const secret = process.env.OPERATOR_SECRET || 'dev';
  const exp = Date.now() + DAYS * 864e5;
  const payload = `${userId}.${role}.${exp}`;
  const sig = createHash('sha256').update(`${payload}.${secret}`).digest('hex');
  return `${payload}.${sig}`;
}

function parse(token: string) {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [userId, role, exp, sig] = parts;
  const secret = process.env.OPERATOR_SECRET || 'dev';
  const payload = `${userId}.${role}.${exp}`;
  const expect = createHash('sha256').update(`${payload}.${secret}`).digest('hex');
  if (expect !== sig || Date.now() > Number(exp)) return null;
  return { userId, role };
}

export async function setSession(userId: string, role: string) {
  cookies().set(COOKIE, sign(userId, role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DAYS * 86400,
  });
}

export async function clearSession() {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  whatsapp: string | null;
  role: string;
  balance_usd: string;
  active: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const p = parse(token);
  if (!p) return null;
  try {
    await ensureSchema();
    const db = sql();
    const rows = await db`
      SELECT id, email, username, whatsapp, role, balance_usd::text, active
      FROM app_users WHERE id = ${p.userId}::uuid LIMIT 1
    `;
    const u = rows[0];
    if (!u || !u.active) return null;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      whatsapp: u.whatsapp,
      role: u.role,
      balance_usd: u.balance_usd,
      active: u.active,
    };
  } catch {
    return null;
  }
}
