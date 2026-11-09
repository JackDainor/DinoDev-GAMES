import { sql } from '@/lib/db';

let ready: Promise<void> | null = null;

/** Corre las migraciones una sola vez por instancia (reintenta si falla). */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = runSchema().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

async function runSchema() {
  const db = sql();

  await db`
    CREATE TABLE IF NOT EXISTS app_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      whatsapp text,
      role text NOT NULL DEFAULT 'user',
      balance_usd numeric NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id uuid PRIMARY KEY,
      status text NOT NULL DEFAULT 'pending_payment',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS user_id uuid`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS game_name text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS game_slug text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS item_name text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS item_id integer`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS category_id integer`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS player_id text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS player_name text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS region_label text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS cost_usd numeric`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS price_usd numeric`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS local_amount numeric`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS local_currency text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS pay_country text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS pay_method text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS qr_url text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider_response jsonb`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS expires_at timestamptz`; } catch { /* */ }

  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS usd_price numeric`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS local_price numeric`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS currency text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS amount numeric`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN usd_price DROP NOT NULL`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN local_price DROP NOT NULL`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN price_usd DROP NOT NULL`; } catch { /* */ }


  // Relax NOT NULL on legacy columns that break inserts
  for (const col of [
    'game_slug',
    'game_name',
    'item_name',
    'player_id',
    'player_name',
    'region_label',
    'cost_usd',
    'price_usd',
    'local_amount',
    'local_currency',
    'pay_country',
    'pay_method',
    'qr_url',
    'item_id',
    'category_id',
    'user_id',
  ]) {
    try {
      if (col === 'game_slug') await db`ALTER TABLE payment_orders ALTER COLUMN game_slug DROP NOT NULL`;
      if (col === 'game_name') await db`ALTER TABLE payment_orders ALTER COLUMN game_name DROP NOT NULL`;
      if (col === 'item_name') await db`ALTER TABLE payment_orders ALTER COLUMN item_name DROP NOT NULL`;
      if (col === 'player_id') await db`ALTER TABLE payment_orders ALTER COLUMN player_id DROP NOT NULL`;
      if (col === 'price_usd') await db`ALTER TABLE payment_orders ALTER COLUMN price_usd DROP NOT NULL`;
    } catch {
      /* */
    }
  }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN game_slug SET DEFAULT 'game'`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN game_name SET DEFAULT 'Juego'`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN status SET DEFAULT 'pending_payment'`; } catch { /* */ }

  await db`
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      amount_usd numeric NOT NULL,
      kind text NOT NULL,
      status text NOT NULL DEFAULT 'completed',
      note text,
      tx_ref text,
      proof_note text,
      admin_note text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;


  // ───────── DinoCoin ─────────
  try { await db`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS dinocoin integer NOT NULL DEFAULT 0`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS dc_cost integer`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS dc_earned integer`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS dc_awarded boolean NOT NULL DEFAULT false`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS dc_refunded boolean NOT NULL DEFAULT false`; } catch { /* */ }

  await db`
    CREATE TABLE IF NOT EXISTS dinocoin_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      amount integer NOT NULL,
      kind text NOT NULL,
      order_id uuid,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  try {
    await db`CREATE UNIQUE INDEX IF NOT EXISTS dinocoin_ledger_order_kind ON dinocoin_ledger (order_id, kind) WHERE order_id IS NOT NULL`;
  } catch { /* */ }

  await db`INSERT INTO app_settings (key, value) VALUES ('rate_bo', '12') ON CONFLICT (key) DO NOTHING`;
  await db`INSERT INTO app_settings (key, value) VALUES ('rate_br', '5.5') ON CONFLICT (key) DO NOTHING`;
  await db`INSERT INTO app_settings (key, value) VALUES ('markup_usd', '0') ON CONFLICT (key) DO NOTHING`;
  await db`INSERT INTO app_settings (key, value) VALUES ('enabled_big_category_ids', '[]') ON CONFLICT (key) DO NOTHING`;
  await db`INSERT INTO app_settings (key, value) VALUES ('price_overrides', '{}') ON CONFLICT (key) DO NOTHING`;
}
