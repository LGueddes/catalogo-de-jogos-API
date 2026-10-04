import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Role } from '../generated/prisma/client.js';
import type { AuthenticatedRequest, AuthUser } from './auth.types.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

export const ROLES_KEY = 'roles';

/** Exige usuário autenticado e, opcionalmente, um dos papéis informados. Ex.: @Auth(Role.ADMIN) */
export function Auth(...roles: Role[]) {
  return applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(JwtAuthGuard, RolesGuard), ApiBearerAuth());
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user as AuthUser;
});
