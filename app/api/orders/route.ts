import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { s2t, safeError } from '@/lib/shop2topup';
import { sql } from '@/lib/db';

function listOf(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.requirements)) return body.requirements;
  if (Array.isArray(body)) return body;
  return [];
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.ALLOW_TEST_ORDERS !== 'true') {
      return NextResponse.json(
        {
          error:
            'Órdenes desactivadas. Activa ALLOW_TEST_ORDERS=true solo si aceptas que Shop2TopUp puede cobrar de tu saldo. No hay pago de cliente integrado.',
        },
        { status: 403 }
      );
    }

    const b = await req.json();
    const itemId = Number(b.itemId);
    const categoryId = Number(b.categoryId);
    const playerId = String(b.playerId || '').trim();

    if (
      !Number.isSafeInteger(itemId) ||
      itemId <= 0 ||
      !Number.isSafeInteger(categoryId) ||
      categoryId <= 0 ||
      !/^\d{5,20}$/.test(playerId)
    ) {
      return NextResponse.json({ error: 'Datos de paquete o jugador no válidos.' }, { status: 400 });
    }
    if (String(b.confirmedPlayer || '') !== playerId || !String(b.playerName || '').trim()) {
      return NextResponse.json(
        { error: 'Valida el jugador y confirma el nombre antes de continuar.' },
        { status: 400 }
      );
    }

    const reqData = await s2t(`/catalog/category/${categoryId}/requirements`);
    const requirements: Record<string, unknown> = { player_id: playerId };
    for (const r of listOf(reqData) as any[]) {
      if (r.field_name !== 'player_id' && b.requirements?.[r.field_name] !== undefined) {
        requirements[r.field_name] = b.requirements[r.field_name];
      }
    }

    const pd = await s2t(`/catalog/subcategory/${itemId}/price`);
    const unitPrice = String(pd.unit_price ?? pd.price?.unit_price ?? '');
    const currency = String(pd.currency ?? pd.price?.currency ?? 'USD');
    const itemName = String(pd.item_name ?? pd.price?.item_name ?? b.itemName ?? 'Free Fire');

    if (!/^\d+(\.\d+)?$/.test(unitPrice)) {
      return NextResponse.json({ error: 'El proveedor no devolvió un precio válido.' }, { status: 502 });
    }

    const id = randomUUID();
    const db = sql();
    await db`
      CREATE TABLE IF NOT EXISTS orders (
        id uuid PRIMARY KEY,
        provider_order_id text UNIQUE NOT NULL,
        player_id text NOT NULL,
        player_name text NOT NULL,
        item_id integer NOT NULL,
        item_name text NOT NULL,
        unit_price numeric NOT NULL,
        currency text NOT NULL,
        status text NOT NULL,
        provider_response jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await db`
      INSERT INTO orders (id, provider_order_id, player_id, player_name, item_id, item_name, unit_price, currency, status)
      VALUES (${id}::uuid, ${id}, ${playerId}, ${String(b.playerName)}, ${itemId}, ${itemName}, ${unitPrice}, ${currency}, 'processing')
    `;

    const out = await s2t('/orders/create', {
      method: 'POST',
      body: JSON.stringify({
        order_id: id,
        sub_category_id: itemId,
        quantity: 1,
        requirements,
        expected_unit_price: unitPrice,
      }),
    });

    const status = String(out.order?.status ?? out.status ?? 'pending');
    await db`
      UPDATE orders SET status = ${status}, provider_response = ${JSON.stringify(out)}::jsonb, updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return NextResponse.json({
      success: true,
      order: out.order ?? out,
      localOrderId: id,
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status });
  }
}
