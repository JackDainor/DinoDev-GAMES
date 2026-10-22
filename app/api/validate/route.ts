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
    // Shop2TopUp requires sub_category_id (product/item id), NOT item_id
    const subCategoryId = Number(b.itemId ?? b.sub_category_id ?? b.subCategoryId);
    const categoryId = Number(b.categoryId ?? b.category_id);
    const playerId = String(b.playerId || b.player_id || b.username || '').trim();

    if (!subCategoryId || !playerId) {
      return NextResponse.json(
        { error: 'Falta el paquete o el ID/usuario del jugador.' },
        { status: 400 }
      );
    }

    // Optional extra fields from category requirements
    const extra: Record<string, string> = {};
    if (categoryId) {
      try {
        const rd = await s2t(`/catalog/category/${categoryId}/requirements`);
        const reqs = listOf(rd);
        for (const r of reqs) {
          const key = String(r.field_name || r.name || r.field || r.key || '');
          if (!key || key === 'player_id') continue;
          // single_select: pick first option if we don't have a value
          if (Array.isArray(r.select_options) && r.select_options.length) {
            const opt = r.select_options[0];
            extra[key] = String(opt.value ?? opt.id ?? opt);
          } else if (b[key]) {
            extra[key] = String(b[key]);
          }
        }
      } catch {
        /* ignore */
      }
    }

    const payload: Record<string, any> = {
      sub_category_id: subCategoryId,
      player_id: playerId,
      ...extra,
    };

    const val = await s2t('/player/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = val.data || val;
    return NextResponse.json({
      success: true,
      player: {
        player_id: playerId,
        player_name:
          data.player_name ||
          val.player_name ||
          val.player?.player_name ||
          playerId,
        region: data.region || val.region || data.zone_id || '',
      },
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(
      {
        error:
          x.error ||
          'No se pudo verificar el ID/usuario. Revisa región del paquete e inténtalo de nuevo.',
      },
      { status: x.status || 400 }
    );
  }
}
