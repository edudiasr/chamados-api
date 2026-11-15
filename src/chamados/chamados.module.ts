import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Categoria } from '../categorias/categoria.entity.js';
import { NotificacoesModule } from '../notificacoes/notificacoes.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { ChamadosController } from './chamados.controller.js';
import { ChamadosService } from './chamados.service.js';
import { ChamadosTarefas } from './chamados.tarefas.js';
import { Chamado } from './entidades/chamado.entity.js';
import { Comentario } from './entidades/comentario.entity.js';
import { Historico } from './entidades/historico.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chamado,
      Comentario,
      Historico,
      Usuario,
      Categoria,
    ]),
    NotificacoesModule,
  ],
  controllers: [ChamadosController],
  providers: [ChamadosService, ChamadosTarefas],
})
export class ChamadosModule {}
