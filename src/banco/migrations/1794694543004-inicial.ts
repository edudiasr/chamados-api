import { MigrationInterface, QueryRunner } from 'typeorm';

export class Inicial1794694543004 implements MigrationInterface {
  name = 'Inicial1794694543004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sessoes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "usuario_id" uuid NOT NULL, "familia" uuid NOT NULL, "token_hash" character(64) NOT NULL, "expira_em" TIMESTAMP WITH TIME ZONE NOT NULL, "usado_em" TIMESTAMP WITH TIME ZONE, "revogado_em" TIMESTAMP WITH TIME ZONE, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_fc740511f36041034ed56eb6a4f" UNIQUE ("token_hash"), CONSTRAINT "PK_c2a5880f0d471e675eacc8e5714" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_61dbcb4cfdf4aaca8067f36812" ON "sessoes"  ("usuario_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3ff6967a86e88a67200342a451" ON "sessoes"  ("familia") `,
    );
    await queryRunner.query(
      `CREATE TABLE "categorias" ("id" SERIAL NOT NULL, "nome" character varying(60) NOT NULL, "ativa" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_de8a2d8979f7820616e31dc1e15" UNIQUE ("nome"), CONSTRAINT "PK_3886a26251605c571c6b4f861fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."papel" AS ENUM('CLIENTE', 'AGENTE', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "usuarios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nome" character varying(80) NOT NULL, "email" character varying(120) NOT NULL, "senha_hash" text NOT NULL, "papel" "public"."papel" NOT NULL DEFAULT 'CLIENTE', "ativo" boolean NOT NULL DEFAULT true, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."status_chamado" AS ENUM('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO', 'FECHADO', 'CANCELADO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."prioridade" AS ENUM('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "chamados" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "numero" SERIAL NOT NULL, "titulo" character varying(120) NOT NULL, "descricao" text NOT NULL, "status" "public"."status_chamado" NOT NULL DEFAULT 'ABERTO', "prioridade" "public"."prioridade" NOT NULL DEFAULT 'MEDIA', "categoria_id" integer, "solicitante_id" uuid NOT NULL, "responsavel_id" uuid, "prazo_resposta" TIMESTAMP WITH TIME ZONE NOT NULL, "prazo_solucao" TIMESTAMP WITH TIME ZONE NOT NULL, "primeira_resposta_em" TIMESTAMP WITH TIME ZONE, "pausado_em" TIMESTAMP WITH TIME ZONE, "resolvido_em" TIMESTAMP WITH TIME ZONE, "fechado_em" TIMESTAMP WITH TIME ZONE, "avaliacao_nota" smallint, "avaliacao_comentario" text, "versao" integer NOT NULL, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d46b211d785a0f728218dda233f" UNIQUE ("numero"), CONSTRAINT "PK_98c2e59a95547905bd558b634a7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c8bc7176b8d09b1cc52b7fca18" ON "chamados"  ("responsavel_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d1c7c2890afe479369015c3e04" ON "chamados"  ("status", "prazo_solucao") `,
    );
    await queryRunner.query(
      `CREATE TABLE "comentarios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "chamado_id" uuid NOT NULL, "autor_id" uuid NOT NULL, "texto" text NOT NULL, "interno" boolean NOT NULL DEFAULT false, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b60b1468bb275db8d5e875c4a78" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_354d940137710484ac704aeb92" ON "comentarios"  ("chamado_id", "criado_em") `,
    );
    await queryRunner.query(
      `CREATE TABLE "historico_chamados" ("id" SERIAL NOT NULL, "chamado_id" uuid NOT NULL, "autor_id" uuid, "acao" character varying(20) NOT NULL, "de" character varying(120), "para" character varying(120), "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b5231b001f4fefd8d7147091a48" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1b418261f65243b964e3cccf6b" ON "historico_chamados"  ("chamado_id", "criado_em") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notificacoes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "usuario_id" uuid NOT NULL, "chamado_numero" integer NOT NULL, "tipo" character varying(20) NOT NULL, "texto" text NOT NULL, "lida_em" TIMESTAMP WITH TIME ZONE, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1161e00a97df46d9d3c5eed6545" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dcb64ea892a005164174510942" ON "notificacoes"  ("usuario_id", "criado_em") `,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados" ADD CONSTRAINT "FK_e020540fe127dbdd9f452d73ee4" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados" ADD CONSTRAINT "FK_37fcd3bc518a53b8dce80f78044" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados" ADD CONSTRAINT "FK_c8bc7176b8d09b1cc52b7fca18c" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comentarios" ADD CONSTRAINT "FK_debbee96945bdb33d1d2851b2d8" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comentarios" ADD CONSTRAINT "FK_c30e8d64c125cf3a1ece50126a2" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "historico_chamados" ADD CONSTRAINT "FK_8965baf34a6e47bd919221df2d8" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "historico_chamados" DROP CONSTRAINT "FK_8965baf34a6e47bd919221df2d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comentarios" DROP CONSTRAINT "FK_c30e8d64c125cf3a1ece50126a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comentarios" DROP CONSTRAINT "FK_debbee96945bdb33d1d2851b2d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados" DROP CONSTRAINT "FK_c8bc7176b8d09b1cc52b7fca18c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados" DROP CONSTRAINT "FK_37fcd3bc518a53b8dce80f78044"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados" DROP CONSTRAINT "FK_e020540fe127dbdd9f452d73ee4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dcb64ea892a005164174510942"`,
    );
    await queryRunner.query(`DROP TABLE "notificacoes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1b418261f65243b964e3cccf6b"`,
    );
    await queryRunner.query(`DROP TABLE "historico_chamados"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_354d940137710484ac704aeb92"`,
    );
    await queryRunner.query(`DROP TABLE "comentarios"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d1c7c2890afe479369015c3e04"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c8bc7176b8d09b1cc52b7fca18"`,
    );
    await queryRunner.query(`DROP TABLE "chamados"`);
    await queryRunner.query(`DROP TYPE "public"."prioridade"`);
    await queryRunner.query(`DROP TYPE "public"."status_chamado"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TYPE "public"."papel"`);
    await queryRunner.query(`DROP TABLE "categorias"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3ff6967a86e88a67200342a451"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_61dbcb4cfdf4aaca8067f36812"`,
    );
    await queryRunner.query(`DROP TABLE "sessoes"`);
  }
}
