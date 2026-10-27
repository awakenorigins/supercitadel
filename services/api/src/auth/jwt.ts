// JWT — sign & verify access tokens carrying tenant scope (jose, HS256).
import { SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@citadel/core';

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return new TextEncoder().encode(s);
}

export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, ttl = '7d'): Promise<string> {
  return new SignJWT({ orgId: payload.orgId, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret());
  return {
    sub: String(payload.sub),
    orgId: String(payload.orgId),
    role: payload.role as JwtPayload['role'],
    iat: payload.iat,
    exp: payload.exp,
  };
}
