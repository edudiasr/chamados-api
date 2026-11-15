import { Papel } from '../src/usuarios/papel.js';
import {
  type Contexto,
  criarUsuario,
  derrubarApp,
  limpar,
  subirApp,
} from './ajuda.js';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await subirApp();
});
afterAll(() => derrubarApp(ctx));
beforeEach(() => limpar(ctx));

describe('cadastro e login', () => {
  it('cadastro cria um cliente e não aceita o mesmo e-mail de novo (nem com maiúsculas)', async () => {
    const r = await ctx
      .http()
      .post('/auth/cadastro')
      .send({ nome: 'Ana', email: 'ana@teste.dev', senha: '12345678' })
      .expect(201);
    expect(r.body.usuario.papel).toBe(Papel.CLIENTE);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.usuario).not.toHaveProperty('senhaHash');

    const repetido = await ctx
      .http()
      .post('/auth/cadastro')
      .send({ nome: 'Ana 2', email: 'ANA@teste.dev', senha: '12345678' })
      .expect(409);
    expect(repetido.body.message).toMatch(/Já existe/);
  });

  it('senha errada e e-mail que não existe dão a mesma resposta', async () => {
    await criarUsuario(ctx, Papel.CLIENTE);
    const [errada, naoExiste] = await Promise.all([
      ctx
        .http()
        .post('/auth/entrar')
        .send({ email: 'cliente1@teste.dev', senha: 'errada' }),
      ctx
        .http()
        .post('/auth/entrar')
        .send({ email: 'ninguem@teste.dev', senha: 'errada' }),
    ]);
    expect(errada.status).toBe(401);
    expect(naoExiste.status).toBe(401);
    expect(errada.body.message).toBe(naoExiste.body.message);
  });

  it('a 6ª tentativa seguida no mesmo e-mail é bloqueada', async () => {
    const tentativas = [];
    for (let i = 0; i < 6; i++) {
      tentativas.push(
        (
          await ctx
            .http()
            .post('/auth/entrar')
            .send({ email: 'alvo@teste.dev', senha: 'chute' + i })
        ).status,
      );
    }
    expect(tentativas).toEqual([401, 401, 401, 401, 401, 429]);
    // outro e-mail continua livre
    await ctx
      .http()
      .post('/auth/entrar')
      .send({ email: 'outro@teste.dev', senha: 'x' })
      .expect(401);
  });

  it('valida o corpo e recusa campos que não existem no DTO', async () => {
    const r = await ctx
      .http()
      .post('/auth/cadastro')
      .send({ nome: 'A', email: 'não é email', senha: '123', papel: 'ADMIN' })
      .expect(400);
    const msgs = r.body.message.join(' | ');
    expect(msgs).toMatch(/E-mail inválido/);
    expect(msgs).toMatch(/papel should not exist/);
  });
});

describe('tokens', () => {
  it('rota protegida sem token dá 401, com token passa', async () => {
    const u = await criarUsuario(ctx, Papel.AGENTE);
    await ctx.http().get('/auth/eu').expect(401);
    await ctx
      .http()
      .get('/auth/eu')
      .set('Authorization', 'Bearer lixo')
      .expect(401);
    const r = await ctx
      .http()
      .get('/auth/eu')
      .set('Authorization', u.auth)
      .expect(200);
    expect(r.body).toMatchObject({ id: u.id, papel: Papel.AGENTE });
  });

  it('refresh token vale uma vez; se for reusado, a sessão inteira cai', async () => {
    const u = await criarUsuario(ctx, Papel.CLIENTE);
    const primeira = await ctx
      .http()
      .post('/auth/renovar')
      .send({ refreshToken: u.refreshToken })
      .expect(200);
    const novo = primeira.body.refreshToken;
    expect(novo).not.toBe(u.refreshToken);

    // alguém usa o token antigo de novo (ex.: foi copiado)
    await ctx
      .http()
      .post('/auth/renovar')
      .send({ refreshToken: u.refreshToken })
      .expect(401);
    // e o token novo, que era legítimo, também deixa de valer
    await ctx
      .http()
      .post('/auth/renovar')
      .send({ refreshToken: novo })
      .expect(401);
  });

  it('duas renovações ao mesmo tempo com o mesmo token: só uma passa', async () => {
    const u = await criarUsuario(ctx, Papel.CLIENTE);
    const r = await Promise.all(
      [1, 2].map(() =>
        ctx.http().post('/auth/renovar').send({ refreshToken: u.refreshToken }),
      ),
    );
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 401]);
  });

  it('sair encerra a sessão', async () => {
    const u = await criarUsuario(ctx, Papel.CLIENTE);
    await ctx
      .http()
      .post('/auth/sair')
      .send({ refreshToken: u.refreshToken })
      .expect(204);
    await ctx
      .http()
      .post('/auth/renovar')
      .send({ refreshToken: u.refreshToken })
      .expect(401);
  });

  it('trocar a senha derruba as sessões abertas', async () => {
    const u = await criarUsuario(ctx, Papel.CLIENTE);
    await ctx
      .http()
      .patch('/auth/senha')
      .set('Authorization', u.auth)
      .send({ senhaAtual: 'errada', novaSenha: 'nova-senha-123' })
      .expect(400);
    await ctx
      .http()
      .patch('/auth/senha')
      .set('Authorization', u.auth)
      .send({ senhaAtual: 'senha-de-teste', novaSenha: 'nova-senha-123' })
      .expect(204);
    await ctx
      .http()
      .post('/auth/renovar')
      .send({ refreshToken: u.refreshToken })
      .expect(401);
    await ctx
      .http()
      .post('/auth/entrar')
      .send({ email: u.email, senha: 'nova-senha-123' })
      .expect(200);
  });
});

describe('usuários', () => {
  it('usuário desativado perde o acesso na hora, mesmo com o token ainda válido', async () => {
    const admin = await criarUsuario(ctx, Papel.ADMIN);
    const agente = await criarUsuario(ctx, Papel.AGENTE);
    await ctx
      .http()
      .get('/auth/eu')
      .set('Authorization', agente.auth)
      .expect(200);

    await ctx
      .http()
      .patch(`/usuarios/${agente.id}`)
      .set('Authorization', admin.auth)
      .send({ ativo: false })
      .expect(200);
    await ctx
      .http()
      .get('/auth/eu')
      .set('Authorization', agente.auth)
      .expect(401);
  });

  it('só admin mexe em usuários e sempre sobra um admin ativo', async () => {
    const admin = await criarUsuario(ctx, Papel.ADMIN);
    const cliente = await criarUsuario(ctx, Papel.CLIENTE);
    await ctx
      .http()
      .get('/usuarios')
      .set('Authorization', cliente.auth)
      .expect(403);

    const r = await ctx
      .http()
      .patch(`/usuarios/${admin.id}`)
      .set('Authorization', admin.auth)
      .send({ papel: Papel.AGENTE })
      .expect(400);
    expect(r.body.message).toMatch(/próprio acesso/);

    const lista = await ctx
      .http()
      .get('/usuarios?papel=ADMIN')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(lista.body.total).toBe(1);
    expect(lista.body.itens[0]).not.toHaveProperty('senhaHash');
  });
});
