import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PaginationQueryDto } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import type { Review } from '../generated/prisma/client.js';
import { UpsertReviewDto } from './dto/upsert-review.dto.js';
import { ReviewsService } from './reviews.service.js';
import type { ReviewWithAuthor } from './reviews.service.js';

@ApiTags('reviews')
@Controller('games/:gameId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ReviewWithAuthor>> {
    return this.reviews.list(gameId, query);
  }

  /** Cria ou atualiza a avaliação do usuário autenticado (idempotente). */
  @Put()
  @Auth()
  upsert(
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertReviewDto,
  ): Promise<Review> {
    return this.reviews.upsert(user.id, gameId, dto);
  }

  @Delete()
  @Auth()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('gameId', ParseUUIDPipe) gameId: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.reviews.remove(user.id, gameId);
  }
}
