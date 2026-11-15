import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Papel } from './papel.js';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  nome: string;

  // sempre gravado em minúsculas (ver UsuariosService)
  @Column({ type: 'varchar', length: 120, unique: true })
  email: string;

  // select: false para o hash nunca sair numa consulta sem querer
  @Column({ name: 'senha_hash', type: 'text', select: false })
  senhaHash: string;

  @Column({
    type: 'enum',
    enum: Papel,
    enumName: 'papel',
    default: Papel.CLIENTE,
  })
  papel: Papel;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
