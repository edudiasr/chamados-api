import { DataSource, type DataSourceOptions } from 'typeorm';
import { Sessao } from '../auth/sessao.entity.js';
import { Categoria } from '../categorias/categoria.entity.js';
import { Chamado } from '../chamados/entidades/chamado.entity.js';
import { Comentario } from '../chamados/entidades/comentario.entity.js';
import { Historico } from '../chamados/entidades/historico.entity.js';
import { Notificacao } from '../notificacoes/notificacao.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { migrations } from './migrations/index.js';

export const entidades = [
  Usuario,
  Categoria,
  Chamado,
  Comentario,
  Historico,
  Sessao,
  Notificacao,
];

/** Mesmas opções para a API, para os scripts (migrations/seed) e para os testes. */
export function opcoesDoBanco(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    // gen_random_uuid() já vem no Postgres, sem precisar da extensão uuid-ossp
    uuidExtension: 'pgcrypto',
    entities: entidades,
    migrations,
    // o schema só muda por migration
    synchronize: false,
  };
}

// usado pela CLI do TypeORM (npm run migration:gerar)
export default new DataSource(opcoesDoBanco(process.env.DATABASE_URL ?? ''));
