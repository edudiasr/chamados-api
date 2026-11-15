import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarApp, configurarSwagger } from './configurar-app.js';

const app = await NestFactory.create(AppModule);
configurarApp(app);
configurarSwagger(app);

const porta = Number(process.env.PORT ?? 3000);
await app.listen(porta);
console.log(
  `API em http://localhost:${porta} — documentação em http://localhost:${porta}/docs`,
);
