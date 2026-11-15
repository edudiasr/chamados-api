import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PAPEIS,
  ROTA_PUBLICA,
  type UsuarioLogado,
} from '../comum/decoradores.js';
import type { Papel } from '../usuarios/papel.js';
import { Usuario } from '../usuarios/usuario.entity.js';

/**
 * Guard global: toda rota exige token, a não ser as marcadas com @Publico().
 * O usuário é buscado no banco a cada requisição, assim quem é desativado
 * (ou muda de papel) perde o acesso na hora, sem esperar o token vencer.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, alvos))
      return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = String(req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token)
      throw new UnauthorizedException('Faça login para continuar.');

    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(token));
    } catch {
      throw new UnauthorizedException('Token inválido ou vencido.');
    }

    const usuario = await this.usuarios.findOne({
      where: { id: sub },
      select: { id: true, nome: true, email: true, papel: true, ativo: true },
    });
    if (!usuario?.ativo) throw new UnauthorizedException('Usuário desativado.');
    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
    } satisfies UsuarioLogado;

    const papeis = this.reflector.getAllAndOverride<Papel[] | undefined>(
      PAPEIS,
      alvos,
    );
    if (papeis && !papeis.includes(usuario.papel))
      throw new ForbiddenException('Você não tem permissão para isso.');
    return true;
  }
}
