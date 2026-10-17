# DinoDev GAMES

Tienda de recargas multi-juego (Next.js + Vercel + Neon + Shop2TopUp).

## Funciones
- Catálogo: Free Fire, PUBG Mobile, MLBB, Blood Strike
- Precios en Bs (Bolivia) y R$ (Brasil)
- Regiones del proveedor (LATAM, BR, etc.)
- Validación de ID de jugador
- Pago QR (1 hora) + Pix key Brasil
- Historial de pedidos del cliente
- Panel admin con contraseña
- Saldo Shop2TopUp en admin
- Notificaciones Telegram
- PWA instalable + modo offline básico
- WhatsApp flotante de soporte

## Variables Vercel
SHOP2TOPUP_API_KEY, DATABASE_URL, OPERATOR_SECRET,
RATE_USD_BOB, RATE_USD_BRL, QR_URL_BO, QR_URL_BR, PIX_KEY_BR,
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ADMIN_PUBLIC_URL

## URLs
- Tienda: /
- Admin: /admin (contraseña = OPERATOR_SECRET)

## Portadas
public/freefire.jpg, pubg.jpg, mlbb.jpg, bloodstrike.jpg, logo.png
