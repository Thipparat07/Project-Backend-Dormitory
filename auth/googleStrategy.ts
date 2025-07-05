// auth/googleStrategy.ts
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { generateToken, secret } from "../utils/jwtauth";
import { conn } from "../db";

export function configureGoogleStrategy() {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const googleId = profile.id;
            const name = profile.displayName;
            const email = profile.emails?.[0]?.value || null;
            const photo = profile.photos?.[0]?.value || null;

            // 1. ตรวจสอบว่าเคยผูก Google แล้วหรือยัง
            const [rows] = await conn.execute('SELECT * FROM users WHERE google_id = ?', [googleId]);
            if ((rows as any).length > 0) {
                return done(null, (rows as any)[0]); // login สำเร็จ
            }

            // 2. ถ้ายังไม่เคยผูก → ตรวจว่ามี email นี้ในระบบไหม
            const [emailRows] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);

            const payload = { google_id: googleId, name, email, photo };
            const token = generateToken(payload, secret);

            if ((emailRows as any).length > 0) {
                // อีเมลนี้เคยลงทะเบียนแบบธรรมดา → ขอผู้ใช้ยืนยันการผูก
                return done(null, false, { message: 'email-exists', token });
            }

            // 3. ยังไม่เคยลงทะเบียนเลย → ไปหน้า select-role
            return done(null, false, { message: 'need-select-role', token });

        } catch (err) {
            console.error("OAuth Error:", err);
            return done(err as Error, false);
        }
    }));
}
