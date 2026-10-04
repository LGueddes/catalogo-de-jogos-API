import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GameSource } from '../../generated/prisma/client.js';
import type { CatalogSource, ExternalGame, FetchResult } from '../catalog-source.js';

const STEAM_APPDETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const REQUEST_TIMEOUT_MS = 10_000;

interface SteamAppDetails {
  steam_appid: number;
  name: string;
  short_description?: string;
  genres?: { description: string }[];
  developers?: string[];
  release_date?: { coming_soon?: boolean; date?: string };
  header_image?: string;
}

type SteamResponse = Record<string, { success: boolean; data?: SteamAppDetails }>;

@Injectable()
export class SteamCatalogSource implements CatalogSource {
  readonly source: GameSource = 'STEAM';
  private readonly logger = new Logger(SteamCatalogSource.name);

  constructor(private readonly config: ConfigService) {}

  async fetchGames(): Promise<FetchResult> {
    const appIds = this.config.get<string[]>('STEAM_APP_IDS') ?? [];
    const games: ExternalGame[] = [];
    const errors: string[] = [];

    // Sequencial de propósito: a API pública da Steam aplica rate limit agressivo.
    for (const appId of appIds) {
      try {
        const game = await this.fetchOne(appId);
        if (game) {
          games.push(game);
        } else {
          errors.push(`appid ${appId}: sem dados disponíveis`);
        }
      } catch (error) {
        const message = `appid ${appId}: ${(error as Error).message}`;
        this.logger.warn(message);
        errors.push(message);
      }
    }
    return { games, errors };
  }

  private async fetchOne(appId: string): Promise<ExternalGame | null> {
    const url = `${STEAM_APPDETAILS_URL}?appids=${encodeURIComponent(appId)}&l=english`;
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = (await response.json()) as SteamResponse;
    const entry = body[appId];
    return entry?.success && entry.data ? this.toExternalGame(entry.data) : null;
  }

  private toExternalGame(data: SteamAppDetails): ExternalGame {
    return {
      externalId: String(data.steam_appid),
      title: data.name,
      description: data.short_description?.trim() || null,
      genres: (data.genres ?? []).map((genre) => genre.description),
      developer: data.developers?.[0] ?? null,
      releaseDate: this.parseReleaseDate(data.release_date),
      coverUrl: data.header_image ?? null,
    };
  }

  /** A Steam devolve datas em texto livre ("21 Aug, 2012" ou "May 18, 2015"); datas inválidas viram null. */
  private parseReleaseDate(releaseDate: SteamAppDetails['release_date']): Date | null {
    if (!releaseDate?.date || releaseDate.coming_soon) return null;
    const parsed = new Date(`${releaseDate.date} UTC`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
