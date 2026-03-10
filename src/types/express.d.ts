import { ContextRoles } from '../models/auth';

declare global {
    namespace Express {
        interface Request {
            auth: {
                id: number;
                contexts: ContextRoles;
            };
        }
    }
}
