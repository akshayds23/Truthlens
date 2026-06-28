import { verifyToken } from './jwt';
import { claimsStore } from './claimsStore';

/**
 * Extract user ID from Authorization header. Falls back to anonymous user.
 */
export async function getUserIdFromHeaders(headers: Headers): Promise<string> {
  const authHeader = headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const decoded = verifyToken(token);
      return decoded.id;
    } catch {
      // Token invalid — fall through to anonymous
    }
  }

  return claimsStore.getAnonymousUser();
}
