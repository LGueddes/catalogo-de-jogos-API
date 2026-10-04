import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const BCRYPT_ROUNDS = 10;

// Hash válido usado quando o e-mail não existe, para que o tempo de resposta do login
// não revele se uma conta existe ou não (evita enumeração de usuários por timing).
const DUMMY_HASH = '$2b$10$GlkCN2KYTT.juyrBG5cQ9.cf0m/5.LzvzLb9A6f6ETR9JejSULvJO';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
        select: { id: true, email: true, name: true, role: true },
      });
      return this.buildAuthResponse(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('E-mail já cadastrado');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordMatches) {
      // Mesma mensagem para e-mail inexistente e senha errada.
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.buildAuthResponse({ id: user.id, email: user.email, name: user.name, role: user.role });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private async buildAuthResponse(user: PublicUser): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<number>('JWT_EXPIRES_IN_SECONDS'),
      user,
    };
  }
}
