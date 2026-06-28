import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { authService } from '@/lib/authService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const result = await authService.getMe(decoded.id);
    return NextResponse.json({ status: 'success', data: result.user });
  } catch (error: any) {
    logger.error('Me endpoint error', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
