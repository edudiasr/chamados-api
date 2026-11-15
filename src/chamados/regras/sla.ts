import { Prioridade } from '../chamado.enums.js';

/**
 * Prazos contados em horas úteis: seg a sex, das 8h às 18h (horário de Brasília),
 * sem contar os feriados nacionais de data fixa. Os móveis (Carnaval, Sexta-feira
 * Santa, Corpus Christi) ficaram de fora por enquanto.
 */
export const EXPEDIENTE = { inicio: 8, fim: 18 };

// Brasília não tem mais horário de verão desde 2019, então o fuso é sempre -3h
const FUSO_MS = -3 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

const FERIADOS_FIXOS = [
  '01-01',
  '04-21',
  '05-01',
  '09-07',
  '10-12',
  '11-02',
  '11-15',
  '11-20',
  '12-25',
];

export const PRAZOS: Record<Prioridade, { resposta: number; solucao: number }> =
  {
    [Prioridade.URGENTE]: { resposta: 1, solucao: 4 },
    [Prioridade.ALTA]: { resposta: 2, solucao: 8 },
    [Prioridade.MEDIA]: { resposta: 4, solucao: 24 },
    [Prioridade.BAIXA]: { resposta: 8, solucao: 40 },
  };

/** "Relógio de Brasília": um Date cujos campos UTC mostram a hora local. */
function paraLocal(d: Date) {
  return new Date(d.getTime() + FUSO_MS);
}
function deLocal(d: Date) {
  return new Date(d.getTime() - FUSO_MS);
}

function diaUtil(local: Date) {
  const semana = local.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  const mmdd = local.toISOString().slice(5, 10);
  return !FERIADOS_FIXOS.includes(mmdd);
}

function inicioDoExpediente(local: Date) {
  const d = new Date(local);
  d.setUTCHours(EXPEDIENTE.inicio, 0, 0, 0);
  return d;
}

function fimDoExpediente(local: Date) {
  const d = new Date(local);
  d.setUTCHours(EXPEDIENTE.fim, 0, 0, 0);
  return d;
}

/** Leva o horário para o próximo instante dentro do expediente (ou deixa como está). */
function proximoMomentoUtil(local: Date) {
  let d = new Date(local);
  for (;;) {
    if (diaUtil(d)) {
      if (d < inicioDoExpediente(d)) return inicioDoExpediente(d);
      if (d < fimDoExpediente(d)) return d;
    }
    // vai para as 8h do dia seguinte
    d = inicioDoExpediente(new Date(d.getTime() + 24 * HORA_MS));
  }
}

export function somarHorasUteis(inicio: Date, horas: number): Date {
  let atual = proximoMomentoUtil(paraLocal(inicio));
  let restante = horas * HORA_MS;
  while (restante > 0) {
    const sobraHoje = fimDoExpediente(atual).getTime() - atual.getTime();
    if (restante <= sobraHoje) {
      atual = new Date(atual.getTime() + restante);
      restante = 0;
    } else {
      restante -= sobraHoje;
      atual = proximoMomentoUtil(fimDoExpediente(atual));
    }
  }
  return deLocal(atual);
}

/** Quantas horas úteis se passaram entre dois instantes (usado para pausar o SLA). */
export function horasUteisEntre(de: Date, ate: Date): number {
  if (ate <= de) return 0;
  let atual = proximoMomentoUtil(paraLocal(de));
  const fim = paraLocal(ate);
  let total = 0;
  while (atual < fim) {
    const fimHoje = fimDoExpediente(atual);
    const ateQuando = fim < fimHoje ? fim : fimHoje;
    total += ateQuando.getTime() - atual.getTime();
    atual = proximoMomentoUtil(fimHoje);
  }
  return total / HORA_MS;
}

export function calcularPrazos(abertura: Date, prioridade: Prioridade) {
  const p = PRAZOS[prioridade];
  return {
    prazoResposta: somarHorasUteis(abertura, p.resposta),
    prazoSolucao: somarHorasUteis(abertura, p.solucao),
  };
}
