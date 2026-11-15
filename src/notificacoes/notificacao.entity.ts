import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type TipoNotificacao =
  'NOVO_COMENTARIO' | 'STATUS' | 'ATRIBUIDO' | 'NOVO_CHAMADO';

@Entity('notificacoes')
@Index(['usuarioId', 'criadoEm'])
export class Notificacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ name: 'chamado_numero', type: 'int' })
  chamadoNumero: number;

  @Column({ type: 'varchar', length: 20 })
  tipo: TipoNotificacao;

  @Column({ type: 'text' })
  texto: string;

  @Column({ name: 'lida_em', type: 'timestamptz', nullable: true })
  lidaEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
