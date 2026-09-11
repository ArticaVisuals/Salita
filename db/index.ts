import { env } from 'cloudflare:workers';

export function getProgressDatabase(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) {
    throw new Error('SYNC_DATABASE_UNAVAILABLE');
  }
  return database;
}
