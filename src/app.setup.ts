import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Configuração compartilhada entre a aplicação real (main.ts) e os testes e2e. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos que não existem no DTO
      forbidNonWhitelisted: true, // e rejeita a requisição se vierem campos extras
      transform: true, // converte payloads em instâncias dos DTOs (e query strings em números)
    }),
  );
}
