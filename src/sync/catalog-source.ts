import type { GameSource } from '../generated/prisma/client.js';

export interface ExternalGame {
  externalId: string;
  title: string;
  description: string | null;
  genres: string[];
  developer: string | null;
  releaseDate: Date | null;
  coverUrl: string | null;
}

export interface FetchResult {
  games: ExternalGame[];
  errors: string[];
}

/** Contrato que cada fonte externa (Steam, Epic, LaunchBox...) precisa implementar. */
export interface CatalogSource {
  readonly source: GameSource;
  fetchGames(): Promise<FetchResult>;
}

export const CATALOG_SOURCES = Symbol('CATALOG_SOURCES');
