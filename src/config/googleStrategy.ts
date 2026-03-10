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

                    // เคยผูก Google แล้ว → login ได้ทันที
                    const [rows] = await conn.execute(
                        'SELECT id FROM users WHERE google_id = ?',
                        [google_id]
                    );

                    if ((rows as any).length > 0) {
                        return done(null, (rows as any)[0]);
                    }

                    // ยังไม่เคยผูก → เช็ค email
                    const [emailRows] = await conn.execute(
                        'SELECT email FROM users WHERE email = ?',
                        [email]
                    );

                    // email ซ้ำ → ต้อง confirm การผูก
                    if ((emailRows as any).length > 0) {
                        const tempToken = generateGoogleTempToken({
                            google_id,
                            email,
                            name,
                            photo,
                        });

                        return done(null, false, {
                            message: 'email-exists',
                            token: tempToken,
                        });
                    }

                    // ยังไม่เคยมี account และ email ไม่ซ้ำ → สมัครสมาชิกให้ใหม่ทันที (Seamless Log-in)
                    const [insertResult] = await conn.execute(
                        `INSERT INTO users (email, full_name, google_id, profile_picture)
                         VALUES (?, ?, ?, ?)`,
                        [email, name, google_id, photo || null]
                    );

                    const newUser = { id: (insertResult as any).insertId };
                    return done(null, newUser);

                } catch (err) {
                    console.error("OAuth Error:", err);
                    return done(err as Error, false);
                }
            }
        )
    );
}
