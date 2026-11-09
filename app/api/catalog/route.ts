import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import {
  DC_DEFAULTS,
  getSettings,
  localFromUsd,
  sellPriceUsd,
  slugify,
  type AppSettings,
} from '@/lib/settings';
import { dcConfigFrom, dcCost, dcEarn } from '@/lib/dinocoin';
import { filterRegions, isFreeFire, sortRegions, type AllowedRegion } from '@/lib/regions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.categories)) return body.categories;
  if (Array.isArray(body?.subcategories)) return body.subcategories;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.big_categories)) return body.big_categories;
  if (Array.isArray(body)) return body;
  return [];
}

const DEFAULT_SETTINGS: AppSettings = {
  rateBo: 12,
  rateBr: 5.5,
  markupUsd: 0,
  enabledBigCategoryIds: [],
  priceOverrides: {},
  ...DC_DEFAULTS,
};

async function safeSettings(): Promise<AppSettings> {
  try {
    return await getSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/* ───────── cachés en memoria (10 min) para no martillar a Shop2TopUp ───────── */
const TTL = 10 * 60 * 1000;
let bigCache: { at: number; data: any[] } | null = null;
const regionCache = new Map<number, { at: number; allowed: AllowedRegion[]; excluded: string[] }>();

async function getBigCategories(): Promise<any[]> {
  if (bigCache && Date.now() - bigCache.at < TTL) return bigCache.data;
  let all = listOf(await s2t('/catalog/big-categories?for_ui=true'));
  if (!all.length) {
    try {
      all = listOf(await s2t('/catalog/big-categories'));
    } catch {
      /* */
    }
  }
  bigCache = { at: Date.now(), data: all };
  return all;
}

async function bigName(bigId: number): Promise<string> {
  try {
    const all = await getBigCategories();
    const found = all.find((c: any) => Number(c.id) === bigId);
    return String(found?.name || found?.title || '');
  } catch {
    return '';
  }
}

/** Regiones permitidas (solo Bolivia / Brasil) para un juego. */
async function allowedRegions(bigId: number, name?: string) {
  const hit = regionCache.get(bigId);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const gameName = name ?? (await bigName(bigId));
  const categories = listOf(
    await s2t(`/catalog/categories?bigCategoryId=${bigId}&for_ui=true`)
  );
  const { allowed, excluded } = filterRegions(categories, isFreeFire(gameName, bigId));
  const entry = { at: Date.now(), allowed, excluded };
  regionCache.set(bigId, entry);
  return entry;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const settings = await safeSettings();
    const market = (sp.get('market') || 'BO').toUpperCase() === 'BR' ? 'BR' : 'BO';
    const dc = dcConfigFrom(settings);

    /* ───────── Lista de juegos ───────── */
    if (sp.get('list') === 'games') {
      let all = await getBigCategories();

      const enabled = (settings.enabledBigCategoryIds || []).map(Number);
      if (enabled.length > 0) {
        const allow = new Set(enabled);
        const filtered = all.filter((c: any) => allow.has(Number(c.id)));
        all = filtered.length ? filtered : all;
      }

      // Oculta juegos que no tengan ningún servidor para Bolivia / Brasil
      // (solo si el admin eligió una lista corta de juegos).
      if (enabled.length > 0 && all.length <= 15) {
        const checks = await Promise.all(
          all.map(async (c: any) => {
            try {
              const r = await allowedRegions(
                Number(c.id),
                String(c.name || c.title || '')
              );
              return r.allowed.length > 0;
            } catch {
              return true; // ante duda, no ocultar
            }
          })
        );
        const kept = all.filter((_: any, i: number) => checks[i]);
        all = kept.length ? kept : all;
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

      return NextResponse.json(
        {
          success: true,
          settings: {
            rateBo: settings.rateBo,
            rateBr: settings.rateBr,
            markupUsd: settings.markupUsd,
            enabledCount: enabled.length,
          },
          games,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    /* ───────── Paquetes de un juego ───────── */
    const bigId = Number(sp.get('bigCategoryId') || sp.get('game') || 0);
    const regionId = sp.get('regionId');
    if (!bigId) {
      return NextResponse.json({ error: 'Falta bigCategoryId' }, { status: 400 });
    }

    const { allowed, excluded } = await allowedRegions(bigId);
    if (!allowed.length) {
      return NextResponse.json(
        {
          error: 'Este juego no tiene servidores disponibles para Bolivia / Brasil.',
          ...(sp.get('debug') ? { excluded } : {}),
        },
        { status: 404 }
      );
    }

    const regions = sortRegions(allowed, market).map((r) => ({
      id: r.id,
      name: r.name,
      region: r.region,
    }));

    const chosen =
      (regionId ? regions.find((r) => String(r.id) === String(regionId)) : null) || regions[0];

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
        const priceUsd = sellPriceUsd(cost, settings.markupUsd, p.id, settings.priceOverrides);
        const local = localFromUsd(priceUsd, market, settings.rateBo, settings.rateBr);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          productType: p.productType,
          costUsd: cost,
          priceUsd,
          priceLocal: local.amount,
          currencyLocal: local.currency,
          symbolLocal: local.symbol,
          region: chosen.region,
          regionName: chosen.name,
          dcEarn: dcEarn(priceUsd, cost, dc),
          dcCost: dc.enabled ? dcCost(cost, dc) : 0,
        };
      })
    );

    let requirements: any[] = [];
    try {
      const rd = await s2t(`/catalog/category/${chosen.id}/requirements`);
      requirements = listOf(rd).map((r: any) => ({
        field_name: String(r.field_name || r.name || r.field || r.key || 'player_id'),
        label: String(r.label || r.title || r.field_name || r.name || 'Campo'),
        data_type: String(r.data_type || r.type || 'text'),
        required: r.required !== false,
        select_options: Array.isArray(r.select_options) ? r.select_options : [],
      }));
    } catch {
      /* optional */
    }

    if (!requirements.length) {
      const isGift = products.some((p) =>
        /gift|voucher|card|codigo|code/i.test(p.productType + p.name)
      );
      if (!isGift) {
        requirements = [
          {
            field_name: 'player_id',
            label: 'ID del jugador',
            data_type: 'text',
            required: true,
            select_options: [],
          },
        ];
      }
    }

    return NextResponse.json(
      {
        success: true,
        settings: {
          rateBo: settings.rateBo,
          rateBr: settings.rateBr,
          markupUsd: settings.markupUsd,
        },
        dinocoin: { enabled: dc.enabled },
        category: { id: chosen.id, name: chosen.name, region: chosen.region },
        regions,
        products,
        requirements,
        ...(sp.get('debug') ? { excluded } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
