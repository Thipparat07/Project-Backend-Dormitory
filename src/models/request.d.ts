import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  auth?: {
    id: number;
    role: string;
  };
}
