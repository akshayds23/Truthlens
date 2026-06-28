import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/authService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName } = body;
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    const result = await authService.register({ email, password, fullName });
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    logger.error('Register error', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
