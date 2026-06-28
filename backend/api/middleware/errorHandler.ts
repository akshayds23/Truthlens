import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface ErrorResponse {
  status: string;
  statusCode: number;
  message: string;
  timestamp: string;
  path?: string;
  details?: any;
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const timestamp = new Date().toISOString();

  if (error instanceof AppError) {
    const response: ErrorResponse = {
      status: 'error',
      statusCode: error.statusCode,
      message: error.message,
      timestamp,
      path: req.path,
    };

    logger.error(`[${error.statusCode}] ${error.message}`, {
      path: req.path,
      method: req.method,
    });

    res.status(error.statusCode).json(response);
    return;
  }

  logger.error('Unhandled error', error);

  const response: ErrorResponse = {
    status: 'error',
    statusCode: 500,
    message: 'Internal server error',
    timestamp,
    path: req.path,
  };

  if (process.env.NODE_ENV === 'development' || process.env.VERCEL) {
    response.details = error.message || String(error);
  }

  res.status(500).json(response);
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
