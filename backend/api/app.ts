import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { env } from './config/environment';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

const app: Express = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

const configuredOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...configuredOrigins,
  'http://localhost:3000',
  'http://localhost:5173',
]);

const isAllowedOrigin = (origin: string) => {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
  } catch (_error) {
    return false;
  }
};

// CORS middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

// Request logging
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// Rate limiting (skip for health and root endpoints)
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Health check endpoints (no rate limit)
app.get(['/health', '/api/health'], (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoints (no rate limit)
app.get(['/', '/api'], (req: Request, res: Response) => {
  res.json({
    message: 'TruthLens API Gateway v0.1.0',
    version: env.API_VERSION,
    environment: env.NODE_ENV,
  });
});

const lazyRoute =
  (loadRouter: () => Promise<{ default: any }>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const router = (await loadRouter()).default;
      router(req, res, next);
    } catch (error) {
      next(error);
    }
  };

// API routes
app.use('/api/auth', lazyRoute(() => import('./routes/auth.routes')));
app.use('/api/claims', lazyRoute(() => import('./routes/claims.routes')));
app.use('/api/providers', lazyRoute(() => import('./routes/providers.routes')));

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: 'Endpoint not found',
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
