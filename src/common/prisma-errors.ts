import { Prisma } from '../generated/prisma/client.js';

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** P2002: violação de unique constraint (ex.: e-mail duplicado). */
export const isUniqueViolation = (error: unknown): boolean => hasCode(error, 'P2002');

/** P2025: registro necessário para a operação não existe (update/delete). */
export const isRecordNotFound = (error: unknown): boolean => hasCode(error, 'P2025');
