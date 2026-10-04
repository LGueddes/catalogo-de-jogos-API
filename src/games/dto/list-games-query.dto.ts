import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export const GAME_SORT_FIELDS = ['title', 'ratingAvg', 'releaseDate', 'createdAt'] as const;
export type GameSortField = (typeof GAME_SORT_FIELDS)[number];

export class ListGamesQueryDto extends PaginationQueryDto {
  /** Busca parcial no título (sem diferenciar maiúsculas/minúsculas). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Filtra por gênero exato (ex.: "Action"). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  genre?: string;

  @IsOptional()
  @IsIn(GAME_SORT_FIELDS)
  sortBy: GameSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
