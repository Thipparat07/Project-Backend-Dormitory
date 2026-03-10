import { Request, Response, NextFunction } from "express";
import { getUserContexts } from "../controllers/authController";
import { generateToken } from "../utils/jwtauth";
import { ResponseTemplate } from "../utils/response";
import { RES_MESSAGES } from "../constants/responseMessages";

export function requireDormRole(requiredRole: string) {
    return async (req: any, res: Response, next: NextFunction) => {
        try {
            const dormitoryId = req.params.id;
            const user = req.auth;

            if (!user) {
                return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
            }

            const userRole = user?.contexts?.[dormitoryId];

            if (userRole === requiredRole) {
                return next();
            }

            // ถ้า Token เก่า (Stale Token) หรือไม่พบสิทธิ์ ลองเช็ค Database ใหม่
            const freshContexts = await getUserContexts(user.id);
            if (freshContexts[dormitoryId] === requiredRole) {

                // ออก Token ใหม่
                const newToken = generateToken({
                    id: user.id,
                    contexts: freshContexts
                });

                res.cookie("token", newToken, {
                    httpOnly: true,
                    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                    secure: process.env.NODE_ENV === "production",
                    maxAge: 24 * 60 * 60 * 1000 // 1 day
                });

                req.auth.contexts = freshContexts;
                return next();
            }

            return res.status(403).json(ResponseTemplate.error({
                th: `ต้องการสิทธิ์ระดับ ${requiredRole}`,
                en: `${requiredRole} permission required`
            }));
        } catch (err) {
            console.error("Require Dorm Role Error:", err);
            return res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
        }
    };
}