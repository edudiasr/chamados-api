import { Papel } from '../../usuarios/papel.js';
import { Prioridade, Status } from '../chamado.enums.js';
import { calcularPrazos, horasUteisEntre, somarHorasUteis } from './sla.js';
import {
  efeitosDaMudanca,
  motivoParaRecusar,
  podeFecharSozinho,
} from './transicoes.js';

// os horários abaixo estão em UTC; Brasília é UTC-3 (10h em Brasília = 13h UTC)
const utc = (s: string) => new Date(s + 'Z');

describe('somarHorasUteis', () => {
  it('soma dentro do mesmo dia', () => {
    expect(somarHorasUteis(utc('2026-11-16T13:00:00'), 4)).toEqual(
      utc('2026-11-16T17:00:00'),
    );
  });

  it('o que passa das 18h vai para o dia seguinte', () => {
    // segunda 16h + 4h = 2h na segunda e 2h na terça -> terça 10h
    expect(somarHorasUteis(utc('2026-11-16T19:00:00'), 4)).toEqual(
      utc('2026-11-17T13:00:00'),
    );
  });

  it('pula o fim de semana', () => {
    // sexta 17h + 2h -> segunda 9h
    expect(somarHorasUteis(utc('2026-11-13T20:00:00'), 2)).toEqual(
      utc('2026-11-16T12:00:00'),
    );
  });

  it('chamado aberto no sábado começa a contar na segunda às 8h', () => {
    expect(somarHorasUteis(utc('2026-11-14T13:00:00'), 1)).toEqual(
      utc('2026-11-16T12:00:00'),
    );
  });

  it('pula feriado nacional (20/11/2026 cai numa sexta)', () => {
    // quinta 19/11 17h + 2h -> 1h na quinta, pula sexta feriado e o fim de semana -> segunda 23/11 9h
    expect(somarHorasUteis(utc('2026-11-19T20:00:00'), 2)).toEqual(
      utc('2026-11-23T12:00:00'),
    );
  });

  it('antes das 8h começa a contar às 8h', () => {
    expect(somarHorasUteis(utc('2026-11-17T09:00:00'), 1)).toEqual(
      utc('2026-11-17T12:00:00'),
    );
  });

  it('usa o dia de Brasília e não o de UTC (22h de segunda já é terça em UTC)', () => {
    expect(somarHorasUteis(utc('2026-11-17T01:00:00'), 1)).toEqual(
      utc('2026-11-17T12:00:00'),
    );
  });
});

describe('horasUteisEntre', () => {
  it('conta só o expediente', () => {
    expect(
      horasUteisEntre(utc('2026-11-16T19:00:00'), utc('2026-11-17T13:00:00')),
    ).toBe(4);
    expect(
      horasUteisEntre(utc('2026-11-13T20:00:00'), utc('2026-11-16T12:00:00')),
    ).toBe(2);
  });

  it('intervalo invertido dá zero', () => {
    expect(
      horasUteisEntre(utc('2026-11-17T13:00:00'), utc('2026-11-16T13:00:00')),
    ).toBe(0);
  });
});

it('prazos do urgente: 1h para responder e 4h para resolver', () => {
  const p = calcularPrazos(utc('2026-11-16T13:00:00'), Prioridade.URGENTE);
  expect(p.prazoResposta).toEqual(utc('2026-11-16T14:00:00'));
  expect(p.prazoSolucao).toEqual(utc('2026-11-16T17:00:00'));
});

describe('mudança de status', () => {
  const aberto = { status: Status.ABERTO, resolvidoEm: null };
  const resolvido = (dias: number) => ({
    status: Status.RESOLVIDO,
    resolvidoEm: new Date(Date.now() - dias * 24 * 60 * 60 * 1000),
  });

  it('cliente pode cancelar o próprio chamado aberto, mas não resolver', () => {
    expect(
      motivoParaRecusar(aberto, Status.CANCELADO, Papel.CLIENTE),
    ).toBeNull();
    expect(motivoParaRecusar(aberto, Status.RESOLVIDO, Papel.CLIENTE)).toMatch(
      /equipe/,
    );
  });

  it('cliente reabre até 7 dias depois da solução', () => {
    expect(
      motivoParaRecusar(resolvido(2), Status.EM_ANDAMENTO, Papel.CLIENTE),
    ).toBeNull();
    expect(
      motivoParaRecusar(resolvido(8), Status.EM_ANDAMENTO, Papel.CLIENTE),
    ).toMatch(/7 dias/);
  });

  it('equipe segue o fluxo e não pula etapas', () => {
    expect(
      motivoParaRecusar(aberto, Status.EM_ANDAMENTO, Papel.AGENTE),
    ).toBeNull();
    expect(motivoParaRecusar(aberto, Status.FECHADO, Papel.AGENTE)).toMatch(
      /Não dá/,
    );
  });

  it('fechado e cancelado não mudam mais', () => {
    const fechado = { status: Status.FECHADO, resolvidoEm: new Date() };
    expect(
      motivoParaRecusar(fechado, Status.EM_ANDAMENTO, Papel.ADMIN),
    ).toMatch(/encerrado/);
  });

  it('não aceita "mudar" para o mesmo status', () => {
    expect(motivoParaRecusar(aberto, Status.ABERTO, Papel.AGENTE)).toMatch(
      /já está/,
    );
  });

  it('tempo esperando o cliente não conta no prazo de solução', () => {
    const agente = { id: 'a1', papel: Papel.AGENTE };
    // pausou segunda 10h, cliente respondeu terça 10h: ficou parado 10h úteis
    const efeitos = efeitosDaMudanca(
      {
        status: Status.AGUARDANDO_CLIENTE,
        responsavelId: 'a1',
        pausadoEm: utc('2026-11-16T13:00:00'),
        prazoSolucao: utc('2026-11-16T17:00:00'),
      },
      Status.EM_ANDAMENTO,
      agente,
      utc('2026-11-17T13:00:00'),
    );
    // prazo era segunda 14h; anda 10h úteis -> terça 14h
    expect(efeitos.prazoSolucao).toEqual(utc('2026-11-17T17:00:00'));
    expect(efeitos.pausadoEm).toBeNull();
  });

  it('agente que começa um chamado sem dono vira o responsável; voltar para a fila tira', () => {
    const base = {
      responsavelId: null,
      pausadoEm: null,
      prazoSolucao: new Date(),
    };
    const agente = { id: 'a1', papel: Papel.AGENTE };
    expect(
      efeitosDaMudanca(
        { ...base, status: Status.ABERTO },
        Status.EM_ANDAMENTO,
        agente,
      ).responsavelId,
    ).toBe('a1');
    expect(
      efeitosDaMudanca(
        { ...base, status: Status.EM_ANDAMENTO, responsavelId: 'a1' },
        Status.ABERTO,
        agente,
      ).responsavelId,
    ).toBeNull();
  });

  it('resolvido há 5 dias sem resposta fecha sozinho; há 4, ainda não', () => {
    expect(podeFecharSozinho(resolvido(5))).toBe(true);
    expect(podeFecharSozinho(resolvido(4))).toBe(false);
    expect(podeFecharSozinho(aberto)).toBe(false);
  });
});
