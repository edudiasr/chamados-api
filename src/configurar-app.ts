import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Configuração comum ao main.ts e aos testes e2e, para os testes rodarem a API igual à de verdade. */
export function configurarApp(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ignora campos que o DTO não declara...
      forbidNonWhitelisted: true, // ...e recusa a requisição se vierem
      transform: true,
    }),
  );
  app.enableCors();
  app.enableShutdownHooks();
}

export function configurarSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Chamados API')
    .setDescription(
      'API de help desk: clientes abrem chamados, a equipe de suporte atende dentro do prazo (SLA em horas úteis) e tudo fica no histórico.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, config),
  );
}
