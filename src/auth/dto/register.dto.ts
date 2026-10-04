import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  // O bcrypt só considera os primeiros 72 bytes da senha, por isso o limite.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
