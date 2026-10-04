import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../redis/cache.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up'; redis: 'up' }> {
    const [database, redis] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.cache.ping()]);

    const report = {
      status: database.status === 'fulfilled' && redis.status === 'fulfilled' ? 'ok' : 'error',
      database: database.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
    };
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report as { status: 'ok'; database: 'up'; redis: 'up' };
  }
}
