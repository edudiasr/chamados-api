import { QueryFailedError } from 'typeorm';

/** 23505 = violou um UNIQUE no Postgres (ex.: e-mail repetido). */
export function violouUnico(erro: unknown): boolean {
  return (
    erro instanceof QueryFailedError &&
    (erro.driverError as { code?: string })?.code === '23505'
  );
}
