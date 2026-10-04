import { describe, expect, it } from 'vitest';
import { paginate, PaginationQueryDto, toSkipTake } from './pagination.js';

const query = (page: number, limit: number): PaginationQueryDto => Object.assign(new PaginationQueryDto(), { page, limit });

describe('pagination', () => {
  it('calcula skip e take a partir de página e limite', () => {
    expect(toSkipTake(query(1, 20))).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake(query(3, 10))).toEqual({ skip: 20, take: 10 });
  });

  it('arredonda o total de páginas para cima', () => {
    const result = paginate(['a', 'b'], 21, query(1, 10));
    expect(result.meta).toEqual({ page: 1, limit: 10, total: 21, totalPages: 3 });
    expect(result.data).toEqual(['a', 'b']);
  });

  it('retorna zero páginas quando não há resultados', () => {
    expect(paginate([], 0, query(1, 20)).meta.totalPages).toBe(0);
  });

  it('usa página 1 e limite 20 por padrão', () => {
    const defaults = new PaginationQueryDto();
    expect(defaults.page).toBe(1);
    expect(defaults.limit).toBe(20);
  });
});
