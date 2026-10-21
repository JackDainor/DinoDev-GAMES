const BASE = (process.env.SHOP2TOPUP_BASE_URL || 'https://shop2topup.com/api/endpoints/v1').replace(/\/$/, '');

export class ProviderError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function unwrap(body: any) {
  if (body && body.data !== undefined && body.success !== false) {
    return {
      ...body,
      ...(typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {}),
      data: body.data,
    };
  }
  return body;
}

export async function s2t(path: string, init: RequestInit = {}) {
  const key = process.env.SHOP2TOPUP_API_KEY;
  if (!key) throw new ProviderError('Falta SHOP2TOPUP_API_KEY.', 503, 'CONFIG_MISSING');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new ProviderError(
      body?.error?.message || body?.message || 'Shop2TopUp error',
      res.status,
      body?.error?.code
    );
  }
  return unwrap(body);
}

export function safeError(e: unknown): { error: string; status: number; code?: string } {
  if (e instanceof ProviderError) return { error: e.message, status: e.status, code: e.code };
  if (e instanceof Error) return { error: e.message, status: 500 };
  return { error: 'Error desconocido', status: 500 };
}
