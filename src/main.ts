import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GameCatalog API')
    .setDescription('API de catálogo de jogos: autenticação, catálogo com cache, avaliações e sincronização.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
  new Logger('Bootstrap').log(`API rodando em http://localhost:${port} (documentação em /docs)`);
}

void bootstrap();
