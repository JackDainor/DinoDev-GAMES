import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { GAMES } from '@/lib/games';
import { getEnabledBigCategoryIds, setEnabledBigCategoryIds } from '@/lib/catalog-settings';

function authed(req: NextRequest) {
  const secret = process.env.OPERATOR_SECRET || '';
  if (!secret) return false;
  return (req.headers.get('x-admin-secret') || '') === secret;
}

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.big_categories)) return body.big_categories;
  if (Array.isArray(body)) return body;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await s2t('/catalog/big-categories?for_ui=true');
    const all = listOf(body).map((c: any) => ({
      id: Number(c.id),
      name: String(c.name || ''),
      description: String(c.description || ''),
      image: c.image_url || null,
      known: GAMES.some((g) => g.bigCategoryId === Number(c.id)),
    }));
    const enabled = await getEnabledBigCategoryIds();
    // null = defaults (hardcoded GAMES ids)
    const enabledIds =
      enabled === null ? GAMES.map((g) => g.bigCategoryId) : enabled;

    return NextResponse.json({
      success: true,
      categories: all.sort((a, b) => a.name.localeCompare(b.name)),
      enabledIds,
      mode: enabled === null ? 'default' : 'custom',
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const b = await req.json();
    const ids = Array.isArray(b.enabledIds) ? b.enabledIds.map(Number).filter((n: number) => n > 0) : [];
    await setEnabledBigCategoryIds(ids);
    return NextResponse.json({ success: true, enabledIds: ids, mode: 'custom' });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
