import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { GamesService } from '../games/games.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../redis/cache.service.js';
import { CATALOG_SOURCES } from './catalog-source.js';
import type { CatalogSource } from './catalog-source.js';

const LOCK_KEY = 'lock:catalog-sync';
const LOCK_TTL_SECONDS = 300;

export interface SourceReport {
  source: string;
  fetched: number;
  created: number;
  updated: number;
  errors: string[];
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sources: SourceReport[];
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly games: GamesService,
    @Inject(CATALOG_SOURCES) private readonly sources: CatalogSource[],
  ) {}

  /**
   * Sincroniza o catálogo com todas as fontes configuradas.
   * Um lock no Redis impede execuções concorrentes (ex.: cron + chamada manual, ou várias instâncias).
   */
  async run(): Promise<SyncReport> {
    const token = await this.cache.acquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
    if (!token) {
      throw new ConflictException('Já existe uma sincronização em andamento');
    }

    const started = new Date();
    try {
      const reports: SourceReport[] = [];
      for (const source of this.sources) {
        reports.push(await this.syncSource(source));
      }

      if (reports.some((report) => report.created + report.updated > 0)) {
        await this.games.invalidateCache();
      }

      const finished = new Date();
      this.logger.log(`Sincronização concluída em ${finished.getTime() - started.getTime()}ms`);
      return {
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        sources: reports,
      };
    } finally {
      await this.cache.releaseLock(LOCK_KEY, token);
    }
  }

  private async syncSource(source: CatalogSource): Promise<SourceReport> {
    const { games, errors } = await source.fetchGames();
    if (games.length === 0) {
      return { source: source.source, fetched: 0, created: 0, updated: 0, errors };
    }

    const existing = await this.prisma.game.findMany({
      where: { source: source.source, externalId: { in: games.map((game) => game.externalId) } },
      select: { externalId: true },
    });
    const existingIds = new Set(existing.map((game) => game.externalId));

    // Upsert pela chave única (source, externalId): rodar a sincronização várias vezes não duplica registros.
    await this.prisma.$transaction(
      games.map((game) => {
        const { externalId, ...fields } = game;
        return this.prisma.game.upsert({
          where: { source_externalId: { source: source.source, externalId } },
          create: { source: source.source, externalId, ...fields },
          update: fields,
        });
      }),
    );

    const created = games.filter((game) => !existingIds.has(game.externalId)).length;
    return {
      source: source.source,
      fetched: games.length,
      created,
      updated: games.length - created,
      errors,
    };
  }
}
