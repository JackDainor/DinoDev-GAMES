import { sql } from '@/lib/db';
import { getSettings, type AppSettings } from '@/lib/settings';

/**
 * DinoCoin — puntos de fidelidad de Dino Games (solo usuarios registrados).
 *
 *  GANAR:  DC = floor( ganancia_USD_del_pedido × earnShare / valueUsd )
 *          La ganancia es (precio de venta − costo Shop2TopUp). Si no ganas nada
 *          en un pack, ese pack no da DinoCoin.
 *  CANJEAR: DC = ceil( costo_Shop2TopUp × (1 + redeemMarkup) / valueUsd )
 *
 *  Con earnShare ≤ 1 y redeemMarkup ≥ 0 nunca pierdes dinero:
 *  cada DC emitido te dejó ≥ valueUsd de ganancia y canjearlo te cuesta
 *  valueUsd / (1 + redeemMarkup) como máximo.
 */

export type DcConfig = {
  enabled: boolean;
  valueUsd: number;
  earnShare: number;
  redeemMarkup: number;
};

export function dcConfigFrom(s: Pick<AppSettings, 'dcEnabled' | 'dcValueUsd' | 'dcEarnShare' | 'dcRedeemMarkup'>): DcConfig {
  return {
    enabled: s.dcEnabled,
    valueUsd: s.dcValueUsd,
    earnShare: s.dcEarnShare,
    redeemMarkup: s.dcRedeemMarkup,
  };
}

export function dcEarn(priceUsd: number, costUsd: number, cfg: DcConfig): number {
  if (!cfg.enabled) return 0;
  const profit = priceUsd - costUsd;
  if (!(profit > 0) || !(costUsd > 0)) return 0;
  return Math.max(0, Math.floor((profit * cfg.earnShare) / cfg.valueUsd + 1e-9));
}

export function dcCost(costUsd: number, cfg: DcConfig): number {
  if (!(costUsd > 0)) return 0;
  return Math.max(1, Math.ceil((costUsd * (1 + cfg.redeemMarkup)) / cfg.valueUsd - 1e-9));
}

/** Acredita DinoCoin de un pedido completado. Idempotente (una sola vez por pedido). */
export async function awardForOrder(orderId: string): Promise<number> {
  const db = sql();
  const rows = await db`
    SELECT id, user_id, pay_method, cost_usd::text AS cost_usd, price_usd::text AS price_usd
    FROM payment_orders WHERE id = ${orderId}::uuid LIMIT 1
  `;
  const o = rows[0];
  if (!o || !o.user_id) return 0;
  if (String(o.pay_method) === 'dinocoin') return 0;

  const cfg = dcConfigFrom(await getSettings());
  const amount = dcEarn(Number(o.price_usd), Number(o.cost_usd), cfg);

  // "Reclamo" atómico: solo el primero que lo marque acredita.
  const claim = await db`
    UPDATE payment_orders
    SET dc_awarded = true, dc_earned = ${amount}, updated_at = now()
    WHERE id = ${orderId}::uuid AND COALESCE(dc_awarded, false) = false
    RETURNING id
  `;
  if (!claim.length || amount <= 0) return 0;

  await db`
    UPDATE app_users SET dinocoin = dinocoin + ${amount}, updated_at = now()
    WHERE id = ${o.user_id}::uuid
  `;
  try {
    await db`
      INSERT INTO dinocoin_ledger (user_id, amount, kind, order_id, note)
      VALUES (${o.user_id}::uuid, ${amount}, 'earn', ${orderId}::uuid, 'Recarga completada')
    `;
  } catch {
    /* el saldo ya fue acreditado */
  }
  return amount;
}

/** Devuelve los DinoCoin de un pedido pagado con DinoCoin que falló/cancelaron. Idempotente. */
export async function refundOrder(orderId: string): Promise<number> {
  const db = sql();
  const claim = await db`
    UPDATE payment_orders
    SET dc_refunded = true, updated_at = now()
    WHERE id = ${orderId}::uuid
      AND pay_method = 'dinocoin'
      AND COALESCE(dc_refunded, false) = false
      AND COALESCE(dc_cost, 0) > 0
    RETURNING user_id, dc_cost
  `;
  const r = claim[0];
  if (!r || !r.user_id) return 0;
  const amount = Number(r.dc_cost);
  await db`
    UPDATE app_users SET dinocoin = dinocoin + ${amount}, updated_at = now()
    WHERE id = ${r.user_id}::uuid
  `;
  try {
    await db`
      INSERT INTO dinocoin_ledger (user_id, amount, kind, order_id, note)
      VALUES (${r.user_id}::uuid, ${amount}, 'refund', ${orderId}::uuid, 'Pedido no completado')
    `;
  } catch {
    /* */
  }
  return amount;
}
