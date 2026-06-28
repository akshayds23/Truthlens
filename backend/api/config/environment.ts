import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

interface Environment {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRE: string;
  CORS_ORIGIN: string;
  LOG_LEVEL: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  AI_SERVICE_URL: string;
  API_VERSION: string;
  GEMINI_API_KEY: string;
  SERPER_API_KEY: string;
}

const getEnvironment = (): Environment => {
  const requiredEnvVars = [
    'JWT_SECRET',
    'CORS_ORIGIN',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingEnvVars.length > 0) {
    logger.warn(
      `Missing environment variables: ${missingEnvVars.join(', ')}`
    );
  }

  const env: Environment = {
    PORT: parseInt(process.env.PORT || '3000', 10),
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost/truthlens',
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '24h',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    RATE_LIMIT_WINDOW_MS: parseInt(
      process.env.RATE_LIMIT_WINDOW_MS || '900000',
      10
    ),
    RATE_LIMIT_MAX_REQUESTS: parseInt(
      process.env.RATE_LIMIT_MAX_REQUESTS || '100',
      10
    ),
    AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    API_VERSION: process.env.API_VERSION || 'v1',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    SERPER_API_KEY: process.env.SERPER_API_KEY || '',
  };

  return env;
};

export const env = getEnvironment();

logger.info('Environment loaded', { env: env.NODE_ENV, port: env.PORT });
