import { validarAmbiente } from '../config.js';
import { conferirSenha, gerarHash } from './senha.js';

describe('senha', () => {
  it('o mesmo texto gera hashes diferentes (sal aleatório) e os dois conferem', async () => {
    const [a, b] = await Promise.all([
      gerarHash('minha-senha'),
      gerarHash('minha-senha'),
    ]);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await conferirSenha('minha-senha', a)).toBe(true);
    expect(await conferirSenha('minha-senha', b)).toBe(true);
  });

  it('senha errada, hash vazio ou formato desconhecido não passam', async () => {
    const hash = await gerarHash('certa');
    expect(await conferirSenha('errada', hash)).toBe(false);
    expect(await conferirSenha('certa', null)).toBe(false);
    expect(await conferirSenha('certa', 'md5$abc')).toBe(false);
  });
});

describe('variáveis de ambiente', () => {
  const base = {
    DATABASE_URL: 'postgres://x',
    REDIS_URL: 'redis://x',
    JWT_SECRET: 'a'.repeat(32),
  };

  it('aceita o mínimo e usa os padrões', () => {
    expect(validarAmbiente(base)).toMatchObject({
      PORT: 3000,
      RODAR_MIGRATIONS: false,
    });
  });

  it('avisa o que está faltando e recusa segredo curto', () => {
    expect(() => validarAmbiente({ JWT_SECRET: 'a'.repeat(32) })).toThrow(
      /DATABASE_URL, REDIS_URL/,
    );
    expect(() => validarAmbiente({ ...base, JWT_SECRET: 'curto' })).toThrow(
      /32 caracteres/,
    );
  });
});
