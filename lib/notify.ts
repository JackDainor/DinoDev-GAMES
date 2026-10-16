/** Optional Telegram alert when a customer claims payment. */
export async function notifyTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { sent: false, reason: 'missing_env' as const };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, reason: 'telegram_error' as const, detail: body.slice(0, 200) };
    }
    return { sent: true as const };
  } catch (e: any) {
    return { sent: false, reason: 'network' as const, detail: String(e?.message || e) };
  }
}
