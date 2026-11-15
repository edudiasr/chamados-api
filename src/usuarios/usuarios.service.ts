import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { gerarHash } from '../auth/senha.js';
import type { UsuarioLogado } from '../comum/decoradores.js';
import { violouUnico } from '../comum/erros-banco.js';
import { montarPagina } from '../comum/paginacao.js';
import { Papel } from './papel.js';
import { Usuario } from './usuario.entity.js';
import type {
  CriarUsuarioDto,
  EditarUsuarioDto,
  FiltroUsuariosDto,
} from './usuarios.dto.js';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
  ) {}

  async criar(dto: CriarUsuarioDto) {
    try {
      const salvo = await this.usuarios.save(
        this.usuarios.create({
          nome: dto.nome,
          email: dto.email,
          papel: dto.papel,
          senhaHash: await gerarHash(dto.senha),
        }),
      );
      const { senhaHash: _, ...semHash } = salvo;
      return semHash;
    } catch (e) {
      if (violouUnico(e))
        throw new ConflictException('Já existe uma conta com esse e-mail.');
      throw e;
    }
  }

  async listar(filtro: FiltroUsuariosDto) {
    const q = this.usuarios.createQueryBuilder('u').orderBy('u.nome', 'ASC');
    if (filtro.papel) q.andWhere('u.papel = :papel', { papel: filtro.papel });
    if (filtro.ativo !== undefined)
      q.andWhere('u.ativo = :ativo', { ativo: filtro.ativo });
    if (filtro.busca)
      q.andWhere('(u.nome ILIKE :busca OR u.email ILIKE :busca)', {
        busca: `%${filtro.busca}%`,
      });

    const [itens, total] = await q
      .skip((filtro.pagina - 1) * filtro.porPagina)
      .take(filtro.porPagina)
      .getManyAndCount();
    return montarPagina(itens, total, filtro);
  }

  async editar(id: string, dto: EditarUsuarioDto, quem: UsuarioLogado) {
    const usuario = await this.usuarios.findOneBy({ id });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    const deixaDeSerAdmin =
      usuario.papel === Papel.ADMIN &&
      ((dto.papel && dto.papel !== Papel.ADMIN) || dto.ativo === false);
    if (id === quem.id && deixaDeSerAdmin)
      throw new BadRequestException(
        'Você não pode tirar o seu próprio acesso de admin.',
      );
    if (deixaDeSerAdmin) {
      const admins = await this.usuarios.countBy({
        papel: Papel.ADMIN,
        ativo: true,
      });
      if (admins <= 1)
        throw new BadRequestException(
          'Precisa sobrar pelo menos um admin ativo.',
        );
    }

    Object.assign(usuario, dto);
    return this.usuarios.save(usuario);
  }
}
