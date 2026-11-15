import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Um refresh token. Cada renovação gera um novo na mesma "família" e marca o antigo
 * como usado. Se um token já usado aparecer de novo, alguém copiou: a família inteira cai.
 */
@Entity('sessoes')
export class Sessao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Index()
  @Column({ type: 'uuid' })
  familia: string;

  // só o sha256 do token fica no banco
  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'expira_em', type: 'timestamptz' })
  expiraEm: Date;

  @Column({ name: 'usado_em', type: 'timestamptz', nullable: true })
  usadoEm: Date | null;

  @Column({ name: 'revogado_em', type: 'timestamptz', nullable: true })
  revogadoEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
