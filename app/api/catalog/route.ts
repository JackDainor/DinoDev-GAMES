import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { getSettings, localFromUsd, sellPriceUsd, slugify } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.categories)) return body.categories;
  if (Array.isArray(body?.subcategories)) return body.subcategories;
  if (Array.isArray(body?.items)) return body.items;
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

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const settings = await getSettings();
    const market = (sp.get('market') || 'BO').toUpperCase();

    if (sp.get('list') === 'games') {
      const body = await s2t('/catalog/big-categories?for_ui=true');
      let all = listOf(body);
      if (settings.enabledBigCategoryIds.length > 0) {
        const allow = new Set(settings.enabledBigCategoryIds);
        all = all.filter((c: any) => allow.has(Number(c.id)));
      }
      return NextResponse.json({
        success: true,
        settings: {
          rateBo: settings.rateBo,
          rateBr: settings.rateBr,
          markupUsd: settings.markupUsd,
        },
        games: all.map((c: any) => {
          const slug = slugify(c.name);
          const raw = String(c.image_url || c.image || '').trim();
          let cover = `/${slug}.jpg`; // local public/ first preference in UI fallback chain
          if (raw) {
            if (raw.startsWith('http')) cover = raw;
            else if (raw.startsWith('/')) cover = `https://shop2topup.com${raw}`;
            else cover = `https://shop2topup.com/storage/${raw}`;
          }
          return {
            slug,
            name: String(c.name),
            short: String(c.name).slice(0, 4).toUpperCase(),
            bigCategoryId: Number(c.id),
            cover,
            coverLocal: `/${slug}.jpg`,
            currencyLabel: /roblox|steam|apple|google|razer|gift/i.test(String(c.name))
              ? 'Crédito'
              : 'Créditos',
          };
        }),
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
      .map((c: any) => ({
        id: Number(c.id),
        name: String(c.name || ''),
        region: regionLabel(c),
      }))
      .filter((r: any) => r.id > 0);

    if (!regions.length) {
      return NextResponse.json({ error: 'Sin regiones para este producto.' }, { status: 404 });
    }

    let chosen = regionId
      ? regions.find((r) => String(r.id) === String(regionId))
      : regions[0];
    if (!chosen) chosen = regions[0];

    const pd = await s2t(`/catalog/subcategories?categoryId=${chosen.id}`);
    const raw = listOf(pd)
      .map((p: any) => ({
        id: Number(p.item_id ?? p.id),
        name: String(p.name ?? p.item_name ?? 'Paquete'),
        description: String(p.description || ''),
        productType: String(p.product_type || p.type || 'topup').toLowerCase(),
        listPrice: p.price != null ? Number(p.price) : 0,
      }))
      .filter((p: any) => {
        if (!(p.id > 0)) return false;
        const t = p.productType;
        return t === 'topup' || t === 'voucher' || t === 'gift' || t === 'giftcard' || t === 'gift_card' || t === '';
      });

    const products = await Promise.all(
      raw.map(async (p: any) => {
        let cost = p.listPrice;
        try {
          const q = await s2t(`/catalog/subcategory/${p.id}/price`);
          cost = Number(q?.unit_price ?? q?.price?.unit_price ?? p.listPrice ?? 0);
        } catch { /* */ }
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
    } catch { /* optional */ }

    return NextResponse.json({
      success: true,
      settings: { rateBo: settings.rateBo, rateBr: settings.rateBr, markupUsd: settings.markupUsd },
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
