import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Papel } from '../usuarios/papel.js';

/** Quem está fazendo a requisição (preenchido pelo AuthGuard). */
export type UsuarioLogado = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
};

export const ROTA_PUBLICA = 'rotaPublica';
export const PAPEIS = 'papeis';

/** Rota que não precisa de token (login, cadastro, saúde). */
export const Publico = () => SetMetadata(ROTA_PUBLICA, true);

/** Só esses papéis passam. Sem o decorator, qualquer usuário logado passa. */
export const Papeis = (...papeis: Papel[]) => SetMetadata(PAPEIS, papeis);

export const UsuarioAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioLogado => {
    return ctx.switchToHttp().getRequest().usuario;
  },
);
