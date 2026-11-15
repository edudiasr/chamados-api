import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import type { UsuarioLogado } from '../comum/decoradores.js';
import { Papel } from '../usuarios/papel.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { CadastroDto } from './auth.dto.js';
import { Sessao } from './sessao.entity.js';
import { conferirSenha, gerarHash } from './senha.js';

export const ACCESS_TOKEN_SEGUNDOS = 15 * 60;
const REFRESH_TOKEN_DIAS = 30;

const sha256 = (texto: string) =>
  createHash('sha256').update(texto).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly usuariosService: UsuariosService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Sessao) private readonly sessoes: Repository<Sessao>,
  ) {}

  /** Cadastro aberto cria sempre um CLIENTE. Agentes e admins são criados por um admin. */
  async cadastrar(dto: CadastroDto) {
    const usuario = await this.usuariosService.criar({
      nome: dto.nome,
      email: dto.email,
      senha: dto.senha,
      papel: Papel.CLIENTE,
    });
    return this.emitirTokens(usuario, randomUUID());
  }

  async entrar(email: string, senha: string) {
    const usuario = await this.usuarios.findOne({
      where: { email },
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        ativo: true,
        senhaHash: true,
      },
    });
    // confere a senha mesmo se o e-mail não existir, para o tempo de resposta não denunciar
    const senhaOk = await conferirSenha(senha, usuario?.senhaHash);
    if (!usuario || !senhaOk || !usuario.ativo)
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    return this.emitirTokens(usuario, randomUUID());
  }

  /**
   * Troca um refresh token por um par novo. Cada refresh token vale uma vez só.
   * Se um token já usado voltar, alguém tem uma cópia: derruba a família inteira.
   */
  async renovar(refreshToken: string) {
    const sessao = await this.sessoes.findOne({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!sessao || sessao.expiraEm < new Date())
      throw new UnauthorizedException('Sessão expirada. Entre de novo.');

    // update condicional: com duas renovações ao mesmo tempo, só uma marca o token como usado
    const marcou = await this.sessoes.update(
      { id: sessao.id, usadoEm: IsNull(), revogadoEm: IsNull() },
      { usadoEm: new Date() },
    );
    if (marcou.affected !== 1) {
      await this.encerrarFamilia(sessao.familia);
      throw new UnauthorizedException(
        'Sessão encerrada por segurança. Entre de novo.',
      );
    }

    const usuario = await this.usuarios.findOneBy({ id: sessao.usuarioId });
    if (!usuario?.ativo) throw new UnauthorizedException('Usuário desativado.');
    return this.emitirTokens(usuario, sessao.familia);
  }

  async sair(refreshToken: string) {
    const sessao = await this.sessoes.findOne({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (sessao) await this.encerrarFamilia(sessao.familia);
  }

  /** Trocar a senha derruba todas as sessões, inclusive a atual. */
  async trocarSenha(
    usuario: UsuarioLogado,
    senhaAtual: string,
    novaSenha: string,
  ) {
    const salvo = await this.usuarios.findOne({
      where: { id: usuario.id },
      select: { id: true, senhaHash: true },
    });
    if (!(await conferirSenha(senhaAtual, salvo?.senhaHash)))
      throw new BadRequestException('Senha atual incorreta.');
    if (senhaAtual === novaSenha)
      throw new BadRequestException(
        'A senha nova precisa ser diferente da atual.',
      );

    await this.usuarios.update(
      { id: usuario.id },
      { senhaHash: await gerarHash(novaSenha) },
    );
    await this.sessoes.update(
      { usuarioId: usuario.id, revogadoEm: IsNull() },
      { revogadoEm: new Date() },
    );
  }

  private async encerrarFamilia(familia: string) {
    await this.sessoes.update(
      { familia, revogadoEm: IsNull() },
      { revogadoEm: new Date() },
    );
  }

  private async emitirTokens(
    usuario: Pick<Usuario, 'id' | 'nome' | 'email' | 'papel'>,
    familia: string,
  ) {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.sessoes.insert({
      usuarioId: usuario.id,
      familia,
      tokenHash: sha256(refreshToken),
      expiraEm: new Date(Date.now() + REFRESH_TOKEN_DIAS * 24 * 60 * 60 * 1000),
    });

    // o papel não vai no token: ele é lido do banco a cada requisição (ver AuthGuard)
    const accessToken = await this.jwt.signAsync(
      { sub: usuario.id },
      { expiresIn: ACCESS_TOKEN_SEGUNDOS },
    );
    return {
      accessToken,
      refreshToken,
      expiraEm: ACCESS_TOKEN_SEGUNDOS,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel,
      },
    };
  }
}
