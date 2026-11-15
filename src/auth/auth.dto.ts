import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

const minusculo = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CadastroDto {
  @IsString()
  @Length(2, 80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(120)
  @Transform(minusculo)
  email: string;

  /** Mínimo de 8 caracteres. */
  @IsString()
  @Length(8, 128, { message: 'A senha precisa ter entre 8 e 128 caracteres.' })
  senha: string;
}

export class EntrarDto {
  @IsEmail({}, { message: 'E-mail inválido.' })
  @Transform(minusculo)
  email: string;

  @IsString()
  @MaxLength(128)
  senha: string;
}

export class RenovarDto {
  @IsString()
  @Length(20, 100)
  refreshToken: string;
}

export class TrocarSenhaDto {
  @IsString()
  @MaxLength(128)
  senhaAtual: string;

  @IsString()
  @Length(8, 128, { message: 'A senha precisa ter entre 8 e 128 caracteres.' })
  novaSenha: string;
}
