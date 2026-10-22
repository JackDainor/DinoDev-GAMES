import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';

export type AppSettings = {
  rateBo: number;
  rateBr: number;
  /** @deprecated kept for compatibility; prefer priceOverrides */
  markupUsd: number;
  enabledBigCategoryIds: number[];
  /** itemId (subcategory) -> sell price USD */
  priceOverrides: Record<string, number>;
};

export async function getSettings(): Promise<AppSettings> {
  await ensureSchema();
  const db = sql();
  let rows: any[] = [];
  try {
    rows = (await db`SELECT key, value FROM app_settings`) as any[];
  } catch {
    rows = [];
  }
  const m: Record<string, string> = {};
  for (const r of rows) m[String(r.key)] = String(r.value ?? '');

  let enabled: number[] = [];
  try {
    const parsed = JSON.parse(m.enabled_big_category_ids || '[]');
    if (Array.isArray(parsed)) {
      enabled = parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    }
  } catch {
    enabled = [];
  }

  let priceOverrides: Record<string, number> = {};
  try {
    const parsed = JSON.parse(m.price_overrides || '{}');
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) priceOverrides[String(k)] = n;
      }
    }
  } catch {
    priceOverrides = {};
  }

  return {
    rateBo: Math.max(0.01, Number(m.rate_bo) || 12),
    rateBr: Math.max(0.01, Number(m.rate_br) || 5.5),
    markupUsd: Math.max(0, Number(m.markup_usd) || 0),
    enabledBigCategoryIds: enabled,
    priceOverrides,
  };
}

export async function setSettings(
  partial: Partial<{
    rateBo: number;
    rateBr: number;
    markupUsd: number;
    enabledBigCategoryIds: number[];
    priceOverrides: Record<string, number>;
  }>
) {
  await ensureSchema();
  const db = sql();
  async function put(key: string, value: string) {
    await db`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${key}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()
    `;
  }
  if (partial.rateBo != null && Number.isFinite(Number(partial.rateBo))) {
    await put('rate_bo', String(Number(partial.rateBo)));
  }
  if (partial.rateBr != null && Number.isFinite(Number(partial.rateBr))) {
    await put('rate_br', String(Number(partial.rateBr)));
  }
  if (partial.markupUsd != null && Number.isFinite(Number(partial.markupUsd))) {
    await put('markup_usd', String(Number(partial.markupUsd)));
  }
  if (partial.enabledBigCategoryIds != null) {
    const ids = partial.enabledBigCategoryIds
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    await put('enabled_big_category_ids', JSON.stringify(ids));
  }
  if (partial.priceOverrides != null) {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(partial.priceOverrides)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) clean[String(k)] = Math.round(n * 10000) / 10000;
    }
    await put('price_overrides', JSON.stringify(clean));
  }
}

/** Final sell USD: override if set, else Shop2TopUp cost (+ legacy markup if any). */
export function sellPriceUsd(
  costUsd: number,
  markupUsd: number,
  itemId?: number,
  overrides?: Record<string, number>
) {
  if (itemId != null && overrides) {
    const o = overrides[String(itemId)];
    if (o != null && Number.isFinite(o)) {
      return Math.round(o * 10000) / 10000;
    }
  }
  return Math.round((costUsd + (markupUsd || 0)) * 10000) / 10000;
}

export function localFromUsd(usd: number, market: string, rateBo: number, rateBr: number) {
  const m = market.toUpperCase();
  if (m === 'BR') {
    return {
      amount: Math.round(usd * rateBr * 100) / 100,
      currency: 'BRL',
      symbol: 'R$',
      rate: rateBr,
    };
  }
  return {
    amount: Math.round(usd * rateBo * 100) / 100,
    currency: 'BOB',
    symbol: 'Bs',
    rate: rateBo,
  };
}

export function slugify(name: string) {
  return (
    String(name || 'game')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'game'
  );
}
