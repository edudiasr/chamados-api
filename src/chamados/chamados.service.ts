import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Repository } from 'typeorm';
import { Categoria } from '../categorias/categoria.entity.js';
import type { UsuarioLogado } from '../comum/decoradores.js';
import { montarPagina } from '../comum/paginacao.js';
import { NotificacoesService } from '../notificacoes/notificacoes.js';
import { Papel, ehEquipe } from '../usuarios/papel.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Prioridade, Status } from './chamado.enums.js';
import type {
  AbrirChamadoDto,
  AtribuirDto,
  AvaliacaoDto,
  ComentarioDto,
  EditarChamadoDto,
  FiltroChamadosDto,
  MudarStatusDto,
} from './chamados.dto.js';
import { Chamado } from './entidades/chamado.entity.js';
import { Comentario } from './entidades/comentario.entity.js';
import { type AcaoHistorico, Historico } from './entidades/historico.entity.js';
import { calcularPrazos } from './regras/sla.js';
import { efeitosDaMudanca, motivoParaRecusar } from './regras/transicoes.js';

type NovoHistorico = {
  acao: AcaoHistorico;
  de?: string | null;
  para?: string | null;
};

const ENCERRADOS = [Status.FECHADO, Status.CANCELADO];
// só esses contam como "atrasado": esperando o cliente o prazo fica parado
const CORRENDO_PRAZO = [Status.ABERTO, Status.EM_ANDAMENTO];

