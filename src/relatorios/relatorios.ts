import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { DataSource } from 'typeorm';
import { Papeis } from '../comum/decoradores.js';
import { Papel } from '../usuarios/papel.js';

export class PeriodoDto {
  /** AAAA-MM-DD. Padrão: 30 dias atrás. */
  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  /** AAAA-MM-DD, incluso. Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const pct = (parte: number, total: number) =>
  total ? Math.round((parte / total) * 1000) / 10 : null;
const arred = (n: number | null) =>
  n === null ? null : Math.round(Number(n) * 10) / 10;

/** Converte o período (datas de Brasília) em [inicio, fim) para comparar com timestamptz. */
export function intervalo(de?: string, ate?: string, agora = new Date()) {
  const hojeBr = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const fimDia = ate ?? hojeBr;
  const inicioDia =
    de ?? new Date(Date.parse(fimDia) - 29 * DIA_MS).toISOString().slice(0, 10);
  const inicio = new Date(`${inicioDia}T00:00:00-03:00`);
  const fim = new Date(new Date(`${fimDia}T00:00:00-03:00`).getTime() + DIA_MS);
  if (fim <= inicio)
    throw new BadRequestException(
      'A data final precisa ser depois da inicial.',
    );
  if (fim.getTime() - inicio.getTime() > 366 * DIA_MS)
    throw new BadRequestException('Período máximo de 1 ano.');
  return { inicio, fim, de: inicioDia, ate: fimDia };
}

@Injectable()
export class RelatoriosService {
  constructor(private readonly ds: DataSource) {}

  async resumo(periodo: PeriodoDto) {
    const { inicio, fim, de, ate } = intervalo(periodo.de, periodo.ate);
    const p = [inicio, fim];

    const [geral] = await this.ds.query(
      `SELECT
         count(*) FILTER (WHERE criado_em >= $1 AND criado_em < $2)::int                          AS abertos,
         count(*) FILTER (WHERE resolvido_em >= $1 AND resolvido_em < $2)::int                    AS resolvidos,
         count(*) FILTER (WHERE resolvido_em >= $1 AND resolvido_em < $2
                            AND resolvido_em <= prazo_solucao)::int                                AS resolvidos_no_prazo,
         count(*) FILTER (WHERE criado_em >= $1 AND criado_em < $2
                            AND (primeira_resposta_em IS NOT NULL OR prazo_resposta < now()))::int AS com_prazo_resposta,
         count(*) FILTER (WHERE criado_em >= $1 AND criado_em < $2
                            AND primeira_resposta_em <= prazo_resposta)::int                       AS respondidos_no_prazo,
         avg(extract(epoch FROM primeira_resposta_em - criado_em) / 3600)
           FILTER (WHERE criado_em >= $1 AND criado_em < $2)                                       AS horas_ate_resposta,
         avg(avaliacao_nota) FILTER (WHERE resolvido_em >= $1 AND resolvido_em < $2)               AS nota_media,
         count(avaliacao_nota) FILTER (WHERE resolvido_em >= $1 AND resolvido_em < $2)::int       AS avaliacoes,
         count(*) FILTER (WHERE status IN ('ABERTO', 'EM_ANDAMENTO') AND prazo_solucao < now())::int AS atrasados_agora
       FROM chamados`,
      p,
    );

    const fila: { status: string; total: number }[] = await this.ds.query(
      `SELECT status, count(*)::int AS total FROM chamados
        WHERE status NOT IN ('FECHADO', 'CANCELADO')
        GROUP BY status ORDER BY status`,
    );

    const porAgente: {
      id: string;
      nome: string;
      resolvidos: number;
      no_prazo: number;
      nota_media: number | null;
    }[] = await this.ds.query(
      `SELECT u.id, u.nome,
              count(*)::int AS resolvidos,
              count(*) FILTER (WHERE c.resolvido_em <= c.prazo_solucao)::int AS no_prazo,
              avg(c.avaliacao_nota) AS nota_media
         FROM chamados c
         JOIN usuarios u ON u.id = c.responsavel_id
        WHERE c.resolvido_em >= $1 AND c.resolvido_em < $2
        GROUP BY u.id, u.nome
        ORDER BY resolvidos DESC, u.nome`,
      p,
    );

    return {
      periodo: { de, ate },
      abertos: geral.abertos,
      resolvidos: geral.resolvidos,
      atrasadosAgora: geral.atrasados_agora,
      slaSolucaoPct: pct(geral.resolvidos_no_prazo, geral.resolvidos),
      slaRespostaPct: pct(geral.respondidos_no_prazo, geral.com_prazo_resposta),
      horasMediasAtePrimeiraResposta: arred(geral.horas_ate_resposta),
      notaMedia: arred(geral.nota_media),
      avaliacoes: geral.avaliacoes,
      filaPorStatus: Object.fromEntries(fila.map((f) => [f.status, f.total])),
      porAgente: porAgente.map((a) => ({
        id: a.id,
        nome: a.nome,
        resolvidos: a.resolvidos,
        slaSolucaoPct: pct(a.no_prazo, a.resolvidos),
        notaMedia: arred(a.nota_media),
      })),
    };
  }
}

@ApiTags('relatorios')
@ApiBearerAuth()
@Papeis(Papel.AGENTE, Papel.ADMIN)
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly service: RelatoriosService) {}

  /** Números do período: volume, SLA cumprido, tempo de resposta, notas e ranking por agente. */
  @Get('resumo')
  resumo(@Query() periodo: PeriodoDto) {
    return this.service.resumo(periodo);
  }
}

@Module({
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
})
export class RelatoriosModule {}
