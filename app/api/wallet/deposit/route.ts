import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { notifyTelegram, waMeLink } from '@/lib/notify';
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

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const b = await req.json();
    const amount = Number(b.amount);
    const proofNote = String(b.proofNote || '').trim();
    const proofImage = typeof b.proofImage === 'string' ? b.proofImage : '';
    if (!(amount >= 5)) {
      return NextResponse.json({ error: 'Mínimo 5 USDT' }, { status: 400 });
    }
    if (!proofImage.startsWith('data:image')) {
      return NextResponse.json(
        { error: 'Sube la foto del comprobante (JPG/PNG).' },
        { status: 400 }
      );
    }
    const db = sql();
    const rows = await db`
      INSERT INTO wallet_ledger (user_id, amount_usd, kind, status, note, tx_ref, proof_note)
      VALUES (
        ${user.id}::uuid, ${amount}, 'deposit', 'pending',
        ${'Binance Pay [con imagen]'}, ${null}, ${proofNote || null}
      )
      RETURNING id, amount_usd::text, status, created_at
    `;
    const dep = rows[0];
    const adminWa = process.env.ADMIN_WHATSAPP || '5511966019490';
    const msg =
      `💰 Solicitud saldo billetera\n` +
      `User: ${user.username} (${user.email})\n` +
      `WhatsApp: ${user.whatsapp || '—'}\n` +
      `Monto: ${amount} USDT\n` +
      (proofNote ? `Nota: ${proofNote}\n` : '') +
      `Ledger: ${dep.id}\n` +
      `Admin → Depósitos USDT → Aprobar`;

    const photoOk = await sendTelegramPhoto(msg, proofImage);
    if (!photoOk) {
      await notifyTelegram(msg + '\n(Comprobante no se pudo reenviar como foto)');
    }

    return NextResponse.json({
      success: true,
      deposit: dep,
      photoSent: photoOk,
      adminWhatsAppLink: waMeLink(adminWa, msg),
      message: photoOk
        ? 'Solicitud enviada con comprobante a Telegram.'
        : 'Solicitud enviada. El admin verificará y acreditará tu saldo.',
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
