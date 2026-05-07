enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

const LOG_LEVEL_PRIORITY: { [key in LogLevel]: number } = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

class Logger {
  private level: LogLevel;

  constructor(level: string = process.env.LOG_LEVEL || 'info') {
    this.level = (level.toUpperCase() as LogLevel) || LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(LogLevel.DEBUG, message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(LogLevel.INFO, message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, data));
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorData = error instanceof Error ? error.message : error;
      console.error(this.formatMessage(LogLevel.ERROR, message, errorData));
    }
  }
}

export const logger = new Logger();

