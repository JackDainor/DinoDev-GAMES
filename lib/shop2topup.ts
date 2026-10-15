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

/** Shop2TopUp v1 now wraps payloads in `data`. Older docs used top-level fields. */
function unwrap(body: any) {
  if (body && body.data !== undefined && body.success !== false) {
    return { ...body, ...(typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {}), data: body.data };
  }
  return body;
}

export async function s2t(path: string, init: RequestInit = {}) {
  const key = process.env.SHOP2TOPUP_API_KEY;
  if (!key) throw new ProviderError('Falta SHOP2TOPUP_API_KEY en las variables de entorno.', 503, 'CONFIG_MISSING');
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
      body?.error?.message || body?.message || 'Shop2TopUp no pudo completar la solicitud.',
      res.status,
      body?.error?.code
    );
  }
  return unwrap(body);
}

export function safeError(e: unknown) {
  if (e instanceof ProviderError) return { error: e.message, code: e.code, status: e.status };
  return { error: 'Error interno. Revisa las variables de entorno y los registros del servidor.', status: 500 };
}
