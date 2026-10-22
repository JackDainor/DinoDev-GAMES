import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { getSettings, setSettings, sellPriceUsd, localFromUsd } from '@/lib/settings';
import { ensureSchema } from '@/lib/schema';

function authed(req: NextRequest) {
  const secret = process.env.OPERATOR_SECRET || '';
  return !!secret && (req.headers.get('x-admin-secret') || '') === secret;
}

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.subcategories)) return body.subcategories;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body)) return body;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await ensureSchema();
    const bigId = Number(req.nextUrl.searchParams.get('bigCategoryId') || 0);
    if (!bigId) return NextResponse.json({ error: 'Falta bigCategoryId' }, { status: 400 });

    const settings = await getSettings();
    const categories = listOf(
      await s2t(`/catalog/categories?bigCategoryId=${bigId}&for_ui=true`)
    );

    const sorted = categories
      .map((c: any) => ({
        id: Number(c.id),
        name: String(c.name || ''),
        score: /latam/i.test(String(c.name || ''))
          ? 100
          : /brazil|brasil/i.test(String(c.name || ''))
            ? 50
            : 0,
      }))
      .filter((c) => c.id > 0)
      .sort((a, b) => b.score - a.score);

    const products: any[] = [];
    for (const cat of sorted.slice(0, 3)) {
      const pd = await s2t(`/catalog/subcategories?categoryId=${cat.id}`);
      for (const p of listOf(pd)) {
        const id = Number(p.id);
        if (!id) continue;
        if (products.some((x) => x.id === id)) continue;
        let cost = Number(p.list_price ?? p.price ?? p.unit_price ?? 0);
        try {
          const q = await s2t(`/catalog/subcategory/${id}/price`);
          cost = Number(q?.unit_price ?? q?.price?.unit_price ?? cost);
        } catch {
          /* */
        }
        const sell = sellPriceUsd(cost, settings.markupUsd, id, settings.priceOverrides);
        const bo = localFromUsd(sell, 'BO', settings.rateBo, settings.rateBr);
        const br = localFromUsd(sell, 'BR', settings.rateBo, settings.rateBr);
        products.push({
          id,
          name: String(p.name || ''),
          region: cat.name,
          costUsd: cost,
          priceUsd: sell,
          hasOverride: settings.priceOverrides[String(id)] != null,
          bs: bo.amount,
          brl: br.amount,
        });
      }
    }

    return NextResponse.json({
      success: true,
      rateBo: settings.rateBo,
      rateBr: settings.rateBr,
      products,
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
    const settings = await getSettings();

    if (b.rateBo != null || b.rateBr != null) {
      await setSettings({
        rateBo: b.rateBo != null ? Number(b.rateBo) : undefined,
        rateBr: b.rateBr != null ? Number(b.rateBr) : undefined,
      });
    }

    if (b.priceOverrides && typeof b.priceOverrides === 'object') {
      const merged = { ...settings.priceOverrides };
      for (const [k, v] of Object.entries(b.priceOverrides)) {
        if (v === null || v === '') {
          delete merged[String(k)];
        } else {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) merged[String(k)] = n;
        }
      }
      await setSettings({ priceOverrides: merged });
    }

    const s = await getSettings();
    return NextResponse.json({ success: true, settings: s });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
