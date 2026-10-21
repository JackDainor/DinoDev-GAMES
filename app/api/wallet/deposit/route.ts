import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getSessionUser } from '@/lib/auth';
import { notifyTelegram, waMeLink } from '@/lib/notify';
import { safeError } from '@/lib/shop2topup';

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const b = await req.json();
    const amount = Number(b.amount);
    const txRef = String(b.txRef || '').trim();
    const proofNote = String(b.proofNote || '').trim();
    if (!(amount >= 5)) {
      return NextResponse.json({ error: 'Mínimo 5 USDT' }, { status: 400 });
    }
    if (!txRef) {
      return NextResponse.json({ error: 'Indica el TxID / referencia de Binance Pay' }, { status: 400 });
    }
    const db = sql();
    const rows = await db`
      INSERT INTO wallet_ledger (user_id, amount_usd, kind, status, note, tx_ref, proof_note)
      VALUES (${user.id}::uuid, ${amount}, 'deposit', 'pending', ${'Binance Pay'}, ${txRef}, ${proofNote || null})
      RETURNING id, amount_usd::text, status, created_at
    `;
    const dep = rows[0];
    const adminWa = process.env.ADMIN_WHATSAPP || '5511966019490';
    const msg =
      `💰 Solicitud de recarga billetera\n` +
      `User: ${user.username} (${user.email})\n` +
      `WhatsApp: ${user.whatsapp || '—'}\n` +
      `Monto: ${amount} USDT\n` +
      `TxID: ${txRef}\n` +
      (proofNote ? `Nota: ${proofNote}\n` : '') +
      `Ledger: ${dep.id}`;

    await notifyTelegram(msg.replace(/\n/g, '\n'));
    return NextResponse.json({
      success: true,
      deposit: dep,
      adminWhatsAppLink: waMeLink(adminWa, msg),
      message: 'Solicitud enviada. El admin verificará y acreditará tu saldo.',
    });
  } catch (e) {
    const x = safeError(e);
    return NextResponse.json(x, { status: x.status || 500 });
  }
}
