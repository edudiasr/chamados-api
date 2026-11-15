import { DataSource } from 'typeorm';
import { gerarHash } from '../auth/senha.js';
import { Categoria } from '../categorias/categoria.entity.js';
import { Prioridade, Status } from '../chamados/chamado.enums.js';
import { Chamado } from '../chamados/entidades/chamado.entity.js';
import { Comentario } from '../chamados/entidades/comentario.entity.js';
import { Historico } from '../chamados/entidades/historico.entity.js';
import {
  calcularPrazos,
  PRAZOS,
  somarHorasUteis,
} from '../chamados/regras/sla.js';
import { Papel } from '../usuarios/papel.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { opcoesDoBanco } from './data-source.js';

// npm run db:seed: APAGA os dados e cria uma base de demonstração (30 dias de chamados)

const SENHA = 'demo1234';

// gerador com semente fixa: toda vez que roda, sai a mesma base
let semente = 42;
const aleatorio = () => {
  semente = (semente * 1103515245 + 12345) % 2 ** 31;
  return semente / 2 ** 31;
};
const sortear = <T>(lista: T[]) =>
  lista[Math.floor(aleatorio() * lista.length)];
const HORA = 60 * 60 * 1000;

const PROBLEMAS: [string, string, string][] = [
  [
    'Acesso e senhas',
    'Não consigo entrar no sistema',
    'Aparece "usuário bloqueado" desde hoje cedo.',
  ],
  [
    'Acesso e senhas',
    'Preciso de acesso à pasta do financeiro',
    'Entrei no setor esta semana e não tenho acesso à pasta compartilhada.',
  ],
  [
    'Impressoras',
    'Impressora do 2º andar não imprime',
    'Os documentos ficam parados na fila de impressão.',
  ],
  [
    'Impressoras',
    'Impressão saindo manchada',
    'Todas as folhas saem com uma faixa preta do lado esquerdo.',
  ],
  [
    'Rede e internet',
    'Internet caindo toda hora',
    'A conexão cai a cada 10 ou 15 minutos no setor comercial.',
  ],
  [
    'Rede e internet',
    'Wi-Fi da sala de reunião não conecta',
    'O notebook vê a rede mas não consegue conectar.',
  ],
  [
    'E-mail',
    'E-mails não estão chegando',
    'Clientes dizem que mandaram e-mail mas não aparece na caixa de entrada.',
  ],
  [
    'E-mail',
    'Caixa de e-mail cheia',
    'Recebi aviso de que a caixa está no limite e não consigo enviar.',
  ],
  [
    'Sistemas internos',
    'Erro ao emitir nota fiscal',
    'O sistema mostra "erro 500" ao clicar em emitir.',
  ],
  [
    'Sistemas internos',
    'Relatório de vendas lento',
    'O relatório mensal demora mais de 5 minutos para abrir.',
  ],
  [
    'Hardware',
    'Computador não liga',
    'Apertei o botão e nada acontece, nem a luz acende.',
  ],
  [
    'Hardware',
    'Monitor piscando',
    'O monitor fica piscando e às vezes apaga sozinho.',
  ],
];

const RESPOSTAS = [
  'Bom dia! Já estou verificando.',
  'Consegue me mandar um print da tela de erro?',
  'Reiniciei o serviço aqui, pode testar de novo?',
  'Vou passar aí na sua mesa depois do almoço.',
];

const SOLUCOES = [
  'Senha redefinida e usuário desbloqueado.',
  'Driver da impressora reinstalado, já está imprimindo.',
  'Trocamos o cabo de rede do switch do setor.',
  'Liberado o acesso no grupo do AD.',
  'Aplicada a correção no sistema, nota emitida normalmente.',
  'Equipamento trocado por um reserva.',
];

const ds = await new DataSource(
  opcoesDoBanco(process.env.DATABASE_URL ?? ''),
).initialize();
await ds.query(
  'TRUNCATE notificacoes, historico_chamados, comentarios, chamados, categorias, sessoes, usuarios RESTART IDENTITY CASCADE',
);

const hash = await gerarHash(SENHA);
const usuarios = await ds.getRepository(Usuario).save(
  [
    ['Marta Lopes', 'admin@chamados.dev', Papel.ADMIN],
    ['Rafael Souza', 'rafael@chamados.dev', Papel.AGENTE],
    ['Júlia Martins', 'julia@chamados.dev', Papel.AGENTE],
    ['Diego Ramos', 'diego@chamados.dev', Papel.AGENTE],
    ['Carlos Pereira', 'cliente@chamados.dev', Papel.CLIENTE],
    ['Fernanda Alves', 'fernanda@empresa.dev', Papel.CLIENTE],
    ['Bruno Costa', 'bruno@empresa.dev', Papel.CLIENTE],
    ['Patrícia Nunes', 'patricia@empresa.dev', Papel.CLIENTE],
    ['Lucas Moreira', 'lucas@empresa.dev', Papel.CLIENTE],
  ].map(([nome, email, papel]) =>
    ds
      .getRepository(Usuario)
      .create({ nome, email, papel: papel as Papel, senhaHash: hash }),
  ),
);
const agentes = usuarios.filter((u) => u.papel === Papel.AGENTE);
const clientes = usuarios.filter((u) => u.papel === Papel.CLIENTE);

const nomesCategorias = [...new Set(PROBLEMAS.map((p) => p[0]))];
const categorias = await ds
  .getRepository(Categoria)
  .save(nomesCategorias.map((nome) => ({ nome })));
const categoriaPorNome = new Map(categorias.map((c) => [c.nome, c]));

const agora = Date.now();
let total = 0;

