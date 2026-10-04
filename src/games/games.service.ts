import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { isRecordNotFound } from '../common/prisma-errors.js';
import { paginate, toSkipTake } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import type { Game, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CacheResult } from '../redis/cache.service.js';
import { CacheService } from '../redis/cache.service.js';
import type { CreateGameDto } from './dto/create-game.dto.js';
import type { ListGamesQueryDto } from './dto/list-games-query.dto.js';
import type { UpdateGameDto } from './dto/update-game.dto.js';

const CACHE_NAMESPACE = 'games';
const LIST_TTL_SECONDS = 60;
const ITEM_TTL_SECONDS = 300;

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(query: ListGamesQueryDto): Promise<CacheResult<Paginated<Game>>> {
    const version = await this.cache.getVersion(CACHE_NAMESPACE);
    const key = `games:list:v${version}:${this.hashQuery(query)}`;

    return this.cache.getOrSet(key, LIST_TTL_SECONDS, async () => {
      const where = this.buildWhere(query);
      const [items, total] = await this.prisma.$transaction([
        this.prisma.game.findMany({
          where,
          orderBy: { [query.sortBy]: query.order },
          ...toSkipTake(query),
        }),
        this.prisma.game.count({ where }),
      ]);
      return paginate(items, total, query);
    });
  }

  findOne(id: string): Promise<CacheResult<Game>> {
    return this.cache.getOrSet(this.itemKey(id), ITEM_TTL_SECONDS, async () => {
      const game = await this.prisma.game.findUnique({ where: { id } });
      if (!game) {
        // Lançar aqui impede que um "não encontrado" seja guardado no cache.
        throw new NotFoundException('Jogo não encontrado');
      }
      return game;
    });
  }

  async create(dto: CreateGameDto): Promise<Game> {
    const game = await this.prisma.game.create({
      data: { ...this.toData(dto), source: 'MANUAL' },
    });
    await this.invalidateCache();
    return game;
  }

  async update(id: string, dto: UpdateGameDto): Promise<Game> {
    try {
      const game = await this.prisma.game.update({ where: { id }, data: this.toData(dto) });
      await this.invalidateCache(id);
      return game;
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Jogo não encontrado');
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.game.delete({ where: { id } });
      await this.invalidateCache(id);
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Jogo não encontrado');
      throw error;
    }
  }

  /**
   * Invalida as listagens (incrementando a versão do namespace) e, se informado,
   * o cache individual do jogo. Usado também por reviews e pela sincronização.
   */
  async invalidateCache(gameId?: string): Promise<void> {
    await this.cache.bumpVersion(CACHE_NAMESPACE);
    if (gameId) {
      await this.cache.del(this.itemKey(gameId));
    }
  }

  private itemKey(id: string): string {
    return `games:item:${id}`;
  }

  private hashQuery(query: ListGamesQueryDto): string {
    const normalized = {
      page: query.page,
      limit: query.limit,
      search: query.search?.toLowerCase() ?? null,
      genre: query.genre ?? null,
      sortBy: query.sortBy,
      order: query.order,
    };
    return createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  }

  private buildWhere(query: ListGamesQueryDto): Prisma.GameWhereInput {
    return {
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.genre ? { genres: { has: query.genre } } : {}),
    };
  }

  /** Converte a data recebida como texto ISO em Date, preservando o tipo do DTO (create ou update). */
  private toData<T extends { releaseDate?: string }>(dto: T): Omit<T, 'releaseDate'> & { releaseDate?: Date } {
    const { releaseDate, ...rest } = dto;
    return {
      ...rest,
      ...(releaseDate !== undefined ? { releaseDate: new Date(releaseDate) } : {}),
    };
  }
}
