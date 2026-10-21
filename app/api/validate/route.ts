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
    const playerId = String(b.playerId || b.username || '').trim();
    if (!itemId || !categoryId || !playerId) {
      return NextResponse.json({ error: 'Completa el ID o usuario.' }, { status: 400 });
    }

    // Build requirements map from category
    let reqBody: Record<string, string> = { player_id: playerId };
    try {
      const rd = await s2t(`/catalog/category/${categoryId}/requirements`);
      const reqs = listOf(rd);
      if (reqs.length) {
        reqBody = {};
        for (const r of reqs) {
          const key = String(r.name || r.field || r.key || 'player_id');
          reqBody[key] = playerId;
        }
        if (!Object.keys(reqBody).length) reqBody = { player_id: playerId };
      }
    } catch {
      /* use default player_id */
    }

    try {
      const val = await s2t('/player/validate', {
        method: 'POST',
        body: JSON.stringify({
          item_id: itemId,
          category_id: categoryId,
          ...reqBody,
          player_id: playerId,
          requirements: reqBody,
        }),
      });
      return NextResponse.json({
        success: true,
        player: {
          player_id: playerId,
          player_name:
            val.player_name ||
            val.data?.player_name ||
            val.player?.player_name ||
            playerId,
          region: val.region || val.data?.region || '',
        },
      });
    } catch (e: any) {
      // Second try: minimal body only
      try {
        const val = await s2t('/player/validate', {
          method: 'POST',
          body: JSON.stringify({
            item_id: itemId,
            category_id: categoryId,
            player_id: playerId,
          }),
        });
        return NextResponse.json({
          success: true,
          player: {
            player_id: playerId,
            player_name: val.player_name || val.data?.player_name || playerId,
            region: val.region || val.data?.region || '',
          },
        });
      } catch {
        return NextResponse.json(
          {
            error:
              e?.message ||
              'No se pudo verificar el ID/usuario. Revisa que coincida con la región del paquete.',
          },
          { status: 400 }
        );
      }
    }
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 400 });
  }
}
