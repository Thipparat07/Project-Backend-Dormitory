export type UserRole = 'owner' | 'tenant';

export interface JWTPayload {
    id: number;
    role: UserRole;
}

export interface GoogleTempPayload {
    google_id: string;
    email: string;
    name: string;
    photo?: string;
}
