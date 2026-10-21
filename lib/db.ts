import { neon } from '@neondatabase/serverless';

export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL en las variables de entorno.');
  }
  return neon(process.env.DATABASE_URL);
}
