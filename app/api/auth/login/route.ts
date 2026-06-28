import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/authService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    const result = await authService.login({ email, password });
    return NextResponse.json(result);
  } catch (error: any) {
    logger.error('Login error', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
