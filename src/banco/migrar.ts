import { DataSource } from 'typeorm';
import { opcoesDoBanco } from './data-source.js';

// npm run db:migrar: aplica as migrations pendentes
const ds = await new DataSource(
  opcoesDoBanco(process.env.DATABASE_URL ?? ''),
).initialize();
try {
  const feitas = await ds.runMigrations({ transaction: 'each' });
  for (const m of feitas) console.log(`migration aplicada: ${m.name}`);
  if (feitas.length === 0) console.log('banco já está atualizado');
} finally {
  await ds.destroy();
}
