import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.requirements)) return body.requirements;
  if (Array.isArray(body)) return body;
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const itemId = Number(b.itemId);
    const categoryId = Number(b.categoryId);
    const playerId = String(b.playerId || '').trim();
    const extra = b.requirements && typeof b.requirements === 'object' ? b.requirements : {};

    if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isSafeInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: 'Selecciona un paquete válido.' }, { status: 400 });
    }
    if (!/^\d{5,20}$/.test(playerId)) {
      return NextResponse.json({ error: 'Introduce un ID de jugador numérico válido.' }, { status: 400 });
    }

    const rd = await s2t(`/catalog/category/${categoryId}/requirements`);
    const fields: Record<string, unknown> = {};
    for (const r of listOf(rd) as any[]) {
      if (r.field_name === 'player_id') continue;
      const v = extra[r.field_name];
      if (v !== undefined && v !== '') fields[r.field_name] = v;
      else if (r.required) {
        return NextResponse.json({ error: `Completa el campo requerido: ${r.field_name}` }, { status: 400 });
      }
    }

    const out = await s2t('/player/validate', {
      method: 'POST',
      body: JSON.stringify({ sub_category_id: itemId, player_id: playerId, ...fields }),
    });

    const player = {
      player_id: out.player_id ?? out.player?.player_id ?? playerId,
      player_name: out.player_name ?? out.player?.player_name ?? '',
      region: out.region ?? out.player?.region,
    };

    return NextResponse.json({ success: true, player });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status });
  }
}
