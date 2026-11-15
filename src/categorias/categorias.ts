import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Repository } from 'typeorm';
import { Papeis } from '../comum/decoradores.js';
import { violouUnico } from '../comum/erros-banco.js';
import { Papel } from '../usuarios/papel.js';
import { Categoria } from './categoria.entity.js';

// módulo pequeno, então ficou tudo num arquivo só

export class CategoriaDto {
  @IsString()
  @Length(2, 60)
  nome: string;
}

export class EditarCategoriaDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private readonly categorias: Repository<Categoria>,
  ) {}

  listar() {
    return this.categorias.find({ order: { nome: 'ASC' } });
  }

  async salvar(categoria: Categoria) {
    try {
      return await this.categorias.save(categoria);
    } catch (e) {
      if (violouUnico(e))
        throw new ConflictException('Já existe uma categoria com esse nome.');
      throw e;
    }
  }

  criar(dto: CategoriaDto) {
    return this.salvar(this.categorias.create({ nome: dto.nome.trim() }));
  }

  async editar(id: number, dto: EditarCategoriaDto) {
    const categoria = await this.categorias.findOneBy({ id });
    if (!categoria) throw new NotFoundException('Categoria não encontrada.');
    if (dto.nome !== undefined) categoria.nome = dto.nome.trim();
    if (dto.ativa !== undefined) categoria.ativa = dto.ativa;
    return this.salvar(categoria);
  }
}

@ApiTags('categorias')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly service: CategoriasService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Papeis(Papel.ADMIN)
  @Post()
  criar(@Body() dto: CategoriaDto) {
    return this.service.criar(dto);
  }

  /** Desativar esconde a categoria para chamados novos, sem mexer nos antigos. */
  @Papeis(Papel.ADMIN)
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarCategoriaDto,
  ) {
    return this.service.editar(id, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Categoria])],
  controllers: [CategoriasController],
  providers: [CategoriasService],
})
export class CategoriasModule {}
