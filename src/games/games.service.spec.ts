import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { GamesService } from './games.service.js';
import { ListGamesQueryDto } from './dto/list-games-query.dto.js';

const notFoundError = () =>
  new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' });

const makeQuery = (overrides: Partial<ListGamesQueryDto> = {}): ListGamesQueryDto =>
  Object.assign(new ListGamesQueryDto(), overrides);

describe('GamesService', () => {
  let prisma: {
    game: Record<'findMany' | 'count' | 'findUnique' | 'create' | 'update' | 'delete', ReturnType<typeof vi.fn>>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  let cache: Record<'getOrSet' | 'getVersion' | 'bumpVersion' | 'del', ReturnType<typeof vi.fn>>;
  let service: GamesService;

  beforeEach(() => {
    prisma = {
      game: {
        findMany: vi.fn().mockResolvedValue([{ id: 'g1', title: 'Hades' }]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    cache = {
      // Simula um MISS: executa o loader de verdade.
      getOrSet: vi.fn(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => ({
        value: await loader(),
        hit: false,
      })),
      getVersion: vi.fn().mockResolvedValue('7'),
      bumpVersion: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
    };
    service = new GamesService(prisma as never, cache as never);
  });

  describe('list', () => {
    it('inclui a versão do cache na chave', async () => {
      await service.list(makeQuery());
      expect(cache.getOrSet.mock.calls[0]![0]).toMatch(/^games:list:v7:[a-f0-9]{40}$/);
    });

    it('gera chaves diferentes para consultas diferentes e iguais para a mesma consulta', async () => {
      await service.list(makeQuery({ page: 1 }));
      await service.list(makeQuery({ page: 2 }));
      await service.list(makeQuery({ page: 1 }));
      const [first, second, third] = cache.getOrSet.mock.calls.map((call) => call[0]);

      expect(first).not.toBe(second);
      expect(first).toBe(third);
    });

    it('ignora diferença de maiúsculas na busca ao montar a chave', async () => {
      await service.list(makeQuery({ search: 'Hades' }));
      await service.list(makeQuery({ search: 'hades' }));
      expect(cache.getOrSet.mock.calls[0]![0]).toBe(cache.getOrSet.mock.calls[1]![0]);
    });

    it('muda a chave quando a versão muda (invalidação)', async () => {
      await service.list(makeQuery());
      cache.getVersion.mockResolvedValue('8');
      await service.list(makeQuery());
      expect(cache.getOrSet.mock.calls[0]![0]).not.toBe(cache.getOrSet.mock.calls[1]![0]);
    });

    it('aplica busca, gênero, ordenação e paginação na query ao banco', async () => {
      await service.list(makeQuery({ search: 'hol', genre: 'Indie', sortBy: 'title', order: 'asc', page: 3, limit: 10 }));

      expect(prisma.game.findMany).toHaveBeenCalledWith({
        where: { title: { contains: 'hol', mode: 'insensitive' }, genres: { has: 'Indie' } },
        orderBy: { title: 'asc' },
        skip: 20,
        take: 10,
      });
      expect(prisma.game.count).toHaveBeenCalledWith({
        where: { title: { contains: 'hol', mode: 'insensitive' }, genres: { has: 'Indie' } },
      });
    });

    it('devolve os dados com os metadados de paginação', async () => {
      prisma.game.count.mockResolvedValue(45);
      const { value } = await service.list(makeQuery({ page: 2, limit: 20 }));

      expect(value.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
      expect(value.data).toHaveLength(1);
    });

    it('repassa o indicador de HIT do cache', async () => {
      cache.getOrSet.mockResolvedValue({ value: { data: [], meta: {} }, hit: true });
      expect((await service.list(makeQuery())).hit).toBe(true);
    });
  });

  describe('findOne', () => {
    it('devolve o jogo encontrado', async () => {
      prisma.game.findUnique.mockResolvedValue({ id: 'g1', title: 'Hades' });
      const { value } = await service.findOne('g1');
      expect(value).toEqual({ id: 'g1', title: 'Hades' });
      expect(cache.getOrSet.mock.calls[0]![0]).toBe('games:item:g1');
    });

    it('lança NotFoundException quando o jogo não existe', async () => {
      prisma.game.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('escrita', () => {
    it('create grava como MANUAL, converte a data e invalida as listagens', async () => {
      prisma.game.create.mockResolvedValue({ id: 'g2' });
      await service.create({ title: 'Outer Wilds', releaseDate: '2019-05-28' });

      expect(prisma.game.create).toHaveBeenCalledWith({
        data: { title: 'Outer Wilds', releaseDate: new Date('2019-05-28'), source: 'MANUAL' },
      });
      expect(cache.bumpVersion).toHaveBeenCalledWith('games');
    });

    it('update invalida as listagens e o cache do próprio jogo', async () => {
      prisma.game.update.mockResolvedValue({ id: 'g1' });
      await service.update('g1', { title: 'Novo título' });

      expect(cache.bumpVersion).toHaveBeenCalledWith('games');
      expect(cache.del).toHaveBeenCalledWith('games:item:g1');
    });

    it('update lança NotFoundException quando o jogo não existe (P2025)', async () => {
      prisma.game.update.mockRejectedValue(notFoundError());
      await expect(service.update('x', { title: 'a' })).rejects.toBeInstanceOf(NotFoundException);
      expect(cache.bumpVersion).not.toHaveBeenCalled();
    });

    it('update repassa erros inesperados', async () => {
      prisma.game.update.mockRejectedValue(new Error('banco caiu'));
      await expect(service.update('x', { title: 'a' })).rejects.toThrow('banco caiu');
    });

    it('remove apaga e invalida o cache', async () => {
      prisma.game.delete.mockResolvedValue({ id: 'g1' });
      await service.remove('g1');

      expect(prisma.game.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
      expect(cache.del).toHaveBeenCalledWith('games:item:g1');
    });

    it('remove lança NotFoundException quando o jogo não existe', async () => {
      prisma.game.delete.mockRejectedValue(notFoundError());
      await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
