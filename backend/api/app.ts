import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { env } from './config/environment';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import claimsRoutes from './routes/claims.routes';
import providersRoutes from './routes/providers.routes';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app: Express = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS middleware
app.use(
  cors({
    origin: env.CORS_ORIGIN,
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

// Proxy AI endpoints to internal FastAPI service
app.use(
  '/ai',
  createProxyMiddleware({
    target: env.AI_SERVICE_URL || 'http://localhost:8000',
    changeOrigin: true,
    pathRewrite: { '^/ai': '/api' },
  })
);

// Health check endpoint (no rate limit)
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint (no rate limit)
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'TruthLens API Gateway v0.1.0',
    version: env.API_VERSION,
    environment: env.NODE_ENV,
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/providers', providersRoutes);

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

