import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GamesModule } from '../games/games.module.js';
import { CATALOG_SOURCES } from './catalog-source.js';
import { SteamCatalogSource } from './sources/steam.source.js';
import { SyncController } from './sync.controller.js';
import { SyncScheduler } from './sync.scheduler.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [AuthModule, GamesModule],
  controllers: [SyncController],
  providers: [
    SteamCatalogSource,
    // Para adicionar Epic/LaunchBox: crie a classe que implementa CatalogSource e inclua-a aqui.
    {
      provide: CATALOG_SOURCES,
      inject: [SteamCatalogSource],
      useFactory: (steam: SteamCatalogSource) => [steam],
    },
    SyncService,
    SyncScheduler,
  ],
})
export class SyncModule {}
