import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from './redis.constants.js';

export interface CacheResult<T> {
  value: T;
  hit: boolean;
}

// Libera o lock somente se ele ainda pertencer a quem o adquiriu (compare-and-delete atômico).
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Cache-aside: devolve o valor do Redis se existir; senão executa o loader e guarda o resultado.
   * Se o Redis estiver indisponível, a aplicação continua funcionando (consulta direto o banco).
   */
  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<CacheResult<T>> {
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        return { value: JSON.parse(cached) as T, hit: true };
      }
    } catch (error) {
      this.logger.warn(`Falha ao ler "${key}": ${(error as Error).message}`);
    }

    const value = await loader();

    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Falha ao gravar "${key}": ${(error as Error).message}`);
    }
    return { value, hit: false };
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(`Falha ao remover chaves: ${(error as Error).message}`);
    }
  }

  /**
   * Versão de um namespace. Incluir a versão na chave permite invalidar TODAS as listagens
   * em uma única operação (INCR), sem precisar varrer chaves com SCAN/KEYS.
   */
  async getVersion(namespace: string): Promise<string> {
    try {
      return (await this.redis.get(`cache:version:${namespace}`)) ?? '0';
    } catch (error) {
      this.logger.warn(`Falha ao ler versão de "${namespace}": ${(error as Error).message}`);
      return '0';
    }
  }

  async bumpVersion(namespace: string): Promise<void> {
    try {
      await this.redis.incr(`cache:version:${namespace}`);
    } catch (error) {
      this.logger.warn(`Falha ao invalidar "${namespace}": ${(error as Error).message}`);
    }
  }

  /** Lock distribuído simples (SET NX EX). Retorna um token se adquiriu, ou null se já está em uso. */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
    } catch (error) {
      this.logger.warn(`Falha ao liberar lock "${key}": ${(error as Error).message}`);
    }
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
