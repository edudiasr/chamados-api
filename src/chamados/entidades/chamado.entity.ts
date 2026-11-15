import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Categoria } from '../../categorias/categoria.entity.js';
import { Usuario } from '../../usuarios/usuario.entity.js';
import { Prioridade, Status } from '../chamado.enums.js';

@Entity('chamados')
@Index(['status', 'prazoSolucao'])
export class Chamado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // número curto que aparece para o usuário (#1042), separado do id
  @Column({ type: 'int', unique: true })
  @Generated('increment')
  numero: number;

  @Column({ type: 'varchar', length: 120 })
  titulo: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({
    type: 'enum',
    enum: Status,
    enumName: 'status_chamado',
    default: Status.ABERTO,
  })
  status: Status;

  @Column({
    type: 'enum',
    enum: Prioridade,
    enumName: 'prioridade',
    default: Prioridade.MEDIA,
  })
  prioridade: Prioridade;

  @Column({ name: 'categoria_id', type: 'int', nullable: true })
  categoriaId: number | null;

  @ManyToOne(() => Categoria, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoria_id' })
  categoria: Relation<Categoria> | null;

  @Column({ name: 'solicitante_id', type: 'uuid' })
  solicitanteId: string;

  @ManyToOne(() => Usuario, { nullable: false })
  @JoinColumn({ name: 'solicitante_id' })
  solicitante: Relation<Usuario>;

  @Index()
  @Column({ name: 'responsavel_id', type: 'uuid', nullable: true })
  responsavelId: string | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'responsavel_id' })
  responsavel: Relation<Usuario> | null;

  @Column({ name: 'prazo_resposta', type: 'timestamptz' })
  prazoResposta: Date;

  @Column({ name: 'prazo_solucao', type: 'timestamptz' })
  prazoSolucao: Date;

  @Column({ name: 'primeira_resposta_em', type: 'timestamptz', nullable: true })
  primeiraRespostaEm: Date | null;

  // enquanto espera o cliente o prazo de solução fica parado
  @Column({ name: 'pausado_em', type: 'timestamptz', nullable: true })
  pausadoEm: Date | null;

  @Column({ name: 'resolvido_em', type: 'timestamptz', nullable: true })
  resolvidoEm: Date | null;

  @Column({ name: 'fechado_em', type: 'timestamptz', nullable: true })
  fechadoEm: Date | null;

  @Column({ name: 'avaliacao_nota', type: 'smallint', nullable: true })
  avaliacaoNota: number | null;

  @Column({ name: 'avaliacao_comentario', type: 'text', nullable: true })
  avaliacaoComentario: string | null;

  // o cliente manda a versão que viu; se alguém mexeu antes, a API devolve 409
  @VersionColumn()
  versao: number;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
