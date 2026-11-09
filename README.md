# Dino Games

Recargas de juegos para **Bolivia** y **Brasil** (Next.js + Neon + Shop2TopUp).

## Servidores
- **Free Fire**: solo LATAM y Brasil.
- **Otros juegos**: LATAM, Brasil, Bolivia o Global (los globales funcionan en ambos países).
- Todo lo demás (Indonesia, Vietnam, MENA, EU, USA…) se oculta. Reglas en `lib/regions.ts`.
- Diagnóstico: abre `/api/catalog?bigCategoryId=ID&debug=1` y mira `regions` (mostradas) y `excluded` (ocultas).

## DinoCoin (puntos, solo usuarios registrados)
- **Ganar**: al completarse una recarga pagada con QR o billetera, el usuario recibe
  `floor(ganancia_USD × earnShare / valueUsd)` DinoCoin. Ganancia = precio de venta − costo Shop2TopUp.
  Un pack sin ganancia no da DinoCoin.
- **Canjear**: un pack cuesta `ceil(costo_S2T × (1 + redeemMarkup) / valueUsd)` DinoCoin.
- Valores por defecto (editables en Admin → Precios USD / TC → DinoCoin):
  1 DC = 0.01 USD · earnShare 50 % · redeemMarkup 20 %.
- Con earnShare ≤ 100 % y redeemMarkup ≥ 0 nunca pierdes dinero.
- Pedido pagado con DinoCoin → queda en "Pendiente" para que lo envíes; si lo cancelas o falla, los DC se devuelven solos.
- Las tablas/columnas se crean solas (migración automática en Neon).

## Variables (Vercel)
DATABASE_URL, SHOP2TOPUP_API_KEY, OPERATOR_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
ADMIN_WHATSAPP, QR_URL_BO, QR_URL_BR (o PIX_KEY_BR), NEXT_PUBLIC_QR_URL_BO, NEXT_PUBLIC_QR_URL_BR,
NEXT_PUBLIC_BINANCE_PAY_ID
