import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity.js';

export type AcaoHistorico =
  | 'ABERTURA'
  | 'STATUS'
  | 'PRIORIDADE'
  | 'CATEGORIA'
  | 'ATRIBUICAO'
  | 'EDICAO'
  | 'AVALIACAO';

/** Tudo o que acontece com um chamado fica aqui, com quem fez e quando. */
@Entity('historico_chamados')
@Index(['chamadoId', 'criadoEm'])
export class Historico {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'chamado_id', type: 'uuid' })
  chamadoId: string;

  // null quando foi o próprio sistema (ex.: fechamento automático)
  @Column({ name: 'autor_id', type: 'uuid', nullable: true })
  autorId: string | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'autor_id' })
  autor: Relation<Usuario> | null;

  @Column({ type: 'varchar', length: 20 })
  acao: AcaoHistorico;

  @Column({ type: 'varchar', length: 120, nullable: true })
  de: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  para: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
