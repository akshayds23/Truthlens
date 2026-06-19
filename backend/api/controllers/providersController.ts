import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { LLMProviderProxy } from '../services/llmProviderProxy';
import { AppError } from '../utils/errors';

export const providersController = {
  /**
   * GET /api/providers
   * Get list of supported LLM providers
   */
  getProviders: asyncHandler(async (req: Request, res: Response) => {
    logger.info('GET /api/providers - fetching supported providers');
    
    const providers = LLMProviderProxy.getProviders();
    
    res.json({
      status: 'success',
      data: providers,
      message: `Found ${providers.length} supported LLM providers`
    });
  }),

  /**
   * GET /api/providers/:id
   * Get provider details including models
   */
  getProvider: asyncHandler(async (req: Request, res: Response) => {
    logger.info(`GET /api/providers/:id - fetching provider: ${req.params.id}`);
    const { id } = req.params;

    const providers = LLMProviderProxy.getProviders();
    const provider = providers.find(p => p.id === id);

    if (!provider) {
      throw new AppError(404, `Provider '${id}' not found`);
    }

    res.json({
      status: 'success',
      data: provider
    });
  }),

  /**
   * POST /api/providers/test-key
   * Test if an API key is valid for a provider
   * 
   * Request body:
   * {
   *   "provider": "openai",
   *   "apiKey": "sk-..."
   * }
   */
  testKey: asyncHandler(async (req: Request, res: Response) => {
    logger.info('POST /api/providers/test-key - testing API key');
    
    const { provider, apiKey } = req.body;

    // Validate request body
    if (!provider || typeof provider !== 'string') {
      throw new AppError(400, 'Invalid or missing provider');
    }
    if (!apiKey || typeof apiKey !== 'string') {
      throw new AppError(400, 'Invalid or missing apiKey');
    }

    // Test the API key
    const result = await LLMProviderProxy.testApiKey({
      provider,
      apiKey
    });

    // Don't include the actual API key in any responses
    res.json({
      status: 'success',
      data: {
        valid: result.valid,
        provider: result.provider,
        message: result.message,
        error: result.error
      }
    });
  }),

  /**
   * POST /api/providers/validate
   * Validate if provider and model combination is supported
   * 
   * Request body:
   * {
   *   "provider": "openai",
   *   "model": "gpt-4"
   * }
   */
  validateProviderModel: asyncHandler(async (req: Request, res: Response) => {
    logger.info('POST /api/providers/validate - validating provider/model');
    
    const { provider, model } = req.body;

    // Validate request body
    if (!provider || typeof provider !== 'string') {
      throw new AppError(400, 'Invalid or missing provider');
    }
    if (!model || typeof model !== 'string') {
      throw new AppError(400, 'Invalid or missing model');
    }

    // Check if combination is valid
    const isValid = LLMProviderProxy.validateProviderAndModel(provider, model);

    if (!isValid) {
      throw new AppError(
        400,
        `Model '${model}' is not supported for provider '${provider}'`
      );
    }

    res.json({
      status: 'success',
      data: {
        valid: true,
        provider,
        model
      }
    });
  }),

  /**
   * GET /api/providers/:id/models
   * Get available models for a provider
   */
  getModels: asyncHandler(async (req: Request, res: Response) => {
    logger.info(`GET /api/providers/:id/models - fetching models for: ${req.params.id}`);
    const { id } = req.params;

    const models = LLMProviderProxy.getModelsForProvider(id);

    if (models.length === 0) {
      throw new AppError(404, `Provider '${id}' not found`);
    }

    res.json({
      status: 'success',
      data: {
        provider: id,
        models
      }
    });
  }),

  /**
   * Legacy stubs - kept for backwards compatibility
   */
  createProvider: asyncHandler(async (req: Request, res: Response) => {
    logger.info('POST /api/providers - create provider (not implemented)');
    res.status(501).json({
      status: 'error',
      message: 'Custom provider creation is not implemented'
    });
  }),

  updateProvider: asyncHandler(async (req: Request, res: Response) => {
    logger.info('PATCH /api/providers/:id - update provider (not implemented)');
    res.status(501).json({
      status: 'error',
      message: 'Provider updates are not supported'
    });
  }),

  deleteProvider: asyncHandler(async (req: Request, res: Response) => {
    logger.info('DELETE /api/providers/:id - delete provider (not implemented)');
    res.status(501).json({
      status: 'error',
      message: 'Provider deletion is not supported'
    });
  })
};

