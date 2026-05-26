import { env } from './environment';
import { logger } from '../utils/logger';
import { initializePool, closePool } from '../utils/database';

interface DatabaseConfig {
  url: string;
  connectionTimeoutMS: number;
  idleTimeoutMS: number;
}

export const databaseConfig: DatabaseConfig = {
  url: env.DATABASE_URL,
  connectionTimeoutMS: 5000,
  idleTimeoutMS: 30000,
};

export const initializeDatabase = async (): Promise<void> => {
  try {
    logger.info('Initializing database connection', {
      url: databaseConfig.url.split('@')[1] || 'configured',
    });

    // Initialize PostgreSQL connection pool
    initializePool();
    
    logger.info('Database connection initialized');
  } catch (error) {
    logger.error('Database initialization failed', error);
    throw error;
  }
};

export const closeDatabase = async (): Promise<void> => {
  try {
    logger.info('Closing database connection');
    await closePool();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection', error);
  }
};

