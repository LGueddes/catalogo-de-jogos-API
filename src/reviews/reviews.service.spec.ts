import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  let tx: {
    game: Record<'findUnique' | 'update', ReturnType<typeof vi.fn>>;
    review: Record<'upsert' | 'aggregate' | 'deleteMany', ReturnType<typeof vi.fn>>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let games: { invalidateCache: ReturnType<typeof vi.fn> };
  let service: ReviewsService;

  beforeEach(() => {
    tx = {
      game: { findUnique: vi.fn().mockResolvedValue({ id: 'g1' }), update: vi.fn() },
      review: {
        upsert: vi.fn().mockResolvedValue({ id: 'r1', rating: 5 }),
        aggregate: vi.fn().mockResolvedValue({ _avg: { rating: 4 }, _count: { rating: 3 } }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    games = { invalidateCache: vi.fn().mockResolvedValue(undefined) };
    service = new ReviewsService(prisma as never, games as never);
  });

  describe('upsert', () => {
    it('cria ou atualiza a avaliação pela chave única (usuário + jogo)', async () => {
      await service.upsert('u1', 'g1', { rating: 5, comment: 'ótimo' });

      expect(tx.review.upsert).toHaveBeenCalledWith({
        where: { userId_gameId: { userId: 'u1', gameId: 'g1' } },
        create: { userId: 'u1', gameId: 'g1', rating: 5, comment: 'ótimo' },
        update: { rating: 5, comment: 'ótimo' },
      });
    });

    it('recalcula média e quantidade de avaliações do jogo', async () => {
      await service.upsert('u1', 'g1', { rating: 5 });

      expect(tx.game.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { ratingAvg: 4, ratingCount: 3 },
      });
    });

    it('arredonda a média para duas casas decimais', async () => {
      tx.review.aggregate.mockResolvedValue({ _avg: { rating: 4.333333 }, _count: { rating: 3 } });
      await service.upsert('u1', 'g1', { rating: 5 });

      expect(tx.game.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { ratingAvg: 4.33, ratingCount: 3 },
      });
    });

    it('invalida o cache do jogo depois de gravar', async () => {
      await service.upsert('u1', 'g1', { rating: 5 });
      expect(games.invalidateCache).toHaveBeenCalledWith('g1');
    });

    it('lança NotFoundException e não grava nada quando o jogo não existe', async () => {
      tx.game.findUnique.mockResolvedValue(null);

      await expect(service.upsert('u1', 'x', { rating: 5 })).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.review.upsert).not.toHaveBeenCalled();
      expect(games.invalidateCache).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('remove a avaliação, recalcula a média e invalida o cache', async () => {
      await service.remove('u1', 'g1');

      expect(tx.review.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', gameId: 'g1' } });
      expect(tx.game.update).toHaveBeenCalled();
      expect(games.invalidateCache).toHaveBeenCalledWith('g1');
    });

    it('zera a média quando a última avaliação é removida', async () => {
      tx.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } });
      await service.remove('u1', 'g1');

      expect(tx.game.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { ratingAvg: 0, ratingCount: 0 },
      });
    });

    it('lança NotFoundException quando o usuário não avaliou o jogo', async () => {
      tx.review.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove('u1', 'g1')).rejects.toBeInstanceOf(NotFoundException);
      expect(games.invalidateCache).not.toHaveBeenCalled();
    });
  });
});
