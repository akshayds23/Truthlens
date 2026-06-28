import { query, queryOne } from './db';
import { logger } from './logger';
import { randomUUID } from 'crypto';

export interface StoredUser {
  id: string;
  email: string;
  password: string;
  full_name?: string;
  created_at: Date;
  updated_at: Date;
}

export const userStore = {
  async createUser(
    email: string,
    hashedPassword: string,
    fullName?: string
  ): Promise<StoredUser> {
    const id = randomUUID();
    const now = new Date();

    const result = await queryOne(
      `INSERT INTO users (id, email, password, full_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, password, full_name, created_at, updated_at`,
      [id, email, hashedPassword, fullName || null, now, now]
    );

    logger.info('User created', { userId: id, email });
    return result as StoredUser;
  },

  async getUserByEmail(email: string): Promise<StoredUser | null> {
    const result = await queryOne(
      `SELECT id, email, password, full_name, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );
    return result as StoredUser | null;
  },

  async getUserById(id: string): Promise<StoredUser | null> {
    const result = await queryOne(
      `SELECT id, email, password, full_name, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );
    return result as StoredUser | null;
  },

  async emailExists(email: string): Promise<boolean> {
    const result = await queryOne(
      `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as exists`,
      [email]
    );
    return result?.exists || false;
  },
};
