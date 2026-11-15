import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Papeis,
  UsuarioAtual,
  type UsuarioLogado,
} from '../comum/decoradores.js';
import { Papel } from './papel.js';
import {
  CriarUsuarioDto,
  EditarUsuarioDto,
  FiltroUsuariosDto,
} from './usuarios.dto.js';
import { UsuariosService } from './usuarios.service.js';

@ApiTags('usuarios')
@ApiBearerAuth()
@Papeis(Papel.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  listar(@Query() filtro: FiltroUsuariosDto) {
    return this.service.listar(filtro);
  }

  /** Cria agentes e admins (clientes se cadastram sozinhos em /auth/cadastro). */
  @Post()
  criar(@Body() dto: CriarUsuarioDto) {
    return this.service.criar(dto);
  }

  @Patch(':id')
  editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarUsuarioDto,
    @UsuarioAtual() quem: UsuarioLogado,
  ) {
    return this.service.editar(id, dto, quem);
  }
}
