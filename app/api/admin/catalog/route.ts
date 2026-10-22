import { ensureSchema } from '@/lib/schema';
import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { getSettings, setSettings } from '@/lib/settings';

function authed(req: NextRequest) {
  const secret = process.env.OPERATOR_SECRET || '';
  return !!secret && (req.headers.get('x-admin-secret') || '') === secret;
}

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await ensureSchema();
    const body = await s2t('/catalog/big-categories?for_ui=true');
    const all = listOf(body).map((c: any) => ({
      id: Number(c.id),
      name: String(c.name || ''),
      description: String(c.description || ''),
    }));
    const s = await getSettings();
    return NextResponse.json({
      success: true,
      categories: all.sort((a, b) => a.name.localeCompare(b.name)),
      enabledIds: s.enabledBigCategoryIds,
      settings: s,
    });
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
    if (Array.isArray(b.enabledIds)) {
      await setSettings({ enabledBigCategoryIds: b.enabledIds.map(Number) });
    }
    if (b.rateBo != null || b.rateBr != null || b.markupUsd != null) {
      await setSettings({
        rateBo: b.rateBo != null ? Number(b.rateBo) : undefined,
        rateBr: b.rateBr != null ? Number(b.rateBr) : undefined,
        markupUsd: b.markupUsd != null ? Number(b.markupUsd) : undefined,
      });
    }
    const s = await getSettings();
    return NextResponse.json({ success: true, settings: s, enabledIds: s.enabledBigCategoryIds });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
