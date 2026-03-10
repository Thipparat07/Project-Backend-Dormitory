import express from 'express';
import { register, login, googleCallback, googleLinkConfirm, getMe, logout } from '../controllers/authController';
import passport from 'passport';
import { jwtAuthen } from '../utils/jwtauth';

const router = express.Router();

// Local Auth
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', jwtAuthen, getMe);

// Google Auth
router.get("/google",
    passport.authenticate("google", {
        scope: ["profile", "email"],
        session: false
    })
);

router.get("/google/callback", (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, user, info) => {
        if (err) return next(err);

        req.user = user;
        req.authInfo = info;

        return googleCallback(req, res);
    })(req, res, next);
});

router.post('/google/link-confirm', googleLinkConfirm);

export default router;
