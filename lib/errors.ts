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
