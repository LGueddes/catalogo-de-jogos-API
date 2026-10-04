import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth } from '../auth/auth.decorators.js';
import type { Paginated } from '../common/pagination.js';
import type { Game } from '../generated/prisma/client.js';
import { CreateGameDto } from './dto/create-game.dto.js';
import { ListGamesQueryDto } from './dto/list-games-query.dto.js';
import { UpdateGameDto } from './dto/update-game.dto.js';
import { GamesService } from './games.service.js';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  async list(
    @Query() query: ListGamesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Paginated<Game>> {
    const { value, hit } = await this.games.list(query);
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    return value;
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<Game> {
    const { value, hit } = await this.games.findOne(id);
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    return value;
  }

  @Post()
  @Auth('ADMIN')
  create(@Body() dto: CreateGameDto): Promise<Game> {
    return this.games.create(dto);
  }

  @Patch(':id')
  @Auth('ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGameDto): Promise<Game> {
    return this.games.update(id, dto);
  }

  @Delete(':id')
  @Auth('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.games.remove(id);
  }
}
