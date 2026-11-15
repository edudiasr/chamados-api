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
import { Chamado } from './chamado.entity.js';

@Entity('comentarios')
@Index(['chamadoId', 'criadoEm'])
export class Comentario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chamado_id', type: 'uuid' })
  chamadoId: string;

  @ManyToOne(() => Chamado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chamado_id' })
  chamado: Relation<Chamado>;

  @Column({ name: 'autor_id', type: 'uuid' })
  autorId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'autor_id' })
  autor: Relation<Usuario>;

  @Column({ type: 'text' })
  texto: string;

  // nota interna: só a equipe vê
  @Column({ type: 'boolean', default: false })
  interno: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
