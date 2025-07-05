import { expressjwt, Request as JWTRequest } from "express-jwt";
import jwt from "jsonwebtoken";

//สร้าง middleware ตรวจสอบ token
export const secret = process.env.JWT_SECRET || 'this-is-top-secret';
export const jwtAuthen = expressjwt({
  secret: secret,
  algorithms: ["HS256"],
}).unless({
  path: [
    '/',
    '/authlocal/register',
    '/authlocal/login',
    '/testtoken',
    '/auth/google',
    '/auth/google/callback',
    '/auth/google/complete-registration',
    '/auth/google/link-confirm',
  ],
});

//ฟังก์ชันสร้าง JWT
export function generateToken(payload: any, secretKey: string): string {
  const token: string = jwt.sign(payload, secretKey, {
    expiresIn: "1d",
    issuer: 'Drom',
  });
  return token;
}

//ฟังก์ชันตรวจสอบ JWT
export function verifyToken(
  token: string,
  secretKey: string
): { valid: boolean; decoded?: any; error?: string } {
  try {
    const decodedPayload: any = jwt.verify(token, secretKey);
    return { valid: true, decoded: decodedPayload };
  } catch (error) {
    return { valid: false, error: JSON.stringify(error) };
  }
}