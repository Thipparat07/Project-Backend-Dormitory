import jwt from 'jsonwebtoken';
import { expressjwt } from 'express-jwt';
import { Request } from 'express';
import { UserRole, JWTPayload, GoogleTempPayload } from '../models/auth';
import { Response, NextFunction } from 'express';
export { UserRole, JWTPayload, GoogleTempPayload };

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_ISSUER = process.env.JWT_ISSUER!;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN as any;
const GOOGLE_TEMP_AUDIENCE = process.env.GOOGLE_TEMP_AUDIENCE!;

/* ========= JWT MIDDLEWARE ========= */
export const jwtAuthen = expressjwt({
  secret: JWT_SECRET,
  algorithms: ['HS256'],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  getToken: (req: Request) => req.cookies?.token,
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
    expiresIn: '3m',
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

/* ========= AUTO REFRESH TOKEN ========= */
export function refreshTokenIfNeeded(
  req: any,
  res: Response,
  next: NextFunction
) {
  const user = req.auth;

  if (!user) {
    return next();
  }

  // token เก่าไม่มี contexts
  if (!user.contexts) {

    const newPayload: JWTPayload = {
      id: user.id,
      contexts: {}
    };

    const newToken = generateToken(newPayload);

    res.cookie("token", newToken, {
      httpOnly: true,
      sameSite: "lax"
    });
  }

  next();
}
