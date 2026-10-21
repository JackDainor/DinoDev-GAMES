import { sql } from '@/lib/db';

const KEY = 'enabled_big_category_ids';

async function ensureSettingsTable() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

/** null = no configurado (usar defaults). Array = ids habilitados. */
export async function getEnabledBigCategoryIds(): Promise<number[] | null> {
  try {
    await ensureSettingsTable();
    const db = sql();
    const rows = await db`SELECT value FROM app_settings WHERE key = ${KEY} LIMIT 1`;
    if (!rows[0]) return null;
    const parsed = JSON.parse(String(rows[0].value || '[]'));
    if (!Array.isArray(parsed)) return null;
    return parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return null;
  }
}

export async function setEnabledBigCategoryIds(ids: number[]) {
  await ensureSettingsTable();
  const db = sql();
  const unique = Array.from(
    new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))
  );
  const v = JSON.stringify(unique);
  await db`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${KEY}, ${v}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${v}, updated_at = now()
  `;
}

export function slugify(name: string): string {
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
