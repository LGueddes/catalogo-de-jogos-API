import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalGame } from './catalog-source.js';
import { SyncService } from './sync.service.js';

const externalGame = (externalId: string, title: string): ExternalGame => ({
  externalId,
  title,
  description: null,
  genres: ['Action'],
  developer: 'Dev',
  releaseDate: null,
  coverUrl: null,
});

describe('SyncService', () => {
  let prisma: {
    game: Record<'findMany' | 'upsert', ReturnType<typeof vi.fn>>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  let cache: Record<'acquireLock' | 'releaseLock', ReturnType<typeof vi.fn>>;
  let games: { invalidateCache: ReturnType<typeof vi.fn> };
  let source: { source: string; fetchGames: ReturnType<typeof vi.fn> };
  let service: SyncService;

  beforeEach(() => {
    prisma = {
      game: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn((args: unknown) => Promise.resolve(args)) },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    cache = {
      acquireLock: vi.fn().mockResolvedValue('token'),
      releaseLock: vi.fn().mockResolvedValue(undefined),
    };
    games = { invalidateCache: vi.fn().mockResolvedValue(undefined) };
    source = {
      source: 'STEAM',
      fetchGames: vi.fn().mockResolvedValue({
        games: [externalGame('620', 'Portal 2'), externalGame('105600', 'Terraria')],
        errors: [],
      }),
    };
    service = new SyncService(prisma as never, cache as never, games as never, [source] as never);
  });

  it('cria jogos novos e informa o relatório por fonte', async () => {
    const report = await service.run();

    expect(report.sources).toEqual([{ source: 'STEAM', fetched: 2, created: 2, updated: 0, errors: [] }]);
    expect(prisma.game.upsert).toHaveBeenCalledTimes(2);
  });

  it('é idempotente: jogos que já existem são atualizados, não duplicados', async () => {
    prisma.game.findMany.mockResolvedValue([{ externalId: '620' }]);

    const report = await service.run();

    expect(report.sources[0]).toMatchObject({ created: 1, updated: 1 });
  });

  it('faz upsert pela chave única (fonte + id externo)', async () => {
    await service.run();

    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source_externalId: { source: 'STEAM', externalId: '620' } },
        create: expect.objectContaining({ source: 'STEAM', externalId: '620', title: 'Portal 2' }),
      }),
    );
  });

  it('invalida o cache quando houve criação ou atualização', async () => {
    await service.run();
    expect(games.invalidateCache).toHaveBeenCalledTimes(1);
  });

  it('não invalida o cache nem grava nada quando a fonte não retorna jogos', async () => {
    source.fetchGames.mockResolvedValue({ games: [], errors: ['appid 1: HTTP 500'] });

    const report = await service.run();

    expect(report.sources[0]).toMatchObject({ fetched: 0, errors: ['appid 1: HTTP 500'] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(games.invalidateCache).not.toHaveBeenCalled();
  });

  it('lança ConflictException sem buscar nada quando já há uma sincronização em andamento', async () => {
    cache.acquireLock.mockResolvedValue(null);

    await expect(service.run()).rejects.toBeInstanceOf(ConflictException);
    expect(source.fetchGames).not.toHaveBeenCalled();
    expect(cache.releaseLock).not.toHaveBeenCalled();
  });

  it('libera o lock ao terminar, inclusive quando a sincronização falha', async () => {
    await service.run();
    expect(cache.releaseLock).toHaveBeenCalledWith('lock:catalog-sync', 'token');

    cache.releaseLock.mockClear();
    source.fetchGames.mockRejectedValue(new Error('falha inesperada'));

    await expect(service.run()).rejects.toThrow('falha inesperada');
    expect(cache.releaseLock).toHaveBeenCalledWith('lock:catalog-sync', 'token');
  });
});
