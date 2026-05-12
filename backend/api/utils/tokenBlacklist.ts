import { logger } from './logger';

interface BlacklistEntry {
  token: string;
  expiredAt: number;
}

const blacklist = new Set<string>();

// Clean expired tokens from blacklist every 5 minutes
setInterval(() => {
  const now = Date.now();
  let removed = 0;

  // Note: In production, use Redis for better performance
  // For MVP, we're using an in-memory Set
  // The JWT expiry will handle actual validation
}, 5 * 60 * 1000);

export const tokenBlacklist = {
  add(token: string): void {
    blacklist.add(token);
    logger.info('Token added to blacklist');
  },

  has(token: string): boolean {
    return blacklist.has(token);
  },

  remove(token: string): void {
    blacklist.delete(token);
  },

  clear(): void {
    blacklist.clear();
    logger.info('Token blacklist cleared');
  },

  size(): number {
    return blacklist.size;
  },
};

