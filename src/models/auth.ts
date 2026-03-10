export type UserRole = 'owner' | 'tenant';

export interface ContextRoles {
    [dormitoryId: string]: UserRole;
}

export interface JWTPayload {
    id: number;
    contexts: ContextRoles;
}

export interface GoogleTempPayload {
    google_id: string;
    email: string;
    name: string;
    photo?: string;
}
