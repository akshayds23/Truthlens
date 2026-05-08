import { Router } from 'express';
import { authController } from '../controllers/authController';
import { validateRequest, authSchemas } from '../middleware/validation';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.post(
  '/login',
  validateRequest({ body: authSchemas.login }),
  authController.login
);

router.post(
  '/register',
  validateRequest({ body: authSchemas.register }),
  authController.register
);

router.post('/logout', authenticateToken, authController.logout);

router.get('/me', authenticateToken, authController.me);

export default router;
