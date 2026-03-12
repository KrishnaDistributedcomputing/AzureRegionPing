import { Request } from 'express';

export function validateApiKey(req: Request): boolean {
  const expected = process.env.AGENT_API_KEY;
  if (!expected) return true; // dev mode
  const provided = req.headers['x-api-key'] as string | undefined;
  if (!provided) return false;
  if (expected.length !== provided.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) result |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return result === 0;
}