for (let i = 0; i < 70; i++) {
  // mais chamados recentes do que antigos
  const diasAtras = Math.floor(Math.pow(aleatorio(), 1.4) * 30);
  const abertura = new Date(
    agora - diasAtras * 24 * HORA - Math.floor(aleatorio() * 10) * HORA,
  );
  const [categoria, titulo, descricao] = sortear(PROBLEMAS);
  const prioridade = sortear([
    Prioridade.BAIXA,
    Prioridade.MEDIA,
    Prioridade.MEDIA,
    Prioridade.ALTA,
    Prioridade.URGENTE,
  ]);
  const prazos = calcularPrazos(abertura, prioridade);
  const solicitante = sortear(clientes);

  // chamados antigos quase sempre já foram resolvidos; os de hoje ainda estão na fila
  const sorte = aleatorio();
  let status: Status;
  if (diasAtras > 6)
    status =
      sorte < 0.85
        ? Status.FECHADO
        : sorte < 0.93
          ? Status.RESOLVIDO
          : Status.CANCELADO;
  else if (diasAtras > 1)
    status = sortear([
      Status.EM_ANDAMENTO,
      Status.AGUARDANDO_CLIENTE,
      Status.RESOLVIDO,
      Status.FECHADO,
    ]);
  else status = sortear([Status.ABERTO, Status.ABERTO, Status.EM_ANDAMENTO]);

  const atendido = status !== Status.ABERTO && status !== Status.CANCELADO;
  const responsavel = atendido ? sortear(agentes) : null;
  // uns 80% respondidos dentro do prazo e uns 75% resolvidos dentro do prazo
  const prazo = PRAZOS[prioridade];
  const horasAteResposta =
    aleatorio() < 0.8
      ? prazo.resposta * (0.1 + aleatorio() * 0.8)
      : prazo.resposta + 1 + aleatorio() * 4;
  const horasAteSolucao =
    aleatorio() < 0.75
      ? prazo.solucao * (0.2 + aleatorio() * 0.7)
      : prazo.solucao + 2 + aleatorio() * 10;
  const primeiraResposta = atendido
    ? somarHorasUteis(abertura, horasAteResposta)
    : null;
  const resolvido = [Status.RESOLVIDO, Status.FECHADO].includes(status)
    ? somarHorasUteis(
        abertura,
        Math.max(horasAteSolucao, horasAteResposta + 0.5),
      )
    : null;
  if (resolvido && resolvido.getTime() > agora) continue;

  const chamado = await ds.getRepository(Chamado).save({
    titulo,
    descricao,
    status,
    prioridade,
    categoriaId: categoriaPorNome.get(categoria)!.id,
    solicitanteId: solicitante.id,
    responsavelId: responsavel?.id ?? null,
    ...prazos,
    primeiraRespostaEm:
      primeiraResposta && primeiraResposta.getTime() < agora
        ? primeiraResposta
        : null,
    pausadoEm:
      status === Status.AGUARDANDO_CLIENTE ? new Date(agora - 2 * HORA) : null,
    resolvidoEm: resolvido,
    fechadoEm:
      status === Status.FECHADO && resolvido
        ? new Date(resolvido.getTime() + 24 * HORA)
        : status === Status.CANCELADO
          ? abertura
          : null,
    avaliacaoNota:
      status === Status.FECHADO && aleatorio() < 0.6
        ? sortear([3, 4, 4, 5, 5, 5])
        : null,
    criadoEm: abertura,
  });

  const historico: Partial<Historico>[] = [
    {
      acao: 'ABERTURA',
      para: prioridade,
      autorId: solicitante.id,
      criadoEm: abertura,
    },
  ];
  const comentarios: Partial<Comentario>[] = [];
  if (responsavel && chamado.primeiraRespostaEm) {
    historico.push({
      acao: 'ATRIBUICAO',
      para: responsavel.nome,
      autorId: responsavel.id,
      criadoEm: chamado.primeiraRespostaEm,
    });
    historico.push({
      acao: 'STATUS',
      de: Status.ABERTO,
      para: Status.EM_ANDAMENTO,
      autorId: responsavel.id,
      criadoEm: chamado.primeiraRespostaEm,
    });
    comentarios.push({
      autorId: responsavel.id,
      texto: sortear(RESPOSTAS),
      criadoEm: chamado.primeiraRespostaEm,
    });
  }
  if (resolvido && responsavel) {
    historico.push({
      acao: 'STATUS',
      de: Status.EM_ANDAMENTO,
      para: Status.RESOLVIDO,
      autorId: responsavel.id,
      criadoEm: resolvido,
    });
    comentarios.push({
      autorId: responsavel.id,
      texto: sortear(SOLUCOES),
      criadoEm: resolvido,
    });
  }
  if (status === Status.FECHADO && chamado.fechadoEm) {
    historico.push({
      acao: 'STATUS',
      de: Status.RESOLVIDO,
      para: Status.FECHADO,
      autorId: null,
      criadoEm: chamado.fechadoEm,
    });
  }
  await ds
    .getRepository(Historico)
    .insert(historico.map((h) => ({ ...h, chamadoId: chamado.id })));
  if (comentarios.length)
    await ds
      .getRepository(Comentario)
      .insert(comentarios.map((c) => ({ ...c, chamadoId: chamado.id })));
  total++;
}

await ds.destroy();
console.log(
  `Base de demonstração criada: ${usuarios.length} usuários, ${categorias.length} categorias e ${total} chamados.`,
);
console.log(
  `Logins (senha ${SENHA}): admin@chamados.dev, rafael@chamados.dev (agente), cliente@chamados.dev`,
);
