import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSettings } from '@/lib/settings';
import { safeError } from '@/lib/shop2topup';
import { ensureSchema } from '@/lib/schema';

function authed(req: NextRequest) {
  const secret = process.env.OPERATOR_SECRET || '';
  return !!secret && (req.headers.get('x-admin-secret') || '') === secret;
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await ensureSchema();
    const s = await getSettings();
    return NextResponse.json({ success: true, settings: s });
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
    await setSettings({
      rateBo: b.rateBo != null ? Number(b.rateBo) : undefined,
      rateBr: b.rateBr != null ? Number(b.rateBr) : undefined,
      markupUsd: b.markupUsd != null ? Number(b.markupUsd) : undefined,
      enabledBigCategoryIds: Array.isArray(b.enabledBigCategoryIds)
        ? b.enabledBigCategoryIds.map(Number)
        : undefined,
    });
    const s = await getSettings();
    return NextResponse.json({ success: true, settings: s });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
