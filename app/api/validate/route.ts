import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const itemId = Number(b.itemId);
    const categoryId = Number(b.categoryId);
    const playerId = String(b.playerId || '').trim();
    if (!itemId || !categoryId || !playerId) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }
    const val = await s2t('/player/validate', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, category_id: categoryId, player_id: playerId }),
    });
    return NextResponse.json({
      success: true,
      player: {
        player_id: playerId,
        player_name: val.player_name || val.data?.player_name || val.player?.player_name || playerId,
        region: val.region || val.data?.region || '',
      },
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 400 });
  }
}
