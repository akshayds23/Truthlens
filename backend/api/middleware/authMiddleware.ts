import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthRequest } from '../utils/jwt';
import { AppError, errorMessages } from '../utils/errors';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: any;
      token?: string;
    }
  }
}

export const authenticateToken = (
  req: Request & AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (!token) {
      throw new AppError(401, errorMessages.MISSING_TOKEN);
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logger.error('Authentication error', error);
      next(new AppError(401, errorMessages.INVALID_TOKEN));
    }
  }
};

export const optionalAuth = (
  req: Request & AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (token) {
      try {
        const decoded = verifyToken(token);
        req.user = decoded;
        req.token = token;
      } catch (error) {
        logger.warn('Optional token verification failed', error);
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth error', error);
    next();
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (
    req: Request & AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      throw new AppError(401, errorMessages.UNAUTHORIZED);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, errorMessages.FORBIDDEN);
    }

    next();
  };
};

