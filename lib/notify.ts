export async function notifyTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }),
    });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}

export function waMeLink(phone: string, text: string) {
  const n = phone.replace(/\D/g, '');
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
