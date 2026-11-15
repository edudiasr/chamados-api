import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { IsNull, Repository } from 'typeorm';
import { UsuarioAtual, type UsuarioLogado } from '../comum/decoradores.js';
import { montarPagina, Paginacao } from '../comum/paginacao.js';
import { Notificacao, type TipoNotificacao } from './notificacao.entity.js';

export const FILA_NOTIFICACOES = 'notificacoes';

export class FiltroNotificacoesDto extends Paginacao {
  /** true para trazer só as que ainda não foram lidas. */
  @IsOptional()
  @Transform(({ obj }) => obj.naoLidas === 'true')
  @IsBoolean()
  naoLidas?: boolean;
}

export type AvisoNovo = {
  usuarioIds: string[];
  tipo: TipoNotificacao;
  chamadoNumero: number;
  texto: string;
};

/**
 * Quem gera o aviso (o ChamadosService) só coloca na fila e segue a vida.
 * Gravar a notificação (e, no futuro, mandar e-mail) roda no worker, com
 * nova tentativa se der erro, sem atrasar a resposta da API.
 */
@Injectable()
export class NotificacoesService {
  constructor(
    @InjectQueue(FILA_NOTIFICACOES) private readonly fila: Queue<AvisoNovo>,
    @InjectRepository(Notificacao)
    private readonly notificacoes: Repository<Notificacao>,
  ) {}

  async avisar(aviso: AvisoNovo) {
    const usuarioIds = [...new Set(aviso.usuarioIds)];
    if (usuarioIds.length === 0) return;
    await this.fila.add(
      aviso.tipo,
      { ...aviso, usuarioIds },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
      },
    );
  }

  async listar(usuarioId: string, filtro: Paginacao, soNaoLidas: boolean) {
    const [itens, total] = await this.notificacoes.findAndCount({
      where: { usuarioId, ...(soNaoLidas ? { lidaEm: IsNull() } : {}) },
      order: { criadoEm: 'DESC' },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
    });
    return montarPagina(itens, total, filtro);
  }

  async marcarLida(usuarioId: string, id: string) {
    const r = await this.notificacoes.update(
      { id, usuarioId },
      { lidaEm: new Date() },
    );
    if (r.affected !== 1)
      throw new NotFoundException('Notificação não encontrada.');
  }

  async marcarTodas(usuarioId: string) {
    await this.notificacoes.update(
      { usuarioId, lidaEm: IsNull() },
      { lidaEm: new Date() },
    );
  }
}

@Processor(FILA_NOTIFICACOES)
export class NotificacoesWorker extends WorkerHost {
  private readonly logger = new Logger('Notificacoes');

  constructor(
    @InjectRepository(Notificacao)
    private readonly notificacoes: Repository<Notificacao>,
  ) {
    super();
  }

  async process(job: Job<AvisoNovo>) {
    const { usuarioIds, tipo, chamadoNumero, texto } = job.data;
    await this.notificacoes.insert(
      usuarioIds.map((usuarioId) => ({
        usuarioId,
        tipo,
        chamadoNumero,
        texto,
      })),
    );
    this.logger.log(
      `#${chamadoNumero} ${tipo} -> ${usuarioIds.length} usuário(s)`,
    );
  }
}

@ApiTags('notificacoes')
@ApiBearerAuth()
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly service: NotificacoesService) {}

  @Get()
  listar(
    @UsuarioAtual() usuario: UsuarioLogado,
    @Query() filtro: FiltroNotificacoesDto,
  ) {
    return this.service.listar(usuario.id, filtro, filtro.naoLidas ?? false);
  }

  @HttpCode(204)
  @Patch(':id/lida')
  async marcarLida(
    @UsuarioAtual() usuario: UsuarioLogado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.service.marcarLida(usuario.id, id);
  }

  @HttpCode(204)
  @Post('ler-todas')
  async marcarTodas(@UsuarioAtual() usuario: UsuarioLogado) {
    await this.service.marcarTodas(usuario.id);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Notificacao]),
    BullModule.registerQueue({ name: FILA_NOTIFICACOES }),
  ],
  controllers: [NotificacoesController],
  providers: [NotificacoesService, NotificacoesWorker],
  // exporta a fila também: o /saude usa ela para conferir o Redis
  exports: [NotificacoesService, BullModule],
})
export class NotificacoesModule {}
