# DiamondTop — Multi-game LATAM

Next.js (Vercel) + Shop2TopUp + Neon.

## Qué incluye
- Catálogo multi-juego: Free Fire, PUBG Mobile, Mobile Legends, Blood Strike.
- Selector de **región** por categoría del proveedor (LATAM, Brasil, Global, etc.).
- Validación de jugador con nombre y región del ID.
- Pago local **Bolivia (BOB)** y **Brasil (BRL)** con QR y vencimiento de **1 hora**.
- Estados: `pending_payment` → `awaiting_confirmation` → (operador) cumple con Shop2TopUp.

## Variables en Vercel
- `SHOP2TOPUP_API_KEY`
- `SHOP2TOPUP_BASE_URL` (opcional)
- `DATABASE_URL` (Neon, `sslmode=require`)
- `RATE_USD_BOB` / `RATE_USD_BRL`
- `QR_URL_BO` / `QR_URL_BR` (URL pública de la imagen del QR)
- `OPERATOR_SECRET` (para confirmar y enviar la recarga)
- `ALLOW_TEST_ORDERS=false`

## Flujo de pago
1. Cliente elige juego + región + paquete y valida ID.
2. Elige BO o BR → se crea orden con monto local y `expires_at` (+1h).
3. Paga el QR y pulsa “Ya realicé el pago”.
4. Tú confirmas el dinero y cumples con:

```bash
curl -X POST "https://TU-DOMINIO/api/checkout/ORDER_UUID" \
  -H "Content-Type: application/json" \
  -d '{"action":"confirm_and_fulfill","secret":"TU_OPERATOR_SECRET"}'
```

Eso debita la wallet de Shop2TopUp y envía la recarga.

## Región
Cada paquete muestra la región de la categoría. Si el ID del jugador es de otra región, la validación o la entrega pueden fallar: el cliente debe elegir la misma región que su cuenta.

## Seguridad
Nunca subas la API key al repo. Si se filtró, rotala en Shop2TopUp.
