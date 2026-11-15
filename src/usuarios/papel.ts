export enum Papel {
  CLIENTE = 'CLIENTE',
  AGENTE = 'AGENTE',
  ADMIN = 'ADMIN',
}

export function ehEquipe(papel: Papel) {
  return papel === Papel.AGENTE || papel === Papel.ADMIN;
}
