import app from './app';
import { env } from './config/environment';
import { logger } from './utils/logger';
import { initializeDatabase, closeDatabase } from './config/database';

const PORT = env.PORT;
let server: any;

const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();

    // Start Express server
    server = app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`, {
        environment: env.NODE_ENV,
        apiVersion: env.API_VERSION,
      });
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, closing connections gracefully...');

      server.close(async () => {
        logger.info('HTTP server closed');
        try {
          await closeDatabase();
          logger.info('Database connection closed');
        } catch (error) {
          logger.error('Error closing database', error);
        }
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      process.exit(1);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', reason);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer();

