import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate, toSkipTake } from '../common/pagination.js';
import type { Paginated, PaginationQueryDto } from '../common/pagination.js';
import { GamesService } from '../games/games.service.js';
import type { Prisma, Review } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpsertReviewDto } from './dto/upsert-review.dto.js';

export type ReviewWithAuthor = Prisma.ReviewGetPayload<{
  include: { user: { select: { id: true; name: true } } };
}>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
  ) {}

  async list(gameId: string, query: PaginationQueryDto): Promise<Paginated<ReviewWithAuthor>> {
    await this.assertGameExists(gameId);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { gameId },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
        ...toSkipTake(query),
      }),
      this.prisma.review.count({ where: { gameId } }),
    ]);
    return paginate(items, total, query);
  }

  /** Cria ou atualiza a avaliação do usuário para o jogo e recalcula a média do jogo. */
  async upsert(userId: string, gameId: string, dto: UpsertReviewDto): Promise<Review> {
    const review = await this.prisma.$transaction(async (tx) => {
      const game = await tx.game.findUnique({ where: { id: gameId }, select: { id: true } });
      if (!game) {
        throw new NotFoundException('Jogo não encontrado');
      }

      const saved = await tx.review.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId, rating: dto.rating, comment: dto.comment },
        update: { rating: dto.rating, comment: dto.comment },
      });
      await this.recalculateRating(tx, gameId);
      return saved;
    });

    await this.games.invalidateCache(gameId);
    return review;
  }

  async remove(userId: string, gameId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.review.deleteMany({ where: { userId, gameId } });
      if (count === 0) {
        throw new NotFoundException('Avaliação não encontrada');
      }
      await this.recalculateRating(tx, gameId);
    });

    await this.games.invalidateCache(gameId);
  }

  private async assertGameExists(gameId: string): Promise<void> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!game) {
      throw new NotFoundException('Jogo não encontrado');
    }
  }

  /** Mantém ratingAvg/ratingCount no jogo para que listagens não precisem calcular AVG() a cada request. */
  private async recalculateRating(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
    const aggregate = await tx.review.aggregate({
      where: { gameId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.game.update({
      where: { id: gameId },
      data: {
        ratingAvg: Math.round((aggregate._avg.rating ?? 0) * 100) / 100,
        ratingCount: aggregate._count.rating,
      },
    });
  }
}
