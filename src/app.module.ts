import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { AuthModule } from './auth/auth.module.js';
import { opcoesDoBanco } from './banco/data-source.js';
import { CategoriasModule } from './categorias/categorias.js';
import { ChamadosModule } from './chamados/chamados.module.js';
import { type Ambiente, validarAmbiente } from './config.js';
import { NotificacoesModule } from './notificacoes/notificacoes.js';
import { RelatoriosModule } from './relatorios/relatorios.js';
import { SaudeController } from './saude.controller.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';

type Config = ConfigService<Ambiente, true>;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarAmbiente }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: Config) => ({
        ...opcoesDoBanco(config.get('DATABASE_URL', { infer: true })),
        migrationsRun: config.get('RODAR_MIGRATIONS', { infer: true }),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      // em ESM o BullMQ pede o cliente já criado; maxRetriesPerRequest: null é exigência do worker
      useFactory: (config: Config) => ({
        connection: new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: null,
        }),
      }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsuariosModule,
    CategoriasModule,
    ChamadosModule,
    NotificacoesModule,
    RelatoriosModule,
  ],
  controllers: [SaudeController],
})
export class AppModule {}
