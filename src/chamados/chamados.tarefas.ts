import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { DIAS_PARA_FECHAR_SOZINHO } from './regras/transicoes.js';

@Injectable()
export class ChamadosTarefas {
  private readonly logger = new Logger('Tarefas');

  constructor(private readonly ds: DataSource) {}

  /**
   * De hora em hora fecha os chamados resolvidos que o cliente não respondeu.
   * Um UPDATE só, com o histórico gravado no mesmo comando. Se tiver mais de uma
   * instância da API rodando, a segunda não acha mais nada para fechar.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async fecharResolvidosAntigos(): Promise<number> {
    const linhas: { chamado_id: string }[] = await this.ds.query(
      `WITH fechados AS (
         UPDATE chamados
            SET status = 'FECHADO', fechado_em = now(), atualizado_em = now(), versao = versao + 1
          WHERE status = 'RESOLVIDO' AND resolvido_em < now() - make_interval(days => $1)
         RETURNING id
       )
       INSERT INTO historico_chamados (chamado_id, autor_id, acao, de, para)
       SELECT id, NULL, 'STATUS', 'RESOLVIDO', 'FECHADO' FROM fechados
       RETURNING chamado_id`,
      [DIAS_PARA_FECHAR_SOZINHO],
    );
    if (linhas.length)
      this.logger.log(`${linhas.length} chamado(s) fechado(s) automaticamente`);
    return linhas.length;
  }
}
