import { NextRequest, NextResponse } from 'next/server';
import { s2t, safeError } from '@/lib/shop2topup';
import { sql } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'ID de orden inválido.' }, { status: 400 });
    }

    const out = await s2t(`/orders/${id}`);
    const order = out.order ?? out;
    const status = String(order?.status ?? 'pending');

    try {
      const db = sql();
      await db`
        UPDATE orders SET status = ${status}, provider_response = ${JSON.stringify(out)}::jsonb, updated_at = now()
        WHERE provider_order_id = ${id}
      `;
    } catch {
      // DB optional for status reads
    }

    return NextResponse.json({ success: true, order });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status });
  }
}
