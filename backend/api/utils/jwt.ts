import jwt from 'jsonwebtoken';
import { logger } from './logger';
import { AppError } from './errors';

interface TokenPayload {
  id: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';

export const generateToken = (payload: TokenPayload): string => {
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRE as jwt.SignOptions['expiresIn'],
    });
    return token;
  } catch (error) {
    logger.error('Error generating token', error);
    throw new AppError(500, 'Failed to generate token');
  }
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError(401, 'Invalid token');
    }
    logger.error('Error verifying token', error);
    throw new AppError(401, 'Token verification failed');
  }
};

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded;
  } catch (error) {
    logger.error('Error decoding token', error);
    return null;
  }
};

export interface AuthRequest {
  user?: TokenPayload;
  token?: string;
}
