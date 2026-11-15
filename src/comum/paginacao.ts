import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class Paginacao {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina: number = 20;
}

export type Pagina<T> = {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
};

export function montarPagina<T>(
  itens: T[],
  total: number,
  { pagina, porPagina }: Paginacao,
): Pagina<T> {
  return {
    itens,
    total,
    pagina,
    porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  };
}
