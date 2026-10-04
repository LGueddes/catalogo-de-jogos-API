import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  genres?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  developer?: string;

  /** Data no formato ISO 8601 (ex.: 2020-12-10). */
  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  coverUrl?: string;
}
