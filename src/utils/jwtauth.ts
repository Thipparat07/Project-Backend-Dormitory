import jwt from 'jsonwebtoken';
import { expressjwt } from 'express-jwt';
import { Request, Response, NextFunction } from 'express';

/* ========= JWT CONFIG ========= */
export const JWT_ISSUER = 'DORM_SYSTEM';
export const JWT_AUDIENCE = 'DORM_WEB';
export const JWT_EXPIRES_IN = '1d';
export const GOOGLE_TEMP_AUDIENCE = 'GOOGLE_TEMP';

/* ========= TYPES ========= */
export type UserRole = 'OWNER' | 'TENANT';

export interface JWTPayload {
  id: number;
  role: UserRole;
}

export interface GoogleTempPayload {
  google_id: string;
  email: string;
  name: string;
  photo?: string;
}

/* ========= SECRET ========= */
const JWT_SECRET: string = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in .env file');
}
export { JWT_SECRET };

/* ========= JWT MIDDLEWARE ========= */
export const jwtAuthen = expressjwt({
  secret: JWT_SECRET,
  algorithms: ['HS256'],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
}).unless({
  path: [
    '/',
    '/authlocal/register',
    '/authlocal/login',
    /^\/auth\/google\/.*/,
  ],
});

/* ========= TOKEN HELPERS ========= */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return { valid: true, decoded };
  } catch {
    return { valid: false };
  }
}

/* ========= GOOGLE TEMP TOKEN ========= */
export function generateGoogleTempToken(payload: GoogleTempPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '10m',
    issuer: JWT_ISSUER,
    audience: GOOGLE_TEMP_AUDIENCE,
  });
}

export function verifyGoogleTempToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: GOOGLE_TEMP_AUDIENCE,
    });
    return { valid: true, decoded };
  } catch {
    return { valid: false };
  }
}