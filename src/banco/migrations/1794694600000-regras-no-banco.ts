import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O que o TypeORM não gera sozinho: chaves estrangeiras de colunas sem relação
 * mapeada e CHECKs que garantem os dados mesmo se alguém mexer direto no banco.
 */
export class RegrasNoBanco1794694600000 implements MigrationInterface {
  name = 'RegrasNoBanco1794694600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "historico_chamados" ADD CONSTRAINT "fk_historico_chamado" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE`,
    );
    await q.query(
      `ALTER TABLE "sessoes" ADD CONSTRAINT "fk_sessao_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE`,
    );
    await q.query(
      `ALTER TABLE "notificacoes" ADD CONSTRAINT "fk_notificacao_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE`,
    );

    await q.query(
      `ALTER TABLE "chamados" ADD CONSTRAINT "ck_avaliacao_nota" CHECK ("avaliacao_nota" BETWEEN 1 AND 5)`,
    );
    await q.query(
      `ALTER TABLE "chamados" ADD CONSTRAINT "ck_prazos" CHECK ("prazo_resposta" <= "prazo_solucao")`,
    );
    // resolvido/fechado sempre com data de solução
    await q.query(
      `ALTER TABLE "chamados" ADD CONSTRAINT "ck_resolvido_tem_data" CHECK ("status" NOT IN ('RESOLVIDO', 'FECHADO') OR "resolvido_em" IS NOT NULL)`,
    );
    await q.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "ck_email_minusculo" CHECK ("email" = lower("email"))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "ck_email_minusculo"`,
    );
    await q.query(
      `ALTER TABLE "chamados" DROP CONSTRAINT "ck_resolvido_tem_data"`,
    );
    await q.query(`ALTER TABLE "chamados" DROP CONSTRAINT "ck_prazos"`);
    await q.query(`ALTER TABLE "chamados" DROP CONSTRAINT "ck_avaliacao_nota"`);
    await q.query(
      `ALTER TABLE "notificacoes" DROP CONSTRAINT "fk_notificacao_usuario"`,
    );
    await q.query(`ALTER TABLE "sessoes" DROP CONSTRAINT "fk_sessao_usuario"`);
    await q.query(
      `ALTER TABLE "historico_chamados" DROP CONSTRAINT "fk_historico_chamado"`,
    );
  }
}
