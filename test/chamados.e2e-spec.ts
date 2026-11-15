import { ChamadosTarefas } from '../src/chamados/chamados.tarefas.js';
import { Papel } from '../src/usuarios/papel.js';
import {
  abrirChamado,
  type Contexto,
  criarUsuario,
  derrubarApp,
  esperarAte,
  limpar,
  subirApp,
  type UsuarioTeste,
} from './ajuda.js';

let ctx: Contexto;
let admin: UsuarioTeste;
let agente: UsuarioTeste;
let agente2: UsuarioTeste;
let cliente: UsuarioTeste;
let outroCliente: UsuarioTeste;

beforeAll(async () => {
  ctx = await subirApp();
});
afterAll(() => derrubarApp(ctx));
beforeEach(async () => {
  await limpar(ctx);
  admin = await criarUsuario(ctx, Papel.ADMIN, 'Marta Admin');
  agente = await criarUsuario(ctx, Papel.AGENTE, 'Rafael Suporte');
  agente2 = await criarUsuario(ctx, Papel.AGENTE, 'Júlia Suporte');
  cliente = await criarUsuario(ctx, Papel.CLIENTE, 'Carlos Cliente');
  outroCliente = await criarUsuario(ctx, Papel.CLIENTE, 'Paula Cliente');
});

const api = () => ctx.http();

describe('abertura e visibilidade', () => {
  it('abre com prazos calculados e registra no histórico', async () => {
    const c = await abrirChamado(ctx, cliente, { prioridade: 'ALTA' });
    expect(c).toMatchObject({
      numero: 1,
      status: 'ABERTO',
      prioridade: 'ALTA',
      responsavel: null,
      versao: 1,
    });
    expect(new Date(c.prazoResposta) < new Date(c.prazoSolucao)).toBe(true);

    const h = await api()
      .get('/chamados/1/historico')
      .set('Authorization', cliente.auth)
      .expect(200);
    expect(h.body).toEqual([
      expect.objectContaining({
        acao: 'ABERTURA',
        para: 'ALTA',
        autor: { id: cliente.id, nome: 'Carlos Cliente' },
      }),
    ]);
  });

  it('cliente não marca como urgente', async () => {
    const r = await api()
      .post('/chamados')
      .set('Authorization', cliente.auth)
      .send({
        titulo: 'Tudo parado',
        descricao: 'Nada funciona aqui no escritório.',
        prioridade: 'URGENTE',
      });
    expect(r.status).toBe(400);
  });

  it('cliente só enxerga os próprios chamados; o dos outros dá 404', async () => {
    await abrirChamado(ctx, cliente);
    await abrirChamado(ctx, outroCliente);

    const meus = await api()
      .get('/chamados')
      .set('Authorization', cliente.auth)
      .expect(200);
    expect(meus.body.total).toBe(1);
    await api()
      .get('/chamados/2')
      .set('Authorization', cliente.auth)
      .expect(404);

    const equipe = await api()
      .get('/chamados')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(equipe.body.total).toBe(2);
  });
});

