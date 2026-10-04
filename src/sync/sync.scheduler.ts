import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncService } from './sync.service.js';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly sync: SyncService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'catalog-sync' })
  async handleCron(): Promise<void> {
    if (!this.config.get<boolean>('SYNC_ENABLED')) {
      return;
    }

    try {
      await this.sync.run();
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.warn('Sincronização agendada ignorada: já existe uma em andamento');
        return;
      }
      // Um job agendado nunca deve derrubar o processo.
      this.logger.error('Falha na sincronização agendada', (error as Error).stack);
    }
  }
}
