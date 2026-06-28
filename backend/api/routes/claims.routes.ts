import { Router } from 'express';
import { claimsController } from '../controllers/claimsController';
import { validateRequest, claimSchemas } from '../middleware/validation';
import { authenticateToken } from '../middleware/authMiddleware';
import Joi from 'joi';

const router = Router();

// Authentication is now optional for public access
import { optionalAuth } from '../middleware/authMiddleware';

router.use(optionalAuth);

// Create a new claim
router.post(
  '/',
  validateRequest({ body: claimSchemas.create }),
  claimsController.createClaim
);

// Get all claims for the authenticated user
router.get('/', claimsController.getUserClaims);

// Search claims
router.get(
  '/search',
  validateRequest({ query: Joi.object({ q: Joi.string().required() }) }),
  claimsController.searchClaims
);

// Get a specific claim by ID
router.get('/:id', claimsController.getClaim);

// Process a claim with streaming updates
router.post('/:id/process', claimsController.processClaim);

// Delete a claim (soft delete)
router.delete('/:id', claimsController.deleteClaim);

// Submit feedback for a claim
router.post(
  '/:id/feedback',
  validateRequest({ body: claimSchemas.feedback }),
  claimsController.submitFeedback
);

// Export a report
router.post(
  '/:id/export',
  validateRequest({ query: claimSchemas.export }),
  claimsController.exportReport
);

export default router;
