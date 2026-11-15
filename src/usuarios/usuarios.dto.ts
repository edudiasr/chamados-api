import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Paginacao } from '../comum/paginacao.js';
import { Papel } from './papel.js';

export class CriarUsuarioDto {
  @IsString()
  @Length(2, 80)
  nome: string;

  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @Length(8, 128, { message: 'A senha precisa ter entre 8 e 128 caracteres.' })
  senha: string;

  @IsEnum(Papel)
  papel: Papel;
}

export class EditarUsuarioDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  nome?: string;

  @IsOptional()
  @IsEnum(Papel)
  papel?: Papel;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class FiltroUsuariosDto extends Paginacao {
  @IsOptional()
  @IsEnum(Papel)
  papel?: Papel;

  /** Parte do nome ou do e-mail. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  busca?: string;

  // na query string tudo chega como texto: "true"/"false"
  @IsOptional()
  @Transform(({ obj }) =>
    obj.ativo === undefined ? undefined : obj.ativo === 'true',
  )
  @IsBoolean()
  ativo?: boolean;
}
