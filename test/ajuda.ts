import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
import { FILA_NOTIFICACOES } from '../src/notificacoes/notificacoes.js';
import { Papel } from '../src/usuarios/papel.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';

export type Contexto = {
  app: INestApplication;
  ds: DataSource;
  http: () => ReturnType<typeof request>;
};

export async function subirApp(): Promise<Contexto> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = modulo.createNestApplication({ logger: ['error'] });
  configurarApp(app);
  await app.init();
  return {
    app,
    ds: app.get(DataSource),
    http: () => request(app.getHttpServer()),
  };
}

export async function derrubarApp(ctx: Contexto) {
  await ctx.app.close();
}

/** Apaga tudo entre um teste e outro (inclusive a fila de notificações). */
export async function limpar(ctx: Contexto) {
  await ctx.ds.query(
    'TRUNCATE notificacoes, historico_chamados, comentarios, chamados, categorias, sessoes, usuarios RESTART IDENTITY CASCADE',
  );
  await ctx.app
    .get<Queue>(getQueueToken(FILA_NOTIFICACOES))
    .obliterate({ force: true });
}

let contador = 0;

/** Cria o usuário direto pelo service e faz login pela API, devolvendo o token pronto. */
export async function criarUsuario(ctx: Contexto, papel: Papel, nome?: string) {
  contador += 1;
  const email = `${papel.toLowerCase()}${contador}@teste.dev`;
  const usuario = await ctx.app.get(UsuariosService).criar({
    nome: nome ?? `${papel} ${contador}`,
    email,
    senha: 'senha-de-teste',
    papel,
  });
  const login = await ctx
    .http()
    .post('/auth/entrar')
    .send({ email, senha: 'senha-de-teste' })
    .expect(200);
  return {
    ...usuario,
    token: login.body.accessToken as string,
    refreshToken: login.body.refreshToken as string,
    auth: `Bearer ${login.body.accessToken}`,
  };
}

export type UsuarioTeste = Awaited<ReturnType<typeof criarUsuario>>;

export async function abrirChamado(
  ctx: Contexto,
  quem: UsuarioTeste,
  extra: Record<string, unknown> = {},
) {
  const r = await ctx
    .http()
    .post('/chamados')
    .set('Authorization', quem.auth)
    .send({
      titulo: 'Impressora não imprime',
      descricao: 'Desde ontem a impressora do financeiro não imprime nada.',
      ...extra,
    })
    .expect(201);
  return r.body;
}

/** A notificação é gravada pelo worker da fila, então espera um pouco por ela. */
export async function esperarAte<T>(
  fn: () => Promise<T | null | undefined | false>,
  ms = 5000,
): Promise<T> {
  const limite = Date.now() + ms;
  for (;;) {
    const r = await fn();
    if (r) return r;
    if (Date.now() > limite) throw new Error('não aconteceu a tempo');
    await new Promise((ok) => setTimeout(ok, 100));
  }
}
