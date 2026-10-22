import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { notifyTelegram } from '@/lib/notify';
import { safeError } from '@/lib/shop2topup';

async function sendTelegramPhoto(caption: string, dataUrl: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || !dataUrl.startsWith('data:image')) return false;
  try {
    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return false;
    const mime = m[1];
    const b64 = m[2];
    const bin = Buffer.from(b64, 'base64');
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const form = new FormData();
    form.append('chat_id', chat);
    form.append('caption', caption.slice(0, 1024));
    form.append('photo', new Blob([bin], { type: mime }), `comprobante.${ext}`);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureSchema();
    const db = sql();
    const rows = await db`
      SELECT id, status, game_name, item_name, player_id, player_name,
             price_usd::text, local_amount::text, local_currency, pay_method,
             pay_country, qr_url, created_at, expires_at
      FROM payment_orders WHERE id = ${params.id}::uuid LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, order: rows[0] });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureSchema();
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || 'claim_paid');
    const db = sql();
    const rows = await db`SELECT * FROM payment_orders WHERE id = ${params.id}::uuid LIMIT 1`;
    const order = rows[0];
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

    if (action === 'claim_paid') {
      if (order.status !== 'pending_payment') {
        return NextResponse.json({
          success: true,
          status: order.status,
          message: 'La orden ya fue marcada.',
        });
      }

      const proofImage = typeof b.proofImage === 'string' ? b.proofImage : '';
      if (!proofImage.startsWith('data:image')) {
        return NextResponse.json(
          { error: 'Debes subir el comprobante (JPG/PNG) antes de marcar Ya pagué.' },
          { status: 400 }
        );
      }

      await db`
        UPDATE payment_orders
        SET status = 'awaiting_confirmation', updated_at = now()
        WHERE id = ${params.id}::uuid
      `;

      const caption =
        `💰 YA PAGUÉ (con comprobante)\n` +
        `${order.game_name || ''} · ${order.item_name || ''}\n` +
        `Jugador: ${order.player_name || order.player_id}\n` +
        `${order.local_currency || ''} ${order.local_amount || ''} · USD ${order.price_usd}\n` +
        `Método: ${order.pay_method || 'qr'} · País: ${order.pay_country || ''}\n` +
        `Orden: ${params.id}\n` +
        `Admin → Aceptar (Shop2TopUp o externo) / Cancelar / No pagó`;

      const photoOk = await sendTelegramPhoto(caption, proofImage);
      if (!photoOk) {
        await notifyTelegram(caption + '\n(Comprobante no se pudo reenviar como foto)');
      }

      return NextResponse.json({
        success: true,
        status: 'awaiting_confirmation',
        photoSent: photoOk,
        message: 'Comprobante recibido. Verificando pago…',
      });
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