@Injectable()
export class ChamadosService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Chamado) private readonly chamados: Repository<Chamado>,
    @InjectRepository(Comentario)
    private readonly comentarios: Repository<Comentario>,
    @InjectRepository(Historico)
    private readonly historicos: Repository<Historico>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Categoria)
    private readonly categorias: Repository<Categoria>,
    private readonly notificacoes: NotificacoesService,
  ) {}

  async abrir(dto: AbrirChamadoDto, quem: UsuarioLogado) {
    if (dto.prioridade === Prioridade.URGENTE && !ehEquipe(quem.papel)) {
      throw new BadRequestException(
        'Só a equipe de suporte marca um chamado como urgente.',
      );
    }
    if (dto.categoriaId) await this.conferirCategoria(dto.categoriaId);

    const prioridade = dto.prioridade ?? Prioridade.MEDIA;
    const chamado = await this.ds.transaction(async (m) => {
      const c = await m.save(
        m.create(Chamado, {
          titulo: dto.titulo,
          descricao: dto.descricao,
          prioridade,
          categoriaId: dto.categoriaId ?? null,
          solicitanteId: quem.id,
          ...calcularPrazos(new Date(), prioridade),
        }),
      );
      await m.insert(Historico, {
        chamadoId: c.id,
        autorId: quem.id,
        acao: 'ABERTURA',
        para: prioridade,
      });
      return c;
    });

    if (prioridade === Prioridade.URGENTE || prioridade === Prioridade.ALTA) {
      const equipe = await this.usuarios.find({
        where: { papel: In([Papel.AGENTE, Papel.ADMIN]), ativo: true },
        select: { id: true },
      });
      await this.notificacoes.avisar({
        usuarioIds: equipe.map((u) => u.id).filter((id) => id !== quem.id),
        tipo: 'NOVO_CHAMADO',
        chamadoNumero: chamado.numero,
        texto: `Chamado #${chamado.numero} aberto com prioridade ${prioridade}: ${chamado.titulo}`,
      });
    }
    return this.detalhar(chamado.numero, quem);
  }

  async listar(filtro: FiltroChamadosDto, quem: UsuarioLogado) {
    const q = this.chamados
      .createQueryBuilder('c')
      .leftJoin('c.solicitante', 's')
      .leftJoin('c.responsavel', 'r')
      .leftJoin('c.categoria', 'cat')
      .select(['c', 's.id', 's.nome', 'r.id', 'r.nome', 'cat.id', 'cat.nome']);

    // cliente só enxerga os próprios chamados
    if (!ehEquipe(quem.papel))
      q.andWhere('c.solicitanteId = :eu', { eu: quem.id });

    if (filtro.status?.length)
      q.andWhere('c.status IN (:...status)', { status: filtro.status });
    if (filtro.prioridade)
      q.andWhere('c.prioridade = :prioridade', {
        prioridade: filtro.prioridade,
      });
    if (filtro.categoriaId)
      q.andWhere('c.categoriaId = :categoriaId', {
        categoriaId: filtro.categoriaId,
      });
    if (filtro.responsavel === 'eu')
      q.andWhere('c.responsavelId = :eu', { eu: quem.id });
    else if (filtro.responsavel === 'ninguem')
      q.andWhere('c.responsavelId IS NULL');
    else if (filtro.responsavel)
      q.andWhere('c.responsavelId = :resp', { resp: filtro.responsavel });
    if (filtro.atrasados)
      q.andWhere('c.status IN (:...correndo) AND c.prazoSolucao < now()', {
        correndo: CORRENDO_PRAZO,
      });
    if (filtro.busca) {
      const numero = Number(filtro.busca.replace('#', ''));
      q.andWhere(
        '(c.titulo ILIKE :busca OR c.descricao ILIKE :busca OR c.numero = :numero)',
        {
          busca: `%${filtro.busca}%`,
          numero: Number.isInteger(numero) ? numero : -1,
        },
      );
    }

    if (filtro.ordem === 'prazo') q.orderBy('c.prazoSolucao', 'ASC');
    else q.orderBy('c.criadoEm', 'DESC');
    q.addOrderBy('c.numero', 'DESC');

    const [itens, total] = await q
      .offset((filtro.pagina - 1) * filtro.porPagina)
      .limit(filtro.porPagina)
      .getManyAndCount();
    const agora = new Date();
    return montarPagina(
      itens.map((c) => this.resumo(c, agora)),
      total,
      filtro,
    );
  }

  async detalhar(numero: number, quem: UsuarioLogado) {
    const c = await this.buscar(numero, quem);
    const comentarios = await this.comentarios.find({
      where: {
        chamadoId: c.id,
        ...(ehEquipe(quem.papel) ? {} : { interno: false }),
      },
      relations: { autor: true },
      order: { criadoEm: 'ASC' },
    });
    return {
      ...this.resumo(c, new Date()),
      descricao: c.descricao,
      primeiraRespostaEm: c.primeiraRespostaEm,
      resolvidoEm: c.resolvidoEm,
      fechadoEm: c.fechadoEm,
      avaliacao: c.avaliacaoNota
        ? { nota: c.avaliacaoNota, comentario: c.avaliacaoComentario }
        : null,
      comentarios: comentarios.map((cm) => this.comentarioParaResposta(cm)),
    };
  }

  async editar(numero: number, dto: EditarChamadoDto, quem: UsuarioLogado) {
    const c = await this.buscar(numero, quem);
    const equipe = ehEquipe(quem.papel);
    if (ENCERRADOS.includes(c.status))
      throw new BadRequestException('Chamado encerrado não pode ser editado.');

    const mudancas: Partial<Chamado> = {};
    const historicos: NovoHistorico[] = [];

    if (
      dto.titulo !== undefined ||
      dto.descricao !== undefined ||
      dto.categoriaId !== undefined
    ) {
      if (!equipe && c.status !== Status.ABERTO) {
        throw new BadRequestException(
          'Depois que o atendimento começa, o chamado não pode mais ser editado. Use os comentários.',
        );
      }
      if (dto.titulo !== undefined && dto.titulo !== c.titulo) {
        mudancas.titulo = dto.titulo;
        historicos.push({
          acao: 'EDICAO',
          de: 'titulo',
          para: dto.titulo.slice(0, 120),
        });
      }
      if (dto.descricao !== undefined && dto.descricao !== c.descricao) {
        mudancas.descricao = dto.descricao;
        historicos.push({ acao: 'EDICAO', de: 'descricao' });
      }
      if (dto.categoriaId !== undefined && dto.categoriaId !== c.categoriaId) {
        const nova =
          dto.categoriaId === null
            ? null
            : await this.conferirCategoria(dto.categoriaId);
        mudancas.categoriaId = nova?.id ?? null;
        historicos.push({
          acao: 'CATEGORIA',
          de: c.categoria?.nome ?? null,
          para: nova?.nome ?? null,
        });
      }
    }

    if (dto.prioridade !== undefined && dto.prioridade !== c.prioridade) {
      if (!equipe)
        throw new ForbiddenException(
          'Só a equipe de suporte muda a prioridade.',
        );
      // os prazos são recalculados a partir da abertura
      Object.assign(
        mudancas,
        { prioridade: dto.prioridade },
        calcularPrazos(c.criadoEm, dto.prioridade),
      );
      historicos.push({
        acao: 'PRIORIDADE',
        de: c.prioridade,
        para: dto.prioridade,
      });
    }

    if (historicos.length)
      await this.aplicar(c, dto.versao, mudancas, historicos, quem);
    return this.detalhar(numero, quem);
  }

  async mudarStatus(numero: number, dto: MudarStatusDto, quem: UsuarioLogado) {
    const c = await this.buscar(numero, quem);
    const recusa = motivoParaRecusar(c, dto.status, quem.papel);
    if (recusa) throw new BadRequestException(recusa);

    const equipe = ehEquipe(quem.papel);
    if (dto.status === Status.RESOLVIDO && !dto.comentario) {
      throw new BadRequestException(
        'Conte o que foi feito para resolver (campo "comentario").',
      );
    }

    const agora = new Date();
    const efeitos = efeitosDaMudanca(c, dto.status, quem, agora);
    const mudancas: Partial<Chamado> = { ...efeitos };
    const historicos: NovoHistorico[] = [
      { acao: 'STATUS', de: c.status, para: dto.status },
    ];
    if (
      efeitos.responsavelId !== undefined &&
      efeitos.responsavelId !== c.responsavelId
    ) {
      historicos.push({
        acao: 'ATRIBUICAO',
        de: c.responsavel?.nome ?? null,
        para: efeitos.responsavelId ? quem.nome : null,
      });
    }
    if (dto.comentario && equipe && !c.primeiraRespostaEm)
      mudancas.primeiraRespostaEm = agora;

    await this.aplicar(c, dto.versao, mudancas, historicos, quem, async (m) => {
      if (dto.comentario)
        await m.insert(Comentario, {
          chamadoId: c.id,
          autorId: quem.id,
          texto: dto.comentario,
          interno: false,
        });
    });

    const responsavel =
      efeitos.responsavelId !== undefined
        ? efeitos.responsavelId
        : c.responsavelId;
    await this.notificacoes.avisar({
      usuarioIds: [c.solicitanteId, responsavel].filter(
        (id): id is string => !!id && id !== quem.id,
      ),
      tipo: 'STATUS',
      chamadoNumero: c.numero,
      texto: `Chamado #${c.numero} mudou para ${dto.status}.`,
    });
    return this.detalhar(numero, quem);
  }

  /**
   * Pegar, passar ou soltar um chamado. Agente só pega para si (ou solta o que é seu);
   * admin distribui para qualquer pessoa da equipe.
   */
  async atribuir(numero: number, dto: AtribuirDto, quem: UsuarioLogado) {
    const c = await this.buscar(numero, quem);
    const novo = dto.responsavelId;
    if (ENCERRADOS.includes(c.status) || c.status === Status.RESOLVIDO) {
      throw new BadRequestException('Esse chamado já foi resolvido.');
    }
    if (novo === c.responsavelId) return this.detalhar(numero, quem);

    if (quem.papel === Papel.AGENTE) {
      if (novo && novo !== quem.id)
        throw new ForbiddenException(
          'Agente só pega o chamado para si. Para passar para outra pessoa, fale com um admin.',
        );
      if (!novo && c.responsavelId !== quem.id)
        throw new ForbiddenException('Só dá para soltar um chamado que é seu.');
    }

    let alvo: Usuario | null = null;
    if (novo) {
      alvo = await this.usuarios.findOneBy({ id: novo });
      if (!alvo?.ativo || !ehEquipe(alvo.papel))
        throw new BadRequestException(
          'O responsável precisa ser um agente ou admin ativo.',
        );
    }

    const mudancas: Partial<Chamado> = { responsavelId: novo };
    const historicos: NovoHistorico[] = [
      {
        acao: 'ATRIBUICAO',
        de: c.responsavel?.nome ?? null,
        para: alvo?.nome ?? null,
      },
    ];
    if (novo && c.status === Status.ABERTO)
      mudancas.status = Status.EM_ANDAMENTO;
    if (!novo && c.status === Status.EM_ANDAMENTO)
      mudancas.status = Status.ABERTO;
    if (mudancas.status)
      historicos.push({ acao: 'STATUS', de: c.status, para: mudancas.status });

    await this.ds.transaction(async (m) => {
      // só grava se o responsável ainda for o que a gente leu:
      // dois agentes clicando em "pegar" ao mesmo tempo, só um fica com o chamado
      const q = m
        .createQueryBuilder()
        .update(Chamado)
        .set(mudancas)
        .where('id = :id', { id: c.id });
      if (c.responsavelId)
        q.andWhere('responsavel_id = :atual', { atual: c.responsavelId });
      else q.andWhere('responsavel_id IS NULL');
      const r = await q.execute();
      if (r.affected !== 1)
        throw new ConflictException(
          'Outra pessoa mexeu no responsável desse chamado agora há pouco. Recarregue a página.',
        );
      await this.gravarHistorico(m, c.id, quem.id, historicos);
    });

    if (novo && novo !== quem.id) {
      await this.notificacoes.avisar({
        usuarioIds: [novo],
        tipo: 'ATRIBUIDO',
        chamadoNumero: c.numero,
        texto: `${quem.nome} passou o chamado #${c.numero} para você.`,
      });
    }
    return this.detalhar(numero, quem);
  }

  async comentar(numero: number, dto: ComentarioDto, quem: UsuarioLogado) {
    const c = await this.buscar(numero, quem);
    const equipe = ehEquipe(quem.papel);
    if (ENCERRADOS.includes(c.status))
      throw new BadRequestException(
        'Chamado encerrado. Se o problema voltou, abra um chamado novo.',
      );
    if (dto.interno && !equipe)
      throw new ForbiddenException('Só a equipe escreve notas internas.');

    const interno = dto.interno ?? false;
    const agora = new Date();
    const mudancas: Partial<Chamado> = {};
    const historicos: NovoHistorico[] = [];
    if (equipe && !interno && !c.primeiraRespostaEm)
      mudancas.primeiraRespostaEm = agora;
    // o cliente respondeu: volta para a equipe e o prazo volta a correr
    if (!equipe && c.status === Status.AGUARDANDO_CLIENTE) {
      Object.assign(
        mudancas,
        efeitosDaMudanca(c, Status.EM_ANDAMENTO, quem, agora),
      );
      historicos.push({
        acao: 'STATUS',
        de: c.status,
        para: Status.EM_ANDAMENTO,
      });
    }

    const comentario = await this.ds.transaction(async (m) => {
      const cm = await m.save(
        m.create(Comentario, {
          chamadoId: c.id,
          autorId: quem.id,
          texto: dto.texto,
          interno,
        }),
      );
      if (Object.keys(mudancas).length)
        await m.update(Chamado, { id: c.id }, mudancas);
      await this.gravarHistorico(m, c.id, quem.id, historicos);
      return cm;
    });

    const destino = interno || !equipe ? c.responsavelId : c.solicitanteId;
    if (destino && destino !== quem.id) {
      await this.notificacoes.avisar({
        usuarioIds: [destino],
        tipo: 'NOVO_COMENTARIO',
        chamadoNumero: c.numero,
        texto: `${quem.nome} comentou no chamado #${c.numero}.`,
      });
    }
    comentario.autor = {
      id: quem.id,
      nome: quem.nome,
      papel: quem.papel,
    } as Usuario;
    return this.comentarioParaResposta(comentario);
  }

  async historico(numero: number, quem: UsuarioLogado) {
    const c = await this.buscar(numero, quem);
    const linhas = await this.historicos.find({
      where: { chamadoId: c.id },
      relations: { autor: true },
      order: { id: 'ASC' },
    });
    return linhas.map((h) => ({
      acao: h.acao,
      de: h.de,
      para: h.para,
      autor: h.autor ? { id: h.autor.id, nome: h.autor.nome } : null,
      em: h.criadoEm,
    }));
  }

  /** Só quem abriu avalia, uma vez, depois de resolvido. Avaliar um chamado resolvido já fecha ele. */
  async avaliar(numero: number, dto: AvaliacaoDto, quem: UsuarioLogado) {
    const c = await this.buscar(numero, quem);
    if (c.solicitanteId !== quem.id)
      throw new ForbiddenException('Só quem abriu o chamado pode avaliar.');
    if (c.status !== Status.RESOLVIDO && c.status !== Status.FECHADO)
      throw new BadRequestException(
        'Só dá para avaliar depois que o chamado for resolvido.',
      );

    const mudancas: Partial<Chamado> = {
      avaliacaoNota: dto.nota,
      avaliacaoComentario: dto.comentario ?? null,
    };
    const historicos: NovoHistorico[] = [
      { acao: 'AVALIACAO', para: String(dto.nota) },
    ];
    if (c.status === Status.RESOLVIDO) {
      Object.assign(mudancas, {
        status: Status.FECHADO,
        fechadoEm: new Date(),
      });
      historicos.push({ acao: 'STATUS', de: c.status, para: Status.FECHADO });
    }

    await this.ds.transaction(async (m) => {
      const r = await m
        .createQueryBuilder()
        .update(Chamado)
        .set(mudancas)
        .where('id = :id AND avaliacao_nota IS NULL', { id: c.id })
        .execute();
      if (r.affected !== 1)
        throw new ConflictException('Esse chamado já foi avaliado.');
      await this.gravarHistorico(m, c.id, quem.id, historicos);
    });
    return this.detalhar(numero, quem);
  }

  // ---------------------------------------------------------------------------

  /** Chamado de outro cliente devolve 404, e não 403, para não confirmar que ele existe. */
  private async buscar(numero: number, quem: UsuarioLogado) {
    const c = await this.chamados.findOne({
      where: { numero },
      relations: { solicitante: true, responsavel: true, categoria: true },
    });
    if (!c || (!ehEquipe(quem.papel) && c.solicitanteId !== quem.id))
      throw new NotFoundException(`Chamado #${numero} não encontrado.`);
    return c;
  }

  /** Grava as mudanças só se a versão ainda for a que o usuário viu (controle otimista). */
  private async aplicar(
    c: Chamado,
    versao: number,
    mudancas: Partial<Chamado>,
    historicos: NovoHistorico[],
    quem: UsuarioLogado,
    junto?: (m: EntityManager) => Promise<void>,
  ) {
    await this.ds.transaction(async (m) => {
      const r = await m.update(Chamado, { id: c.id, versao }, mudancas);
      if (r.affected !== 1) {
        throw new ConflictException(
          'Esse chamado foi alterado por outra pessoa enquanto você editava. Recarregue e tente de novo.',
        );
      }
      await this.gravarHistorico(m, c.id, quem.id, historicos);
      await junto?.(m);
    });
  }

  private async gravarHistorico(
    m: EntityManager,
    chamadoId: string,
    autorId: string,
    historicos: NovoHistorico[],
  ) {
    if (historicos.length === 0) return;
    await m.insert(
      Historico,
      historicos.map((h) => ({
        chamadoId,
        autorId,
        acao: h.acao,
        de: h.de ?? null,
        para: h.para ?? null,
      })),
    );
  }

  private async conferirCategoria(id: number) {
    const categoria = await this.categorias.findOneBy({ id });
    if (!categoria?.ativa) throw new BadRequestException('Categoria inválida.');
    return categoria;
  }

  private resumo(c: Chamado, agora: Date) {
    return {
      numero: c.numero,
      titulo: c.titulo,
      status: c.status,
      prioridade: c.prioridade,
      categoria: c.categoria
        ? { id: c.categoria.id, nome: c.categoria.nome }
        : null,
      solicitante: c.solicitante
        ? { id: c.solicitante.id, nome: c.solicitante.nome }
        : null,
      responsavel: c.responsavel
        ? { id: c.responsavel.id, nome: c.responsavel.nome }
        : null,
      prazoResposta: c.prazoResposta,
      prazoSolucao: c.prazoSolucao,
      atrasado: CORRENDO_PRAZO.includes(c.status) && c.prazoSolucao < agora,
      versao: c.versao,
      criadoEm: c.criadoEm,
      atualizadoEm: c.atualizadoEm,
    };
  }

  private comentarioParaResposta(cm: Comentario) {
    return {
      id: cm.id,
      texto: cm.texto,
      interno: cm.interno,
      autor: {
        id: cm.autor.id,
        nome: cm.autor.nome,
        equipe: ehEquipe(cm.autor.papel),
      },
      criadoEm: cm.criadoEm,
    };
  }
}
