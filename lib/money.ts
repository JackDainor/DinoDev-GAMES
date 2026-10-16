/** Local payment countries. Rates are USD → local (override via env). */
export const PAY_COUNTRIES = [
  {
    code: 'BO',
    name: 'Bolivia',
    currency: 'BOB',
    symbol: 'Bs.',
    method: 'QR Bolivia',
    envRate: 'RATE_USD_BOB',
    envQr: 'QR_URL_BO',
    defaultRate: 12,
  },
  {
    code: 'BR',
    name: 'Brasil',
    currency: 'BRL',
    symbol: 'R$',
    method: 'Pix / QR Brasil',
    envRate: 'RATE_USD_BRL',
    envQr: 'QR_URL_BR',
    defaultRate: 5.5,
  },
] as const;

export type PayCountryCode = (typeof PAY_COUNTRIES)[number]['code'];

export function getPayCountry(code: string) {
  return PAY_COUNTRIES.find((c) => c.code === code) || PAY_COUNTRIES[0];
}

export function getRate(countryCode: string) {
  const c = getPayCountry(countryCode);
  const rate = Number(process.env[c.envRate] || c.defaultRate);
  return Number.isFinite(rate) && rate > 0 ? rate : c.defaultRate;
}

export function localAmount(usd: number, countryCode: string) {
  const c = getPayCountry(countryCode);
  const rate = getRate(countryCode);
  const amount = Math.ceil(usd * rate * 100) / 100;
  return {
    amount,
    rate,
    currency: c.currency,
    symbol: c.symbol,
    name: c.name,
    method: c.method,
    qrUrl: process.env[c.envQr] || '',
    pixKey: process.env.PIX_KEY_BR || '',
  };
}

export const PAYMENT_TTL_MS = 60 * 60 * 1000; // 1 hour
