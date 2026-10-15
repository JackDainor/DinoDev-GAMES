import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { GAMES, gameBySlug, regionLabel } from '@/lib/games';
import { getPayCountry, getRate, localAmount } from '@/lib/money';

export const dynamic = 'force-dynamic';

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.categories)) return body.categories;
  if (Array.isArray(body?.subcategories)) return body.subcategories;
  if (Array.isArray(body)) return body;
  return [];
}

function scoreCategory(name: string, priority: RegExp[]) {
  for (let i = 0; i < priority.length; i++) {
    if (priority[i].test(name)) return priority.length - i;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const gameSlug = sp.get('game') || 'freefire';
    const regionId = sp.get('regionId');
    const market = (sp.get('market') || 'BO').toUpperCase();
    const game = gameBySlug(gameSlug);
    const pay = getPayCountry(market);
    const rate = getRate(market);

    if (sp.get('list') === 'games') {
      return NextResponse.json({
        success: true,
        games: GAMES.map((g) => ({
          slug: g.slug,
          name: g.name,
          short: g.short,
          currencyLabel: g.currencyLabel,
        })),
      });
    }

    const all = await s2t(`/catalog/categories?bigCategoryId=${game.bigCategoryId}&for_ui=true`);
    let categories = listOf(all);

    if (!categories.length) {
      const full = await s2t('/catalog/categories?for_ui=true');
      categories = listOf(full).filter(
        (c: any) =>
          Number(c.big_category_id) === game.bigCategoryId ||
          new RegExp(game.name.split(' ')[0], 'i').test(String(c.big_category_name || ''))
      );
    }

    // Prefer region matching market: BO → LATAM, BR → Brazil
    const marketBoost = market === 'BR' ? [/brazil|brasil/i] : [/latam/i, /brazil|brasil/i];

    const regions = categories
      .map((c: any) => {
        const name = String(c.name || '');
        let score = scoreCategory(name, game.regionPriority);
        for (const re of marketBoost) if (re.test(name) || re.test(regionLabel(c))) score += 10;
        return {
          id: Number(c.id),
          name,
          region: regionLabel(c),
          score,
        };
      })
      .filter((r: any) => Number.isFinite(r.id) && r.id > 0)
      .sort((a: any, b: any) => b.score - a.score || a.name.localeCompare(b.name));

    if (!regions.length) {
      return NextResponse.json(
        { error: `No hay categorías de ${game.name} para esta cuenta.` },
        { status: 404 }
      );
    }

    let chosen = regionId
      ? regions.find((r: any) => String(r.id) === String(regionId))
      : regions[0];
    if (!chosen) chosen = regions[0];

    const categoryId = chosen.id;
    const [pd, rd] = await Promise.all([
      s2t(`/catalog/subcategories?categoryId=${categoryId}`),
      s2t(`/catalog/category/${categoryId}/requirements`).catch(() => ({ data: [] })),
    ]);

    const raw = listOf(pd)
      .map((p: any) => ({
        id: Number(p.item_id ?? p.id),
        name: String(p.name ?? p.item_name ?? 'Paquete'),
        description: String(p.description || ''),
        productType: String(p.product_type || 'topup'),
        image: p.image_url || p.image || null,
        listPrice: p.price != null ? String(p.price) : '',
      }))
      .filter((p: any) => Number.isFinite(p.id) && p.id > 0 && p.productType === 'topup');

    const products = await Promise.all(
      raw.map(async (p: any) => {
        let unit = p.listPrice;
        let currency = 'USD';
        try {
          const q = await s2t(`/catalog/subcategory/${p.id}/price`);
          unit = String(q?.unit_price ?? q?.price?.unit_price ?? p.listPrice ?? '');
          currency = String(q?.currency ?? q?.price?.currency ?? 'USD');
        } catch {
          /* keep list price */
        }
        const usd = Number(unit);
        const local = Number.isFinite(usd) && usd > 0 ? localAmount(usd, market) : null;
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          image: p.image,
          priceUsd: unit,
          currencyUsd: currency,
          priceLocal: local ? local.amount.toFixed(2) : null,
          currencyLocal: pay.currency,
          symbolLocal: pay.symbol,
          region: chosen.region,
          regionName: chosen.name,
        };
      })
    );

    return NextResponse.json(
      {
        success: true,
        game: { slug: game.slug, name: game.name, currencyLabel: game.currencyLabel },
        market: { code: pay.code, name: pay.name, currency: pay.currency, symbol: pay.symbol, rate },
        category: { id: categoryId, name: chosen.name, region: chosen.region },
        regions,
        products,
        requirements: listOf(rd),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status });
  }
}
