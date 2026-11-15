import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import {
  Papeis,
  UsuarioAtual,
  type UsuarioLogado,
} from '../comum/decoradores.js';
import { Papel } from '../usuarios/papel.js';
import {
  AbrirChamadoDto,
  AtribuirDto,
  AvaliacaoDto,
  ComentarioDto,
  EditarChamadoDto,
  FiltroChamadosDto,
  MudarStatusDto,
} from './chamados.dto.js';
import { ChamadosService } from './chamados.service.js';

@ApiTags('chamados')
@ApiBearerAuth()
@Controller('chamados')
export class ChamadosController {
  constructor(private readonly service: ChamadosService) {}

  /** Cliente vê só os dele; a equipe vê todos. */
  @Get()
  listar(
    @Query() filtro: FiltroChamadosDto,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.listar(filtro, quem);
  }

  @Post()
  abrir(@Body() dto: AbrirChamadoDto, @UsuarioAtual() quem: UsuarioLogado) {
    return this.service.abrir(dto, quem);
  }

  @Get(':numero')
  detalhar(
    @Param('numero', ParseIntPipe) numero: number,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.detalhar(numero, quem);
  }

  @ApiConflictResponse({ description: 'A versão enviada não é mais a atual.' })
  @Patch(':numero')
  editar(
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: EditarChamadoDto,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.editar(numero, dto, quem);
  }

  @ApiConflictResponse({ description: 'A versão enviada não é mais a atual.' })
  @HttpCode(200)
  @Post(':numero/status')
  mudarStatus(
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: MudarStatusDto,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.mudarStatus(numero, dto, quem);
  }

  @ApiConflictResponse({ description: 'Outra pessoa pegou o chamado antes.' })
  @Papeis(Papel.AGENTE, Papel.ADMIN)
  @HttpCode(200)
  @Post(':numero/responsavel')
  atribuir(
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: AtribuirDto,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.atribuir(numero, dto, quem);
  }

  @Post(':numero/comentarios')
  comentar(
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: ComentarioDto,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.comentar(numero, dto, quem);
  }

  @Get(':numero/historico')
  historico(
    @Param('numero', ParseIntPipe) numero: number,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.historico(numero, quem);
  }

  @HttpCode(200)
  @Post(':numero/avaliacao')
  avaliar(
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: AvaliacaoDto,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.avaliar(numero, dto, quem);
  }
}
