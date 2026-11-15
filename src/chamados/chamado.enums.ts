export enum Status {
  ABERTO = 'ABERTO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  AGUARDANDO_CLIENTE = 'AGUARDANDO_CLIENTE',
  RESOLVIDO = 'RESOLVIDO',
  FECHADO = 'FECHADO',
  CANCELADO = 'CANCELADO',
}

export enum Prioridade {
  BAIXA = 'BAIXA',
  MEDIA = 'MEDIA',
  ALTA = 'ALTA',
  URGENTE = 'URGENTE',
}

/** Status em que o chamado já saiu da fila e o SLA não conta mais. */
export const STATUS_FINAIS = [
  Status.RESOLVIDO,
  Status.FECHADO,
  Status.CANCELADO,
];
