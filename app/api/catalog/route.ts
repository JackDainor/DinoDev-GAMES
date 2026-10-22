import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { getSettings, localFromUsd, sellPriceUsd, slugify, type AppSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.categories)) return body.categories;
  if (Array.isArray(body?.subcategories)) return body.subcategories;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.big_categories)) return body.big_categories;
  if (Array.isArray(body)) return body;
  return [];
}

function regionLabel(cat: any): string {
  const n = String(cat.name || '');
  if (/latam/i.test(n)) return 'LATAM';
  if (/brazil|brasil/i.test(n)) return 'BR';
  if (/global|worldwide/i.test(n)) return 'Global';
  if (/indonesia/i.test(n)) return 'ID';
  if (/europe|\beu\b/i.test(n)) return 'EU';
  if (/usa|united states/i.test(n)) return 'US';
  return n.slice(0, 12) || 'Global';
}

const DEFAULT_SETTINGS: AppSettings = {
  rateBo: 12,
  rateBr: 5.5,
  markupUsd: 0.2,
  enabledBigCategoryIds: [],
};

async function safeSettings(): Promise<AppSettings> {
  try {
    return await getSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const settings = await safeSettings();
    const market = (sp.get('market') || 'BO').toUpperCase();

    if (sp.get('list') === 'games') {
      const body = await s2t('/catalog/big-categories?for_ui=true');
      let all = listOf(body);

      // Fallback endpoints if first response empty
      if (!all.length) {
        try {
          const body2 = await s2t('/catalog/big-categories');
          all = listOf(body2);
        } catch {
          /* */
        }
      }

      const enabled = settings.enabledBigCategoryIds || [];
      if (enabled.length > 0) {
        const allow = new Set(enabled.map(Number));
        const filtered = all.filter((c: any) => allow.has(Number(c.id)));
        // If admin selection yields nothing, show full catalog instead of empty store
        if (filtered.length > 0) all = filtered;
      }

      const games = all
        .map((c: any) => {
          const id = Number(c.id);
          if (!Number.isFinite(id) || id <= 0) return null;
          const name = String(c.name || c.title || `Game ${id}`);
          const slug = slugify(name);
          return {
            slug,
            name,
            short: name.slice(0, 4).toUpperCase(),
            bigCategoryId: id,
            cover: `/${slug}.jpg`,
            coverLocal: `/${slug}.jpg`,
          };
        })
        .filter(Boolean);

      return NextResponse.json({
        success: true,
        settings: {
          rateBo: settings.rateBo,
          rateBr: settings.rateBr,
          markupUsd: settings.markupUsd,
        },
        games,
      });
    }

    const bigId = Number(sp.get('bigCategoryId') || sp.get('game') || 0);
    const regionId = sp.get('regionId');
    if (!bigId) {
      return NextResponse.json({ error: 'Falta bigCategoryId' }, { status: 400 });
    }

    const all = await s2t(`/catalog/categories?bigCategoryId=${bigId}&for_ui=true`);
    let categories = listOf(all);

    const regions = categories
      .map((c: any) => {
        const name = String(c.name || '');
        const region = regionLabel(c);
        let score = 0;
        if (/latam/i.test(name) || region === 'LATAM') score += 100;
        if (/brazil|brasil/i.test(name) || region === 'BR') score += 50;
        if (/global/i.test(name) || region === 'Global') score += 20;
        return { id: Number(c.id), name, region, score };
      })
      .filter((r: any) => r.id > 0)
      .sort((a: any, b: any) => b.score - a.score || a.name.localeCompare(b.name));

    if (!regions.length) {
      return NextResponse.json({ error: 'Sin regiones para este producto.' }, { status: 404 });
    }

    let chosen = regionId
      ? regions.find((r) => String(r.id) === String(regionId))
      : regions.find((r) => r.region === 'LATAM') || regions[0];
    if (!chosen) chosen = regions[0];

    const pd = await s2t(`/catalog/subcategories?categoryId=${chosen.id}`);
    const raw = listOf(pd)
      .map((p: any) => ({
        id: Number(p.id),
        name: String(p.name || ''),
        description: String(p.description || ''),
        listPrice: Number(p.list_price ?? p.price ?? p.unit_price ?? 0),
        productType: String(p.product_type || p.productType || 'topup').toLowerCase(),
      }))
      .filter((p: any) => {
        if (!Number.isFinite(p.id) || p.id <= 0) return false;
        const t = p.productType;
        return (
          t === 'topup' ||
          t === 'voucher' ||
          t === 'gift' ||
          t === 'giftcard' ||
          t === 'gift_card' ||
          t === ''
        );
      });

    const products = await Promise.all(
      raw.map(async (p: any) => {
        let cost = p.listPrice;
        try {
          const q = await s2t(`/catalog/subcategory/${p.id}/price`);
          cost = Number(q?.unit_price ?? q?.price?.unit_price ?? p.listPrice ?? 0);
        } catch {
          /* */
        }
        const priceUsd = sellPriceUsd(cost, settings.markupUsd);
        const local = localFromUsd(priceUsd, market, settings.rateBo, settings.rateBr);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          costUsd: cost,
          priceUsd,
          priceLocal: local.amount,
          currencyLocal: local.currency,
          symbolLocal: local.symbol,
          region: chosen.region,
          regionName: chosen.name,
        };
      })
    );

    let requirements: any[] = [];
    try {
      const rd = await s2t(`/catalog/category/${chosen.id}/requirements`);
      requirements = listOf(rd);
    } catch {
      /* optional */
    }

    return NextResponse.json({
      success: true,
      settings: {
        rateBo: settings.rateBo,
        rateBr: settings.rateBr,
        markupUsd: settings.markupUsd,
      },
      category: { id: chosen.id, name: chosen.name, region: chosen.region },
      regions,
      products,
      requirements,
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
