// Token core — generate / hash / verify 13-char access tokens (ADR-0001).
import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { TOKEN_LENGTH, TOKEN_ALPHABET } from '@citadel/core';

/** Generate a cryptographically-random 13-char uppercase token. */
export function generateToken(): string {
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return out;
}

export function tokenPrefix(token: string): string {
  return token.slice(0, 4);
}

export async function hashToken(token: string): Promise<string> {
  return hash(token, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
  try {
    return await verify(storedHash, token);
  } catch {
    return false;
  }
}
