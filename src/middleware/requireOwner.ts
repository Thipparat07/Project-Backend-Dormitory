import { Request, Response, NextFunction } from "express";
import { getUserContexts } from "../controllers/authController";
import { generateToken } from "../utils/jwtauth";
import { ResponseTemplate } from "../utils/response";
import { RES_MESSAGES } from "../constants/responseMessages";

export const requireOwner = async (req: any, res: Response, next: NextFunction) => {
    try {
        const dormitoryId = req.params.id;
        const user = req.auth;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        const role = user?.contexts?.[dormitoryId];

        // ถ้ารู้จักบทบาท 'owner' แล้ว ให้ผ่านเลย (ประหยัด Performance Database)
        if (role === "owner") {
            return next();
        }

        // กรณี Token เก่า (Stale Token) ลองดึงจาก DB เผื่อว่าผู้ใช้อาจจะเพิ่งได้สิทธิ์มาหมาดๆ
        const freshContexts = await getUserContexts(user.id);

        if (freshContexts[dormitoryId] === "owner") {
            // ออก Token ใหม่ล่าสุดให้ทันที
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

            // อัปเดต Object ปัจจุบันให้ Controller ข้างในได้ใช้ด้วย
            req.auth.contexts = freshContexts;
            return next();
        }

        return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
    } catch (err) {
        console.error("Require Owner Middleware Error:", err);
        return res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};