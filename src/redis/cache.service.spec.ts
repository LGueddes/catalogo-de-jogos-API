import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from './cache.service.js';

function createRedisMock() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    eval: vi.fn(),
    ping: vi.fn(),
  };
}

describe('CacheService', () => {
  let redis: ReturnType<typeof createRedisMock>;
  let cache: CacheService;

  beforeEach(() => {
    redis = createRedisMock();
    cache = new CacheService(redis as never);
  });

  describe('getOrSet', () => {
    it('devolve o valor do cache sem chamar o loader (HIT)', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ id: 1 }));
      const loader = vi.fn();

      const result = await cache.getOrSet('k', 60, loader);

      expect(result).toEqual({ value: { id: 1 }, hit: true });
      expect(loader).not.toHaveBeenCalled();
    });

    it('executa o loader e grava com TTL quando não há cache (MISS)', async () => {
      redis.get.mockResolvedValue(null);
      const loader = vi.fn().mockResolvedValue({ id: 2 });

      const result = await cache.getOrSet('k', 60, loader);

      expect(result).toEqual({ value: { id: 2 }, hit: false });
      expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ id: 2 }), 'EX', 60);
    });

    it('continua funcionando quando o Redis falha na leitura e na escrita (fail-open)', async () => {
      redis.get.mockRejectedValue(new Error('redis fora do ar'));
      redis.set.mockRejectedValue(new Error('redis fora do ar'));
      const loader = vi.fn().mockResolvedValue('do-banco');

      const result = await cache.getOrSet('k', 60, loader);

      expect(result).toEqual({ value: 'do-banco', hit: false });
    });

    it('propaga o erro do loader e não grava nada no cache', async () => {
      redis.get.mockResolvedValue(null);
      const loader = vi.fn().mockRejectedValue(new Error('não encontrado'));

      await expect(cache.getOrSet('k', 60, loader)).rejects.toThrow('não encontrado');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('versionamento', () => {
    it('usa "0" quando o namespace ainda não tem versão', async () => {
      redis.get.mockResolvedValue(null);
      expect(await cache.getVersion('games')).toBe('0');
      expect(redis.get).toHaveBeenCalledWith('cache:version:games');
    });

    it('usa "0" se o Redis falhar ao ler a versão', async () => {
      redis.get.mockRejectedValue(new Error('fora do ar'));
      expect(await cache.getVersion('games')).toBe('0');
    });

    it('incrementa a versão ao invalidar', async () => {
      await cache.bumpVersion('games');
      expect(redis.incr).toHaveBeenCalledWith('cache:version:games');
    });

    it('não lança erro se a invalidação falhar', async () => {
      redis.incr.mockRejectedValue(new Error('fora do ar'));
      await expect(cache.bumpVersion('games')).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('remove as chaves informadas', async () => {
      await cache.del('a', 'b');
      expect(redis.del).toHaveBeenCalledWith('a', 'b');
    });

    it('não chama o Redis sem chaves', async () => {
      await cache.del();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('locks', () => {
    it('devolve um token quando adquire o lock', async () => {
      redis.set.mockResolvedValue('OK');
      const token = await cache.acquireLock('lock:x', 30);

      expect(token).toEqual(expect.any(String));
      expect(redis.set).toHaveBeenCalledWith('lock:x', token, 'EX', 30, 'NX');
    });

    it('devolve null quando o lock já está em uso', async () => {
      redis.set.mockResolvedValue(null);
      expect(await cache.acquireLock('lock:x', 30)).toBeNull();
    });

    it('libera o lock apenas com o token de quem o adquiriu', async () => {
      await cache.releaseLock('lock:x', 'meu-token');
      expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('del'), 1, 'lock:x', 'meu-token');
    });
  });
});
