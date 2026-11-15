import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Paginacao } from '../comum/paginacao.js';
import { Prioridade, Status } from './chamado.enums.js';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AbrirChamadoDto {
  @IsString()
  @Length(5, 120)
  @Transform(aparar)
  titulo: string;

  @IsString()
  @Length(10, 5000)
  @Transform(aparar)
  descricao: string;

  @IsOptional()
  @IsInt()
  categoriaId?: number;

  /** Cliente escolhe entre BAIXA, MEDIA e ALTA. URGENTE só a equipe marca. */
  @IsOptional()
  @IsEnum(Prioridade)
  prioridade?: Prioridade;
}

export class EditarChamadoDto {
  /** Versão que você leu. Se mudou nesse meio tempo, a API devolve 409. */
  @IsInt()
  versao: number;

  @IsOptional()
  @IsString()
  @Length(5, 120)
  @Transform(aparar)
  titulo?: string;

  @IsOptional()
  @IsString()
  @Length(10, 5000)
  @Transform(aparar)
  descricao?: string;

  @IsOptional()
  @IsEnum(Prioridade)
  prioridade?: Prioridade;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  categoriaId?: number | null;
}

export class MudarStatusDto {
  @IsEnum(Status)
  status: Status;

  @IsInt()
  versao: number;

  /** Vira um comentário público junto com a mudança. Obrigatório ao resolver. */
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  @Transform(aparar)
  comentario?: string;
}

export class AtribuirDto {
  /** null tira o responsável. */
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  responsavelId: string | null;
}

export class ComentarioDto {
  @IsString()
  @Length(1, 5000)
  @Transform(aparar)
  texto: string;

  /** Nota interna, que o cliente não vê. Só a equipe pode marcar. */
  @IsOptional()
  @IsBoolean()
  interno?: boolean;
}

export class AvaliacaoDto {
  @IsInt()
  @Min(1)
  @Max(5)
  nota: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(aparar)
  comentario?: string;
}

export class FiltroChamadosDto extends Paginacao {
  /** Um ou mais status separados por vírgula: ABERTO,EM_ANDAMENTO */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsEnum(Status, { each: true })
  status?: Status[];

  @IsOptional()
  @IsEnum(Prioridade)
  prioridade?: Prioridade;

  /** "eu", "ninguem" ou o id de um agente. */
  @IsOptional()
  @ValidateIf((_, v) => v !== 'eu' && v !== 'ninguem')
  @IsUUID()
  responsavel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;

  /** Só os que passaram do prazo de solução. */
  @IsOptional()
  @Transform(({ obj }) => obj.atrasados === 'true')
  @IsBoolean()
  atrasados?: boolean;

  /** Procura no título e na descrição. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @IsOptional()
  @IsIn(['recentes', 'prazo'])
  ordem?: 'recentes' | 'prazo';
}
