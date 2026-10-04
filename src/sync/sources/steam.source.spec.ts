import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamCatalogSource } from './steam.source.js';

const portal2 = {
  success: true,
  data: {
    steam_appid: 620,
    name: 'Portal 2',
    short_description: '  Puzzle em primeira pessoa.  ',
    genres: [{ description: 'Action' }, { description: 'Adventure' }],
    developers: ['Valve'],
    release_date: { coming_soon: false, date: '18 Apr, 2011' },
    header_image: 'https://cdn.example.com/portal2.jpg',
  },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('SteamCatalogSource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let appIds: string[];
  let source: SteamCatalogSource;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    appIds = ['620'];
    source = new SteamCatalogSource({ get: () => appIds } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte a resposta da Steam para o formato interno', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ '620': portal2 }));

    const { games, errors } = await source.fetchGames();

    expect(errors).toEqual([]);
    expect(games).toEqual([
      {
        externalId: '620',
        title: 'Portal 2',
        description: 'Puzzle em primeira pessoa.',
        genres: ['Action', 'Adventure'],
        developer: 'Valve',
        releaseDate: new Date('2011-04-18T00:00:00.000Z'),
        coverUrl: 'https://cdn.example.com/portal2.jpg',
      },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toContain('appids=620');
  });

  it('aceita datas no formato "Mês dia, ano"', async () => {
    const data = { ...portal2.data, release_date: { date: 'May 18, 2015' } };
    fetchMock.mockResolvedValue(jsonResponse({ '620': { success: true, data } }));

    const { games } = await source.fetchGames();
    expect(games[0]!.releaseDate).toEqual(new Date('2015-05-18T00:00:00.000Z'));
  });

  it('usa null para jogos ainda não lançados ou com data inválida', async () => {
    appIds = ['1', '2'];
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ '1': { success: true, data: { ...portal2.data, steam_appid: 1, release_date: { coming_soon: true, date: 'Coming soon' } } } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ '2': { success: true, data: { ...portal2.data, steam_appid: 2, release_date: { date: 'To be announced' } } } }),
      );

    const { games } = await source.fetchGames();
    expect(games.map((game) => game.releaseDate)).toEqual([null, null]);
  });

  it('tolera campos opcionais ausentes', async () => {
    const minimal = { success: true, data: { steam_appid: 620, name: 'Portal 2' } };
    fetchMock.mockResolvedValue(jsonResponse({ '620': minimal }));

    const { games } = await source.fetchGames();
    expect(games[0]).toEqual({
      externalId: '620',
      title: 'Portal 2',
      description: null,
      genres: [],
      developer: null,
      releaseDate: null,
      coverUrl: null,
    });
  });

  it('registra erro para appid sem dados, HTTP de erro ou falha de rede, mas continua nos demais', async () => {
    appIds = ['620', '999', '500', '404'];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ '620': portal2 }))
      .mockResolvedValueOnce(jsonResponse({ '999': { success: false } }))
      .mockResolvedValueOnce(new Response('erro', { status: 500 }))
      .mockRejectedValueOnce(new Error('timeout'));

    const { games, errors } = await source.fetchGames();

    expect(games).toHaveLength(1);
    expect(errors).toEqual([
      'appid 999: sem dados disponíveis',
      'appid 500: HTTP 500',
      'appid 404: timeout',
    ]);
  });

  it('não faz requisições quando não há appids configurados', async () => {
    appIds = [];
    expect(await source.fetchGames()).toEqual({ games: [], errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
