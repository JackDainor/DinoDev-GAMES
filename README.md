# DinoDev GAMES v2 — Tienda completa de recargas

Next.js 14 + Vercel + Neon + Shop2TopUp.

## Incluye
- Catálogo completo Shop2TopUp (juegos + gift cards) activable en admin
- Precio = costo API + **ganancia fija en USD** (no porcentaje)
- Tipo de cambio BO (Bs) y BR (R$) desde admin
- Tienda: precio **USD** y debajo moneda local
- Menú lateral: logo, tienda, cuenta, billetera, admin
- Registro/login (email, password, username, WhatsApp) → Neon
- Billetera USD, depósito Binance Pay mín. 5 USDT, historial
- Notificación Telegram + link WhatsApp al solicitar depósito
- Admin: pedidos, catálogo, precios/TC, usuarios y saldo, depósitos

## Deploy (Vercel)
1. Sube este proyecto a un repo GitHub
2. Import en Vercel
3. Variables de entorno (Production):

| Variable | Secret | Notas |
|----------|--------|-------|
| DATABASE_URL | sí | Neon connection string |
| SHOP2TOPUP_API_KEY | sí | Tu API key |
| OPERATOR_SECRET | sí | Clave del panel /admin |
| TELEGRAM_BOT_TOKEN | sí | Opcional pero recomendado |
| TELEGRAM_CHAT_ID | sí | Opcional pero recomendado |
| ADMIN_WHATSAPP | no | Ej: 5511966019490 |
| NEXT_PUBLIC_BINANCE_PAY_ID | no | Se muestra en /cuenta |

4. Deploy
5. Entra a /admin → Juegos/Gift cards → marca → Guardar
6. Precios USD / TC → pon ganancia y tipos de cambio → Guardar

## URLs
- `/` tienda
- `/login` `/register` `/cuenta`
- `/admin`

## Flujo billetera
1. Usuario paga USDT en Binance (mín 5)
2. En /cuenta pega TxID → solicitud pending
3. Telegram avisa al admin
4. Admin → Depósitos USDT → Aprobar
5. Saldo disponible para comprar packs
