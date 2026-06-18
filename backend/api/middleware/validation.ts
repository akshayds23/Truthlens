import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface ValidationSchema {
  body?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
}

export const validateRequest = (schemas: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const errors: string[] = [];

      if (schemas.body) {
        const { error: bodyError } = schemas.body.validate(req.body, {
          abortEarly: false,
        });
        if (bodyError) {
          errors.push(
            ...bodyError.details.map((detail) => detail.message)
          );
        }
      }

      if (schemas.params) {
        const { error: paramsError } = schemas.params.validate(req.params, {
          abortEarly: false,
        });
        if (paramsError) {
          errors.push(
            ...paramsError.details.map((detail) => detail.message)
          );
        }
      }

      if (schemas.query) {
        const { error: queryError } = schemas.query.validate(req.query, {
          abortEarly: false,
        });
        if (queryError) {
          errors.push(
            ...queryError.details.map((detail) => detail.message)
          );
        }
      }

      if (errors.length > 0) {
        logger.warn('Validation errors', { errors });
        throw new AppError(400, `Validation error: ${errors.join(', ')}`);
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error('Validation middleware error', error);
        next(new AppError(400, 'Validation failed'));
      }
    }
  };
};

// Common validation schemas
export const authSchemas = {
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email must be valid',
      'any.required': 'Email is required',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
  }),
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email must be valid',
      'any.required': 'Email is required',
    }),
    password: Joi.string()
      .min(6)
      .pattern(/[A-Z]/, 'uppercase')
      .pattern(/[a-z]/, 'lowercase')
      .pattern(/\d/, 'digit')
      .required()
      .messages({
        'string.min': 'Password must be at least 6 characters',
        'string.pattern.name': 'Password must contain {#label}',
        'any.required': 'Password is required',
      }),
    fullName: Joi.string().optional().messages({
      'string.base': 'Full name must be a string',
    }),
  }),
  refresh: Joi.object({
    token: Joi.string().optional(),
  }),
};

export const claimSchemas = {
  create: Joi.object({
    text: Joi.string().min(10).max(500).required().messages({
      'string.min': 'Claim text must be at least 10 characters',
      'string.max': 'Claim text must not exceed 500 characters',
      'any.required': 'Claim text is required',
    }),
    category: Joi.string()
      .valid('health', 'politics', 'science', 'finance', 'other')
      .required()
      .messages({
        'any.only': 'Category must be one of: health, politics, science, finance, other',
        'any.required': 'Category is required',
      }),
    depth: Joi.string()
      .valid('quick', 'standard', 'deep')
      .required()
      .messages({
        'any.only': 'Depth must be one of: quick, standard, deep',
        'any.required': 'Depth is required',
      }),
    llmProvider: Joi.string()
      .valid('openai', 'gemini', 'anthropic', 'groq', 'local')
      .required()
      .messages({
        'any.only': 'LLM provider must be one of: openai, gemini, anthropic, groq, local',
        'any.required': 'LLM provider is required',
      }),
    apiKey: Joi.string().optional(),
  }),
  feedback: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required().messages({
      'number.min': 'Rating must be between 1 and 5',
      'number.max': 'Rating must be between 1 and 5',
      'any.required': 'Rating is required',
    }),
    comment: Joi.string().max(500).optional(),
  }),
  export: Joi.object({
    format: Joi.string()
      .valid('json', 'markdown', 'pdf')
      .optional()
      .default('json'),
  }),
};
