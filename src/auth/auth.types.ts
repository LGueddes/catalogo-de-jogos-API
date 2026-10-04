import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
