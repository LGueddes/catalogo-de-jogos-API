import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from './cache.service.js';
import { REDIS } from './redis.constants.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
          // Falha rápido em vez de travar a requisição quando o Redis cai (o cache é "fail-open").
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
        });
        // Sem um listener de "error", o ioredis derrubaria o processo em caso de queda.
        client.on('error', (error) => logger.warn(`Erro de conexão: ${error.message}`));
        return client;
      },
    },
    CacheService,
  ],
  exports: [REDIS, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
