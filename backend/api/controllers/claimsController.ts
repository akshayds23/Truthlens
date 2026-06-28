import { Request, Response } from 'express';
import { claimsService } from '../services/claimsService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { claimsStore } from '../utils/claimsStore';

export const claimsController = {
  createClaim: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Create claim endpoint called');

    if (process.env.VERCEL && !process.env.DATABASE_URL) {
      throw new AppError(500, 'DATABASE_URL is not configured for this deployment');
    }

    let userId = (req as any).user?.id;
    if (!userId) {
      userId = await claimsStore.getAnonymousUser();
    }
    const result = await claimsService.createClaim(userId, req.body);
    res.status(201).json(result);
  }),

  getClaim: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Get claim endpoint called');
    const { id } = req.params;
    const result = await claimsService.getClaimById(id);
    res.json(result);
  }),

  getUserClaims: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Get user claims endpoint called');
    let userId = (req as any).user?.id;
    if (!userId) {
      userId = await claimsStore.getAnonymousUser();
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await claimsService.getClaimsByUser(userId, page, limit);
    res.json(result);
  }),

  deleteClaim: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Delete claim endpoint called');
    let userId = (req as any).user?.id;
    if (!userId) {
      userId = await claimsStore.getAnonymousUser();
    }
    const { id } = req.params;
    await claimsService.deleteClaim(id, userId);
    res.json({
      status: 'success',
      message: 'Claim deleted successfully',
    });
  }),

  submitFeedback: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Submit feedback endpoint called');
    let userId = (req as any).user?.id;
    if (!userId) {
      userId = await claimsStore.getAnonymousUser();
    }
    const { id } = req.params;
    await claimsService.submitFeedback(userId, id, req.body);
    res.json({
      status: 'success',
      message: 'Feedback submitted successfully',
    });
  }),

  exportReport: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Export report endpoint called');
    const { id } = req.params;
    const format = (req.query.format as string) || 'json';
    const result = await claimsService.exportReport(id, format);

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="report-${id}.md"`);
      res.send(result);
    } else {
      res.json({
        status: 'success',
        data: result,
      });
    }
  }),

  searchClaims: asyncHandler(async (req: Request, res: Response) => {
    logger.info('Search claims endpoint called');
    const { q } = req.query;
    if (!q) {
      throw new AppError(400, 'Search query parameter "q" is required');
    }
    const result = await claimsService.searchClaims(q as string);
    res.json({
      status: 'success',
      data: result,
    });
  }),

  processClaim: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey, depth, llmProvider } = req.body;

    logger.info(`Starting process stream for claim ${id}`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if ((res as any).flush) {
        (res as any).flush();
      }
    };

    try {
      await claimsService.processClaimStream(
        id,
        { apiKey, depth, llmProvider },
        (stage, detail) => {
          sendEvent({ stage, detail });
        }
      );
      sendEvent({ status: 'completed' });
      res.end();
    } catch (err: any) {
      logger.error(`Error in process stream for ${id}:`, err);
      sendEvent({ error: err.message || 'Processing failed' });
      res.end();
    }
  }),
};
