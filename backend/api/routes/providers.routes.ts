import { Router } from 'express';
import { providersController } from '../controllers/providersController';
import { optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// Get list of supported providers
router.get('/', optionalAuth, providersController.getProviders);

// Get available models for a provider
router.get('/:id/models', optionalAuth, providersController.getModels);

// Get provider details
router.get('/:id', optionalAuth, providersController.getProvider);

// Test API key validity (Prompt 12)
router.post('/test-key', providersController.testKey);

// Validate provider and model combination (Prompt 12)
router.post('/validate', providersController.validateProviderModel);

// Legacy endpoints (not implemented)
router.post('/', providersController.createProvider);
router.patch('/:id', providersController.updateProvider);
router.delete('/:id', providersController.deleteProvider);

export default router;

