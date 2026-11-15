import { Papel, ehEquipe } from '../../usuarios/papel.js';
import { Status } from '../chamado.enums.js';
import { horasUteisEntre, somarHorasUteis } from './sla.js';

/** Depois de resolvido, o cliente tem esse prazo para reabrir. */
export const DIAS_PARA_REABRIR = 7;
/** Resolvido e sem resposta do cliente por esse tempo: o sistema fecha sozinho. */
export const DIAS_PARA_FECHAR_SOZINHO = 5;

const DIA_MS = 24 * 60 * 60 * 1000;

// caminhos que a equipe (agente ou admin) pode seguir
const EQUIPE: Partial<Record<Status, Status[]>> = {
  [Status.ABERTO]: [
    Status.EM_ANDAMENTO,
    Status.AGUARDANDO_CLIENTE,
    Status.RESOLVIDO,
    Status.CANCELADO,
  ],
  [Status.EM_ANDAMENTO]: [
    Status.ABERTO,
    Status.AGUARDANDO_CLIENTE,
    Status.RESOLVIDO,
  ],
  [Status.AGUARDANDO_CLIENTE]: [Status.EM_ANDAMENTO, Status.RESOLVIDO],
  [Status.RESOLVIDO]: [Status.EM_ANDAMENTO, Status.FECHADO],
};

type ChamadoParaTransicao = { status: Status; resolvidoEm: Date | null };

/**
 * Diz se a mudança de status é permitida. Devolve a mensagem de erro, ou null se puder.
 * Quem é dono do chamado é conferido antes, no service.
 */
export function motivoParaRecusar(
  chamado: ChamadoParaTransicao,
  para: Status,
  papel: Papel,
  agora = new Date(),
): string | null {
  const de = chamado.status;
  if (de === para) return 'O chamado já está nesse status.';
  if (de === Status.FECHADO || de === Status.CANCELADO)
    return 'Chamado encerrado não muda mais de status.';

  if (ehEquipe(papel)) {
    return EQUIPE[de]?.includes(para)
      ? null
      : `Não dá para ir de ${de} para ${para}.`;
  }

  // cliente
  if (de === Status.ABERTO && para === Status.CANCELADO) return null;
  if (de === Status.RESOLVIDO && para === Status.FECHADO) return null;
  if (de === Status.RESOLVIDO && para === Status.EM_ANDAMENTO) {
    const limite =
      (chamado.resolvidoEm?.getTime() ?? 0) + DIAS_PARA_REABRIR * DIA_MS;
    return agora.getTime() <= limite
      ? null
      : `Só dá para reabrir até ${DIAS_PARA_REABRIR} dias depois da solução. Abra um chamado novo.`;
  }
  return 'Essa mudança de status é feita pela equipe de suporte.';
}

type ChamadoParaEfeitos = {
  status: Status;
  responsavelId: string | null;
  pausadoEm: Date | null;
  prazoSolucao: Date;
};

export type Efeitos = Partial<{
  status: Status;
  responsavelId: string | null;
  pausadoEm: Date | null;
  prazoSolucao: Date;
  resolvidoEm: Date | null;
  fechadoEm: Date | null;
}>;

/**
 * O que mais muda junto com o status. Função pura para dar para testar sem banco.
 * - esperando o cliente: o prazo de solução fica parado e, na volta, anda o tanto
 *   de horas úteis que ficou parado;
 * - equipe que pega um chamado sem dono vira a responsável;
 * - devolver para a fila (ABERTO) tira o responsável.
 */
export function efeitosDaMudanca(
  chamado: ChamadoParaEfeitos,
  para: Status,
  ator: { id: string; papel: Papel },
  agora = new Date(),
): Efeitos {
  const efeitos: Efeitos = { status: para };

  if (para === Status.AGUARDANDO_CLIENTE) efeitos.pausadoEm = agora;
  if (chamado.status === Status.AGUARDANDO_CLIENTE && chamado.pausadoEm) {
    efeitos.pausadoEm = null;
    efeitos.prazoSolucao = somarHorasUteis(
      chamado.prazoSolucao,
      horasUteisEntre(chamado.pausadoEm, agora),
    );
  }

  if (para === Status.RESOLVIDO) efeitos.resolvidoEm = agora;
  if (chamado.status === Status.RESOLVIDO && para === Status.EM_ANDAMENTO)
    efeitos.resolvidoEm = null;
  if (para === Status.FECHADO || para === Status.CANCELADO)
    efeitos.fechadoEm = agora;

  if (
    para === Status.EM_ANDAMENTO &&
    !chamado.responsavelId &&
    ehEquipe(ator.papel)
  )
    efeitos.responsavelId = ator.id;
  if (para === Status.ABERTO) efeitos.responsavelId = null;

  return efeitos;
}

export function podeFecharSozinho(
  chamado: ChamadoParaTransicao,
  agora = new Date(),
) {
  return (
    chamado.status === Status.RESOLVIDO &&
    chamado.resolvidoEm !== null &&
    agora.getTime() - chamado.resolvidoEm.getTime() >=
      DIAS_PARA_FECHAR_SOZINHO * DIA_MS
  );
}
