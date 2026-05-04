import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { AppError } from '../utils/errors';
import { generateToken, verifyToken } from '../utils/jwt';
import { userStore } from '../utils/userStore';
import { tokenBlacklist } from '../utils/tokenBlacklist';

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

export interface MeResponse {
  user: {
    id: string;
    email: string;
    fullName?: string;
    createdAt: Date;
  };
}

export interface RefreshResponse {
  success: true;
  token: string;
}

const PASSWORD_MIN_LENGTH = 6;

export const authService = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    logger.info('Auth register attempt', { email: data.email });

    // Check if user already exists
    const existingUser = await userStore.getUserByEmail(data.email);
    if (existingUser) {
      throw new AppError(409, 'Email already registered');
    }

    // Validate password complexity
    if (data.password.length < PASSWORD_MIN_LENGTH) {
      throw new AppError(
        400,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
      );
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

    // Hash password
    const hashedPassword = await this.hashPassword(data.password);

    // Create user
    const user = await userStore.createUser(
      data.email,
      hashedPassword,
      data.fullName
    );

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
    });

    logger.info('User registered successfully', { userId: user.id });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
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

    const passwordValid = await this.validatePassword(
      credentials.password,
      user.password
    );
    if (!passwordValid) {
      throw new AppError(401, 'Invalid credentials');
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
    });

    logger.info('User logged in successfully', { userId: user.id });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
    };
  },

  async refresh(token: string): Promise<RefreshResponse> {
    logger.info('Token refresh attempt');

    // Check if token is blacklisted (logged out)
    if (tokenBlacklist.has(token)) {
      throw new AppError(401, 'Token is invalid');
    }

    // Verify the current token
    const decoded = verifyToken(token);

    // Get user to ensure they still exist
    const user = await userStore.getUserById(decoded.id);
    if (!user) {
      throw new AppError(401, 'User not found');
    }

    // Generate new token
    const newToken = generateToken({
      id: user.id,
      email: user.email,
    });

    logger.info('Token refreshed successfully', { userId: user.id });

    return {
      success: true,
      token: newToken,
    };
  },

  async getMe(userId: string): Promise<MeResponse> {
    const user = await userStore.getUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        createdAt: user.created_at,
      },
    };
  },

  async logout(token: string): Promise<void> {
    tokenBlacklist.add(token);
    logger.info('User logged out, token added to blacklist');
  },

  async validatePassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password validation error', error);
      return false;
    }
  },

  async hashPassword(password: string): Promise<string> {
    try {
      const salt = await bcrypt.genSalt(10);
      return await bcrypt.hash(password, salt);
    } catch (error) {
      logger.error('Password hashing error', error);
      throw new AppError(500, 'Failed to process password');
    }
  },
};
