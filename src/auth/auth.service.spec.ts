import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

describe('AuthService', () => {
  let prisma: { user: Record<'create' | 'findUnique', ReturnType<typeof vi.fn>> };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
  let config: { getOrThrow: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    prisma = { user: { create: vi.fn(), findUnique: vi.fn() } };
    jwt = { signAsync: vi.fn().mockResolvedValue('token-assinado') };
    config = { getOrThrow: vi.fn().mockReturnValue(3600) };
    service = new AuthService(prisma as never, jwt as never, config as never);
  });

  describe('register', () => {
    it('grava o hash da senha (nunca a senha em texto) e devolve o token', async () => {
      prisma.user.create.mockImplementation(({ data }: { data: { email: string; name: string } }) =>
        Promise.resolve({ id: 'u1', email: data.email, name: data.name, role: 'USER' }),
      );

      const result = await service.register({ email: 'a@b.com', name: 'Ana', password: 'senha12345' });

      const stored = prisma.user.create.mock.calls[0]![0].data.passwordHash as string;
      expect(stored).not.toBe('senha12345');
      expect(await bcrypt.compare('senha12345', stored)).toBe(true);
      expect(result).toEqual({
        accessToken: 'token-assinado',
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: { id: 'u1', email: 'a@b.com', name: 'Ana', role: 'USER' },
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com', role: 'USER' });
    });

    it('lança ConflictException quando o e-mail já existe', async () => {
      prisma.user.create.mockRejectedValue(uniqueViolation());
      await expect(service.register({ email: 'a@b.com', name: 'Ana', password: 'senha12345' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('repassa erros inesperados', async () => {
      prisma.user.create.mockRejectedValue(new Error('banco caiu'));
      await expect(service.register({ email: 'a@b.com', name: 'Ana', password: 'senha12345' })).rejects.toThrow(
        'banco caiu',
      );
    });
  });

  describe('login', () => {
    it('devolve o token quando as credenciais estão corretas', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'Ana',
        role: 'ADMIN',
        passwordHash: await bcrypt.hash('senha12345', 4),
      });

      const result = await service.login({ email: 'a@b.com', password: 'senha12345' });

      expect(result.accessToken).toBe('token-assinado');
      expect(result.user.role).toBe('ADMIN');
    });

    it('rejeita senha incorreta', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'Ana',
        role: 'USER',
        passwordHash: await bcrypt.hash('senha12345', 4),
      });

      await expect(service.login({ email: 'a@b.com', password: 'errada123' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rejeita e-mail inexistente com a mesma mensagem da senha incorreta', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const error = await service.login({ email: 'x@y.com', password: 'qualquer123' }).catch((e: Error) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as Error).message).toBe('Credenciais inválidas');
    });
  });

  describe('me', () => {
    it('devolve o perfil público', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'Ana', role: 'USER' });
      expect(await service.me('u1')).toEqual({ id: 'u1', email: 'a@b.com', name: 'Ana', role: 'USER' });
    });

    it('rejeita se o usuário do token não existe mais', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me('u1')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