describe('atendimento', () => {
  it('dois agentes pegam o mesmo chamado ao mesmo tempo: só um fica com ele', async () => {
    await abrirChamado(ctx, cliente);
    const [a, b] = await Promise.all(
      [agente, agente2].map((ag) =>
        api()
          .post('/chamados/1/responsavel')
          .set('Authorization', ag.auth)
          .send({ responsavelId: ag.id }),
      ),
    );
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);

    const c = await api()
      .get('/chamados/1')
      .set('Authorization', admin.auth)
      .expect(200);
    const vencedor = a.status === 200 ? agente : agente2;
    expect(c.body.responsavel.id).toBe(vencedor.id);
    expect(c.body.status).toBe('EM_ANDAMENTO');
  });

  it('agente só pega para si; admin distribui para qualquer agente', async () => {
    await abrirChamado(ctx, cliente);
    await api()
      .post('/chamados/1/responsavel')
      .set('Authorization', agente.auth)
      .send({ responsavelId: agente2.id })
      .expect(403);
    await api()
      .post('/chamados/1/responsavel')
      .set('Authorization', cliente.auth)
      .send({ responsavelId: cliente.id })
      .expect(403);
    await api()
      .post('/chamados/1/responsavel')
      .set('Authorization', admin.auth)
      .send({ responsavelId: cliente.id })
      .expect(400);

    const r = await api()
      .post('/chamados/1/responsavel')
      .set('Authorization', admin.auth)
      .send({ responsavelId: agente2.id })
      .expect(200);
    expect(r.body.responsavel.nome).toBe('Júlia Suporte');
  });

  it('edição com versão velha dá 409 em vez de sobrescrever a mudança do outro', async () => {
    const c = await abrirChamado(ctx, cliente);
    await api()
      .patch('/chamados/1')
      .set('Authorization', agente.auth)
      .send({ versao: c.versao, prioridade: 'BAIXA' })
      .expect(200);
    const r = await api()
      .patch('/chamados/1')
      .set('Authorization', agente2.auth)
      .send({ versao: c.versao, prioridade: 'ALTA' })
      .expect(409);
    expect(r.body.message).toMatch(/alterado por outra pessoa/);
  });

  it('mudar a prioridade recalcula os prazos; cliente não muda prioridade', async () => {
    const c = await abrirChamado(ctx, cliente, { prioridade: 'BAIXA' });
    await api()
      .patch('/chamados/1')
      .set('Authorization', cliente.auth)
      .send({ versao: c.versao, prioridade: 'ALTA' })
      .expect(403);
    const r = await api()
      .patch('/chamados/1')
      .set('Authorization', agente.auth)
      .send({ versao: c.versao, prioridade: 'URGENTE' })
      .expect(200);
    expect(new Date(r.body.prazoSolucao) < new Date(c.prazoSolucao)).toBe(true);
    expect(r.body.versao).toBe(2);
  });

  it('resposta da equipe marca a primeira resposta; nota interna o cliente não vê', async () => {
    await abrirChamado(ctx, cliente);
    await api()
      .post('/chamados/1/comentarios')
      .set('Authorization', agente.auth)
      .send({ texto: 'Cliente já ligou 3x', interno: true })
      .expect(201);
    let c = await api()
      .get('/chamados/1')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(c.body.primeiraRespostaEm).toBeNull();

    await api()
      .post('/chamados/1/comentarios')
      .set('Authorization', agente.auth)
      .send({ texto: 'Pode reiniciar a impressora?' })
      .expect(201);
    c = await api()
      .get('/chamados/1')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(c.body.primeiraRespostaEm).not.toBeNull();
    expect(c.body.comentarios).toHaveLength(2);

    const visaoCliente = await api()
      .get('/chamados/1')
      .set('Authorization', cliente.auth)
      .expect(200);
    expect(
      visaoCliente.body.comentarios.map((cm: { texto: string }) => cm.texto),
    ).toEqual(['Pode reiniciar a impressora?']);
    await api()
      .post('/chamados/1/comentarios')
      .set('Authorization', cliente.auth)
      .send({ texto: 'oi', interno: true })
      .expect(403);
  });

  it('esperando o cliente: quando ele responde, o chamado volta para a equipe', async () => {
    const c = await abrirChamado(ctx, cliente);
    await api()
      .post('/chamados/1/responsavel')
      .set('Authorization', agente.auth)
      .send({ responsavelId: agente.id })
      .expect(200);
    await api()
      .post('/chamados/1/status')
      .set('Authorization', agente.auth)
      .send({
        status: 'AGUARDANDO_CLIENTE',
        versao: c.versao + 1,
        comentario: 'Qual o modelo?',
      })
      .expect(200);

    await api()
      .post('/chamados/1/comentarios')
      .set('Authorization', cliente.auth)
      .send({ texto: 'É uma HP 107w' })
      .expect(201);
    const depois = await api()
      .get('/chamados/1')
      .set('Authorization', cliente.auth)
      .expect(200);
    expect(depois.body.status).toBe('EM_ANDAMENTO');

    const h = await api()
      .get('/chamados/1/historico')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(
      h.body
        .filter((x: { acao: string }) => x.acao === 'STATUS')
        .map((x: { para: string }) => x.para),
    ).toEqual(['EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'EM_ANDAMENTO']);
  });

  it('resolver exige explicar a solução; cliente não resolve, mas pode reabrir', async () => {
    let c = await abrirChamado(ctx, cliente);
    await api()
      .post('/chamados/1/status')
      .set('Authorization', cliente.auth)
      .send({ status: 'RESOLVIDO', versao: c.versao, comentario: 'resolvi' })
      .expect(400);
    await api()
      .post('/chamados/1/status')
      .set('Authorization', agente.auth)
      .send({ status: 'RESOLVIDO', versao: c.versao })
      .expect(400);

    c = (
      await api()
        .post('/chamados/1/status')
        .set('Authorization', agente.auth)
        .send({
          status: 'RESOLVIDO',
          versao: c.versao,
          comentario: 'Troquei o toner.',
        })
        .expect(200)
    ).body;
    expect(c.resolvidoEm).not.toBeNull();

    const reaberto = await api()
      .post('/chamados/1/status')
      .set('Authorization', cliente.auth)
      .send({
        status: 'EM_ANDAMENTO',
        versao: c.versao,
        comentario: 'Voltou a falhar',
      })
      .expect(200);
    expect(reaberto.body).toMatchObject({
      status: 'EM_ANDAMENTO',
      resolvidoEm: null,
    });
  });

  it('avaliação: só o dono, uma vez, e fecha o chamado', async () => {
    const c = await abrirChamado(ctx, cliente);
    await api()
      .post('/chamados/1/avaliacao')
      .set('Authorization', cliente.auth)
      .send({ nota: 5 })
      .expect(400);
    await api()
      .post('/chamados/1/status')
      .set('Authorization', agente.auth)
      .send({ status: 'RESOLVIDO', versao: c.versao, comentario: 'Feito.' })
      .expect(200);

    await api()
      .post('/chamados/1/avaliacao')
      .set('Authorization', cliente.auth)
      .send({ nota: 7 })
      .expect(400);
    await api()
      .post('/chamados/1/avaliacao')
      .set('Authorization', agente.auth)
      .send({ nota: 1 })
      .expect(403);
    const r = await api()
      .post('/chamados/1/avaliacao')
      .set('Authorization', cliente.auth)
      .send({ nota: 4, comentario: 'Rápido' })
      .expect(200);
    expect(r.body).toMatchObject({
      status: 'FECHADO',
      avaliacao: { nota: 4, comentario: 'Rápido' },
    });
    await api()
      .post('/chamados/1/avaliacao')
      .set('Authorization', cliente.auth)
      .send({ nota: 5 })
      .expect(409);
    await api()
      .post('/chamados/1/comentarios')
      .set('Authorization', cliente.auth)
      .send({ texto: 'mais uma coisa' })
      .expect(400);
  });
});

describe('rotinas e consultas', () => {
  it('fecha sozinho o que está resolvido há mais de 5 dias', async () => {
    for (let i = 0; i < 2; i++) {
      const c = await abrirChamado(ctx, cliente);
      await api()
        .post(`/chamados/${c.numero}/status`)
        .set('Authorization', agente.auth)
        .send({ status: 'RESOLVIDO', versao: c.versao, comentario: 'ok' })
        .expect(200);
    }
    await ctx.ds.query(
      `UPDATE chamados SET resolvido_em = now() - interval '6 days' WHERE numero = 1`,
    );
    await ctx.ds.query(
      `UPDATE chamados SET resolvido_em = now() - interval '2 days' WHERE numero = 2`,
    );

    expect(await ctx.app.get(ChamadosTarefas).fecharResolvidosAntigos()).toBe(
      1,
    );
    const lista = await api()
      .get('/chamados?status=FECHADO')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(lista.body.itens.map((c: { numero: number }) => c.numero)).toEqual([
      1,
    ]);
    const h = await api()
      .get('/chamados/1/historico')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(h.body.at(-1)).toMatchObject({
      acao: 'STATUS',
      para: 'FECHADO',
      autor: null,
    });
  });

  it('filtros: sem responsável, atrasados, busca por número e paginação', async () => {
    for (let i = 0; i < 5; i++)
      await abrirChamado(ctx, cliente, { titulo: `Problema número ${i + 1}` });
    await api()
      .post('/chamados/2/responsavel')
      .set('Authorization', agente.auth)
      .send({ responsavelId: agente.id })
      .expect(200);
    await ctx.ds.query(
      `UPDATE chamados SET prazo_solucao = now() - interval '1 hour', prazo_resposta = now() - interval '2 hours' WHERE numero IN (3, 4)`,
    );

    const semDono = await api()
      .get('/chamados?responsavel=ninguem')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(semDono.body.total).toBe(4);
    const meus = await api()
      .get('/chamados?responsavel=eu')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(meus.body.itens.map((c: { numero: number }) => c.numero)).toEqual([
      2,
    ]);

    const atrasados = await api()
      .get('/chamados?atrasados=true&ordem=prazo')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(
      atrasados.body.itens
        .map((c: { numero: number }) => c.numero)
        .sort((x: number, y: number) => x - y),
    ).toEqual([3, 4]);
    expect(
      atrasados.body.itens.every((c: { atrasado: boolean }) => c.atrasado),
    ).toBe(true);

    const busca = await api()
      .get('/chamados?busca=%235')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(busca.body.itens.map((c: { numero: number }) => c.numero)).toEqual([
      5,
    ]);

    const pagina = await api()
      .get('/chamados?porPagina=2&pagina=3')
      .set('Authorization', agente.auth)
      .expect(200);
    expect(pagina.body).toMatchObject({ total: 5, pagina: 3, totalPaginas: 3 });
    expect(pagina.body.itens).toHaveLength(1);

    await api()
      .get('/chamados?status=QUALQUER')
      .set('Authorization', agente.auth)
      .expect(400);
  });

  it('cliente recebe notificação (pela fila) quando a equipe responde', async () => {
    await abrirChamado(ctx, cliente);
    await api()
      .post('/chamados/1/comentarios')
      .set('Authorization', agente.auth)
      .send({ texto: 'Estou vendo isso.' })
      .expect(201);

    const notificacoes = await esperarAte(async () => {
      const r = await api()
        .get('/notificacoes?naoLidas=true')
        .set('Authorization', cliente.auth)
        .expect(200);
      return r.body.total > 0 && r.body;
    });
    expect(notificacoes.itens[0]).toMatchObject({
      tipo: 'NOVO_COMENTARIO',
      chamadoNumero: 1,
      texto: 'Rafael Suporte comentou no chamado #1.',
    });

    await api()
      .post('/notificacoes/ler-todas')
      .set('Authorization', cliente.auth)
      .expect(204);
    const depois = await api()
      .get('/notificacoes?naoLidas=true')
      .set('Authorization', cliente.auth)
      .expect(200);
    expect(depois.body.total).toBe(0);
  });

  it('relatório mostra SLA cumprido e ranking por agente; cliente não acessa', async () => {
    for (let i = 0; i < 2; i++) {
      const c = await abrirChamado(ctx, cliente);
      await api()
        .post(`/chamados/${c.numero}/responsavel`)
        .set('Authorization', agente.auth)
        .send({ responsavelId: agente.id })
        .expect(200);
      await api()
        .post(`/chamados/${c.numero}/status`)
        .set('Authorization', agente.auth)
        .send({ status: 'RESOLVIDO', versao: c.versao + 1, comentario: 'ok' })
        .expect(200);
    }
    // o segundo foi resolvido depois do prazo
    await ctx.ds.query(
      `UPDATE chamados SET prazo_solucao = resolvido_em - interval '1 hour', prazo_resposta = resolvido_em - interval '2 hours' WHERE numero = 2`,
    );
    await api()
      .post('/chamados/1/avaliacao')
      .set('Authorization', cliente.auth)
      .send({ nota: 5 })
      .expect(200);

    await api()
      .get('/relatorios/resumo')
      .set('Authorization', cliente.auth)
      .expect(403);
    const r = await api()
      .get('/relatorios/resumo')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(r.body).toMatchObject({
      abertos: 2,
      resolvidos: 2,
      slaSolucaoPct: 50,
      notaMedia: 5,
      avaliacoes: 1,
    });
    expect(r.body.porAgente).toEqual([
      {
        id: agente.id,
        nome: 'Rafael Suporte',
        resolvidos: 2,
        slaSolucaoPct: 50,
        notaMedia: 5,
      },
    ]);

    await api()
      .get('/relatorios/resumo?de=2026-02-10&ate=2026-01-01')
      .set('Authorization', admin.auth)
      .expect(400);
  });

  it('o banco recusa nota fora de 1 a 5 mesmo se alguém tentar direto', async () => {
    await abrirChamado(ctx, cliente);
    await expect(
      ctx.ds.query(`UPDATE chamados SET avaliacao_nota = 7 WHERE numero = 1`),
    ).rejects.toThrow(/ck_avaliacao_nota/);
  });
});
