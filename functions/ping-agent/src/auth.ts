import { HttpRequest } from '@azure/functions';

/**
 * Validates the API key from the x-api-key header.
 * In production, keys are stored in Key Vault and rotated.
 */
export function validateApiKey(request: HttpRequest): boolean {
  const expectedKey = process.env.AGENT_API_KEY;
  if (!expectedKey) {
    // If no key is configured, skip validation (dev mode)
    return true;
  }

  const providedKey = request.headers.get('x-api-key');
  if (!providedKey) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(expectedKey, providedKey);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
