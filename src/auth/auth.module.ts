import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Ambiente } from '../config.js';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { Sessao } from './sessao.entity.js';

@Module({
  imports: [
    UsuariosModule,
    TypeOrmModule.forFeature([Sessao]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Ambiente, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { issuer: 'chamados-api' },
        verifyOptions: { issuer: 'chamados-api' },
      }),
    }),
    // 5 tentativas por minuto (ver LimiteLoginGuard)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
