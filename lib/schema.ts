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
      user_id uuid REFERENCES app_users(id),
      game_name text,
      item_name text,
      item_id integer,
      category_id integer,
      player_id text,
      player_name text,
      region_label text,
      cost_usd numeric,
      price_usd numeric NOT NULL,
      local_amount numeric,
      local_currency text,
      pay_country text,
      pay_method text DEFAULT 'wallet',
      qr_url text,
      provider_response jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id),
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

  // defaults
  const keys = ['rate_bo', 'rate_br', 'markup_usd', 'enabled_big_category_ids'];
  for (const [k, v] of [
    ['rate_bo', '12'],
    ['rate_br', '5.5'],
    ['markup_usd', '0.20'],
    ['enabled_big_category_ids', '[]'],
  ] as const) {
    await db`
      INSERT INTO app_settings (key, value) VALUES (${k}, ${v})
      ON CONFLICT (key) DO NOTHING
    `;
  }
}
