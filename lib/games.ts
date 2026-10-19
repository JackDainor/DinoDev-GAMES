/** Games exposed in the storefront. bigCategoryId maps to Shop2TopUp. */
export type GameDef = {
  slug: string;
  name: string;
  short: string;
  bigCategoryId: number;
  regionPriority: RegExp[];
  currencyLabel: string;
  /** File in /public — e.g. freefire.jpg */
  cover: string;
};

export const GAMES: GameDef[] = [
  {
    slug: 'freefire',
    name: 'Free Fire',
    short: 'FF',
    bigCategoryId: 2,
    regionPriority: [/latam/i, /brazil|brasil/i, /direct\s*topup$/i],
    currencyLabel: 'Diamantes',
    cover: '/freefire.jpg',
  },
  {
    slug: 'pubg',
    name: 'PUBG Mobile',
    short: 'PUBG',
    bigCategoryId: 1,
    regionPriority: [/direct\s*topup$/i, /uc/i],
    currencyLabel: 'UC',
    cover: '/pubg.jpg',
  },
  {
    slug: 'mlbb',
    name: 'Mobile Legends',
    short: 'MLBB',
    bigCategoryId: 264,
    regionPriority: [/brazil|brasil/i, /global|worldwide/i, /direct\s*topup$/i],
    currencyLabel: 'Diamantes',
    cover: '/mlbb.jpg',
  },
  {
    slug: 'bloodstrike',
    name: 'Blood Strike',
    short: 'BS',
    bigCategoryId: 241,
    regionPriority: [/direct\s*topup$/i, /mena/i],
    currencyLabel: 'Gold',
    cover: '/bloodstrike.jpg',
  },
  {
  slug: 'roblox',
  name: 'Roblox',
  short: 'RBX',
  bigCategoryId: 1042, // ← el ID real de Shop2TopUp
  regionPriority: [/global/i, /direct\s*topup$/i],
  currencyLabel: 'Robux',
  cover: '/roblox.jpg',
},
];

export function gameBySlug(slug: string) {
  return GAMES.find((g) => g.slug === slug) || GAMES[0];
}

export function regionLabel(cat: {
  name?: string;
  region_ids?: Array<{ name?: string } | string>;
  country_ids?: Array<{ code?: string; name?: string } | string>;
}): string {
  const regions = (cat.region_ids || [])
    .map((r) => (typeof r === 'string' ? r : r?.name || ''))
    .filter(Boolean);
  const countries = (cat.country_ids || [])
    .map((c) => (typeof c === 'string' ? c : c?.code || c?.name || ''))
    .filter(Boolean);
  if (regions.length) return regions.join(', ');
  if (countries.length) return countries.join(', ');
  const n = String(cat.name || '');
  if (/latam/i.test(n)) return 'LATAM';
  if (/brazil|brasil/i.test(n)) return 'Brasil';
  if (/global|worldwide/i.test(n)) return 'Global';
  if (/mena/i.test(n)) return 'MENA';
  if (/eu\b|europe/i.test(n)) return 'Europa';
  if (/indonesia/i.test(n)) return 'Indonesia';
  if (/vietnam/i.test(n)) return 'Vietnam';
  if (/taiwan/i.test(n)) return 'Taiwan';
  if (/bangladesh/i.test(n)) return 'Bangladesh';
  if (/pakistan/i.test(n)) return 'Pakistan';
  if (/cis/i.test(n)) return 'CIS';
  if (/sg\b|singapore/i.test(n)) return 'Singapur';
  return 'Global / Sin región específica';
}
