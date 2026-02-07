import express from 'express';
import authRoutes from './authRoutes';
import dormitoryRoutes from './dormitoryRoutes';
import bankRoutes from './bankRoutes';

const router = express.Router();

router.use('/auth', authRoutes); // This will handle /auth/register, /auth/login, /auth/google...
router.use('/createdormitory', dormitoryRoutes);
router.use('/banks', bankRoutes);

// Keep the specific original route structure if needed or just export these.
// In app.ts we will mount this or mount individual routers. 
// The user asked for separate routers, so likely importing them into app.ts is better or using this index as a main router.
// Let's export them individually effectively by using this index to group them or just export them.
// But to be clean, let's export the router that mounts everything, OR export individual routers.
// Let's stick to the plan: "Main router that aggregates...".

export { authRoutes, dormitoryRoutes, bankRoutes };
export default router;
