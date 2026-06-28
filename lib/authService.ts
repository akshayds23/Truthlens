import { logger } from './logger';
import bcrypt from 'bcryptjs';
import { AppError } from './errors';
import { generateToken, verifyToken } from './jwt';
import { userStore } from './userStore';

const tokenBlacklist = new Set<string>();

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
}

export interface AuthResponse {
  success: true;
  token: string;
  user: {
    id: string;
    email: string;
    fullName?: string;
  };
}

const PASSWORD_MIN_LENGTH = 6;

export const authService = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    logger.info('Auth register attempt', { email: data.email });

    const existingUser = await userStore.getUserByEmail(data.email);
    if (existingUser) {
      throw new AppError(409, 'Email already registered');
    }

    if (data.password.length < PASSWORD_MIN_LENGTH) {
      throw new AppError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (!/[A-Z]/.test(data.password)) {
      throw new AppError(400, 'Password must contain an uppercase letter');
    }
    if (!/[a-z]/.test(data.password)) {
      throw new AppError(400, 'Password must contain a lowercase letter');
    }
    if (!/\d/.test(data.password)) {
      throw new AppError(400, 'Password must contain a number');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const user = await userStore.createUser(data.email, hashedPassword, data.fullName);

    const token = generateToken({ id: user.id, email: user.email });

    logger.info('User registered successfully', { userId: user.id });

    return {
      success: true,
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    };
  },

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    logger.info('Auth login attempt', { email: credentials.email });

    if (!credentials.email || !credentials.password) {
      throw new AppError(401, 'Invalid credentials');
    }

    const user = await userStore.getUserByEmail(credentials.email);
    if (!user) {
      throw new AppError(401, 'Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(credentials.password, user.password);
    if (!passwordValid) {
      throw new AppError(401, 'Invalid credentials');
    }

    const token = generateToken({ id: user.id, email: user.email });

    logger.info('User logged in successfully', { userId: user.id });

    return {
      success: true,
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    };
  },

  async logout(token: string): Promise<void> {
    tokenBlacklist.add(token);
    logger.info('User logged out, token added to blacklist');
  },

  async getMe(userId: string) {
    const user = await userStore.getUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return {
      user: { id: user.id, email: user.email, fullName: user.full_name, createdAt: user.created_at },
    };
  },
};
