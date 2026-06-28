import { Pool } from 'pg';
import { logger } from './logger';

let pool: Pool;

export const initializePool = (): Pool => {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL || '';
    const isNeon = dbUrl.includes('neon.tech');
    pool = new Pool({
      connectionString: dbUrl,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      ...(isNeon ? {
        ssl: { rejectUnauthorized: false },
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      } : {}),
    });

    pool.on('error', (error) => {
      logger.error('Unexpected error on idle client', error);
    });

    pool.on('connect', () => {
      logger.debug('New client connected to database');
    });

    logger.info('Database pool initialized');
  }

  return pool;
};

export const getPool = (): Pool => {
  if (!pool) {
    return initializePool();
  }
  return pool;
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    logger.info('Database pool closed');
  }
};

export const query = async (text: string, params?: any[]) => {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
};

export const queryOne = async (text: string, params?: any[]) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};
