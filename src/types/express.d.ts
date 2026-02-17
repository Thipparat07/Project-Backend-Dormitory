import { UserRole } from '../models/auth';

declare global {
    namespace Express {
        interface Request {
            auth: {
                id: number;
                role: UserRole;
            };
        }
    }
}
