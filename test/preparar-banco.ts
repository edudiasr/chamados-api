import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../src/banco/data-source.js';

/** Roda uma vez antes dos testes e2e: zera o banco de teste e aplica as migrations. */
export default async function prepararBanco() {
  const url =
    process.env.DATABASE_URL_TESTE ??
    'postgres://chamados:chamados@localhost:5434/chamados_teste';
  if (!url.includes('teste'))
    throw new Error(
      'Por segurança os testes só rodam num banco com "teste" no nome.',
    );

  const ds = await new DataSource(opcoesDoBanco(url)).initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.runMigrations();
  await ds.destroy();
}
