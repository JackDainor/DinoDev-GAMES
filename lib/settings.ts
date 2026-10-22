import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';

export type AppSettings = {
  rateBo: number;
  rateBr: number;
  markupUsd: number;
  enabledBigCategoryIds: number[];
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

  return {
    rateBo: Math.max(0.01, Number(m.rate_bo) || 12),
    rateBr: Math.max(0.01, Number(m.rate_br) || 5.5),
    markupUsd: Math.max(0, Number(m.markup_usd) || 0.2),
    enabledBigCategoryIds: enabled,
  };
}

export async function setSettings(
  partial: Partial<{
    rateBo: number;
    rateBr: number;
    markupUsd: number;
    enabledBigCategoryIds: number[];
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
}

export function sellPriceUsd(costUsd: number, markupUsd: number) {
  return Math.round((costUsd + markupUsd) * 10000) / 10000;
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
