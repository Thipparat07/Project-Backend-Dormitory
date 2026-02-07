// auth/googleStrategy.ts
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { generateGoogleTempToken } from "../utils/jwtauth";
import { conn } from "../../db";

export function configureGoogleStrategy() {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID!,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                callbackURL: process.env.GOOGLE_CALLBACK_URL!,
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const google_id = profile.id;
                    const name = profile.displayName;
                    const email = profile.emails?.[0]?.value;
                    const photo = profile.photos?.[0]?.value;

                    if (!email) {
                        return done(null, false, { message: 'email-not-found' });
                    }

                    // 1️⃣ เคยผูก Google แล้ว → login ได้ทันที
                    const [rows] = await conn.execute(
                        'SELECT * FROM users WHERE google_id = ?',
                        [google_id]
                    );

                    if ((rows as any).length > 0) {
                        return done(null, (rows as any)[0]);
                    }

                    // 2️⃣ ยังไม่เคยผูก → เช็ค email
                    const [emailRows] = await conn.execute(
                        'SELECT * FROM users WHERE email = ?',
                        [email]
                    );

                    const tempToken = generateGoogleTempToken({
                        google_id,
                        email,
                        name,
                        photo,
                    });

                    // 2.1 email ซ้ำ → ต้อง confirm การผูก
                    if ((emailRows as any).length > 0) {
                        return done(null, false, {
                            message: 'email-exists',
                            token: tempToken,
                        });
                    }

                    // 2.2 ยังไม่เคยมี account → ต้องเลือก role
                    return done(null, false, {
                        message: 'need-select-role',
                        token: tempToken,
                    });

                } catch (err) {
                    console.error("OAuth Error:", err);
                    return done(err as Error, false);
                }
            }
        )
    );
}
