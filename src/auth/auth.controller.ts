import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  Publico,
  UsuarioAtual,
  type UsuarioLogado,
} from '../comum/decoradores.js';
import {
  CadastroDto,
  EntrarDto,
  RenovarDto,
  TrocarSenhaDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { LimiteLoginGuard } from './limite-login.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Cria uma conta de cliente e já devolve os tokens. */
  @Publico()
  @UseGuards(LimiteLoginGuard)
  @Post('cadastro')
  cadastrar(@Body() dto: CadastroDto) {
    return this.auth.cadastrar(dto);
  }

  /** Login. No máximo 5 tentativas por minuto para o mesmo e-mail. */
  @Publico()
  @UseGuards(LimiteLoginGuard)
  @ApiTooManyRequestsResponse({
    description: 'Muitas tentativas seguidas para esse e-mail.',
  })
  @HttpCode(200)
  @Post('entrar')
  entrar(@Body() dto: EntrarDto) {
    return this.auth.entrar(dto.email, dto.senha);
  }

  /** Troca o refresh token por um par novo (o antigo deixa de valer). */
  @Publico()
  @HttpCode(200)
  @Post('renovar')
  renovar(@Body() dto: RenovarDto) {
    return this.auth.renovar(dto.refreshToken);
  }

  /** Encerra a sessão desse refresh token. */
  @Publico()
  @HttpCode(204)
  @Post('sair')
  async sair(@Body() dto: RenovarDto) {
    await this.auth.sair(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('eu')
  eu(@UsuarioAtual() usuario: UsuarioLogado) {
    return usuario;
  }

  /** Troca a senha e encerra todas as sessões abertas. */
  @ApiBearerAuth()
  @HttpCode(204)
  @Patch('senha')
  async trocarSenha(
    @UsuarioAtual() usuario: UsuarioLogado,
    @Body() dto: TrocarSenhaDto,
  ) {
    await this.auth.trocarSenha(usuario, dto.senhaAtual, dto.novaSenha);
  }
}
