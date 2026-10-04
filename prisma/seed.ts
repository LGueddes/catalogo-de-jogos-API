import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const games = [
  {
    title: 'Hollow Knight',
    description: 'Metroidvania 2D em um vasto reino de insetos subterrâneo.',
    genres: ['Action', 'Adventure', 'Indie'],
    developer: 'Team Cherry',
    releaseDate: new Date('2017-02-24'),
  },
  {
    title: 'Celeste',
    description: 'Plataforma desafiador sobre escalar uma montanha e enfrentar seus medos.',
    genres: ['Platformer', 'Indie'],
    developer: 'Maddy Makes Games',
    releaseDate: new Date('2018-01-25'),
  },
  {
    title: 'Hades',
    description: 'Roguelike de ação onde você foge do submundo da mitologia grega.',
    genres: ['Action', 'Roguelike', 'Indie'],
    developer: 'Supergiant Games',
    releaseDate: new Date('2020-09-17'),
  },
  {
    title: 'Stardew Valley',
    description: 'Simulador de fazenda com exploração, mineração e vida social.',
    genres: ['Simulation', 'RPG', 'Indie'],
    developer: 'ConcernedApe',
    releaseDate: new Date('2016-02-26'),
  },
  {
    title: 'Disco Elysium',
    description: 'RPG narrativo de detetive com sistema de habilidades baseado em diálogos.',
    genres: ['RPG'],
    developer: 'ZA/UM',
    releaseDate: new Date('2019-10-15'),
  },
];

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@gamecatalog.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

  await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Admin', passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN' },
    update: {},
  });

  for (const game of games) {
    const existing = await prisma.game.findFirst({ where: { source: 'MANUAL', title: game.title } });
    if (!existing) {
      await prisma.game.create({ data: { ...game, source: 'MANUAL' } });
    }
  }

  console.log(`Seed concluído. Admin: ${email} | Jogos de exemplo: ${games.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
