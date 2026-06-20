import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const authController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Login endpoint called');
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    res.json(result);
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Register endpoint called');
    const { email, password, fullName } = req.body;
    const result = await authService.register({ email, password, fullName });
    res.status(201).json(result);
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Logout endpoint called');
    const userId = (req as any).user?.id;
    if (userId) {
      await authService.logout(userId);
    }
    res.json({ status: 'success', message: 'Logged out successfully' });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Me endpoint called');
    const user = (req as any).user;
    res.json({ status: 'success', data: user });
  }),
};
