import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorators.js';
import { SyncService } from './sync.service.js';
import type { SyncReport } from './sync.service.js';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Dispara a sincronização manualmente (somente ADMIN). */
  @Post()
  @Auth('ADMIN')
  @HttpCode(HttpStatus.OK)
  run(): Promise<SyncReport> {
    return this.sync.run();
  }
}
