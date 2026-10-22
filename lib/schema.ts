import { sql } from '@/lib/db';

export async function ensureSchema() {
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

  // Migrate old Neon tables column-by-column
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS user_id uuid`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS game_name text`; } catch { /* */ }
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

    try { await db`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS game_slug text`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN game_slug DROP NOT NULL`; } catch { /* */ }
  try { await db`ALTER TABLE payment_orders ALTER COLUMN game_slug SET DEFAULT 'game'`; } catch { /* */ }

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

  await db`INSERT INTO app_settings (key, value) VALUES ('rate_bo', '12') ON CONFLICT (key) DO NOTHING`;
  await db`INSERT INTO app_settings (key, value) VALUES ('rate_br', '5.5') ON CONFLICT (key) DO NOTHING`;
  await db`INSERT INTO app_settings (key, value) VALUES ('markup_usd', '0.20') ON CONFLICT (key) DO NOTHING`;
  await db`INSERT INTO app_settings (key, value) VALUES ('enabled_big_category_ids', '[]') ON CONFLICT (key) DO NOTHING`;
}
