export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const createError = (
  statusCode: number,
  message: string,
  isOperational: boolean = true
): AppError => {
  return new AppError(statusCode, message, isOperational);
};

export const errorMessages = {
  UNAUTHORIZED: 'Unauthorized - Invalid credentials',
  FORBIDDEN: 'Forbidden - Access denied',
  NOT_FOUND: 'Resource not found',
  BAD_REQUEST: 'Bad request - Invalid input',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  TOKEN_EXPIRED: 'Token has expired',
  INVALID_TOKEN: 'Invalid token',
  MISSING_TOKEN: 'No token provided',
};

