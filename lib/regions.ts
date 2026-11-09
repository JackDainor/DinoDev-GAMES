/**
 * Dino Games — solo servidores disponibles para Bolivia y Brasil.
 *
 * Free Fire: ÚNICAMENTE LATAM y Brasil.
 * Otros juegos: LATAM, Brasil, Bolivia o Global/Worldwide
 * (los servidores globales se pueden usar desde Bolivia y Brasil).
 * Todo lo demás (Indonesia, Vietnam, MENA, Europa, EE.UU., etc.) se oculta.
 */

export type RegionKey = 'LATAM' | 'BR' | 'BO' | 'GLOBAL';

export type AllowedRegion = {
  id: number;
  name: string;
  key: RegionKey;
  region: string;
};

const LABEL: Record<RegionKey, string> = {
  LATAM: 'LATAM',
  BR: 'BR',
  BO: 'BO',
  GLOBAL: 'Global',
};

export function isFreeFire(name: string, bigCategoryId?: number): boolean {
  if (/free\s*-?\s*fire/i.test(name || '')) return true;
  return !name && bigCategoryId === 2;
}

function nameText(cat: any): string {
  const parts: string[] = [String(cat?.name || '')];
  for (const k of ['region_ids', 'regions']) {
    const arr = cat?.[k];
    if (Array.isArray(arr)) {
      for (const x of arr) parts.push(typeof x === 'string' ? x : String(x?.name || ''));
    }
  }
  return parts.join(' ');
}

function countryCodes(cat: any): string[] {
  const out: string[] = [];
  for (const k of ['country_ids', 'countries']) {
    const arr = cat?.[k];
    if (Array.isArray(arr)) {
      for (const x of arr) {
        const c = typeof x === 'string' ? x : String(x?.code || '');
        if (c) out.push(c.toUpperCase());
      }
    }
  }
  return out;
}

export function classifyRegion(cat: any): RegionKey | null {
  const text = nameText(cat);

  // "Global excl. Brazil", "sin Bolivia", etc. → no sirve
  if (
    /(excl\w*|except\w*|without|sin)\W+(?:\w+\W+){0,3}(brazil|brasil|bolivia|latam)/i.test(text)
  ) {
    return null;
  }

  if (/latam|latin\s*am|latino|am[eé]rica\s*latina|south\s*am|sudam[eé]rica/i.test(text)) {
    return 'LATAM';
  }
  if (/brazil|brasil/i.test(text)) return 'BR';
  if (/bolivia/i.test(text)) return 'BO';
  if (/global|worldwide|world\s*wide|international|internacional/i.test(text)) return 'GLOBAL';

  // Sin pistas en el nombre: miramos países (solo si es una lista corta)
  const codes = countryCodes(cat);
  if (codes.length > 0 && codes.length <= 3) {
    if (codes.includes('BR')) return 'BR';
    if (codes.includes('BO')) return 'BO';
  }
  return null;
}

export function filterRegions(
  categories: any[],
  freeFire: boolean
): { allowed: AllowedRegion[]; excluded: string[] } {
  const allowedKeys: RegionKey[] = freeFire ? ['LATAM', 'BR'] : ['LATAM', 'BR', 'BO', 'GLOBAL'];
  const allowed: AllowedRegion[] = [];
  const excluded: string[] = [];
  for (const c of categories) {
    const id = Number(c?.id);
    const name = String(c?.name || '');
    if (!Number.isFinite(id) || id <= 0) continue;
    const key = classifyRegion(c);
    if (key && allowedKeys.includes(key)) {
      allowed.push({ id, name, key, region: LABEL[key] });
    } else {
      excluded.push(name);
    }
  }
  return { allowed, excluded };
}

/** Orden por país de pago: Brasil → BR primero; Bolivia → LATAM/BO primero. */
export function sortRegions(list: AllowedRegion[], market: string): AllowedRegion[] {
  const order: RegionKey[] =
    market.toUpperCase() === 'BR'
      ? ['BR', 'LATAM', 'GLOBAL', 'BO']
      : ['LATAM', 'BO', 'GLOBAL', 'BR'];
  return [...list].sort(
    (a, b) =>
      order.indexOf(a.key) - order.indexOf(b.key) || a.name.localeCompare(b.name)
  );
}
