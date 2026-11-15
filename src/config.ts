/** Confere as variáveis de ambiente na subida: melhor quebrar logo do que no meio de uma requisição. */
export type Ambiente = {
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  PORT: number;
  RODAR_MIGRATIONS: boolean;
};

export function validarAmbiente(env: Record<string, unknown>): Ambiente {
  const faltando = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'].filter(
    (k) => !env[k],
  );
  if (faltando.length)
    throw new Error(
      `Faltam variáveis de ambiente: ${faltando.join(', ')} (veja o .env.example)`,
    );

  const segredo = String(env.JWT_SECRET);
  if (segredo.length < 32)
    throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');

  return {
    DATABASE_URL: String(env.DATABASE_URL),
    REDIS_URL: String(env.REDIS_URL),
    JWT_SECRET: segredo,
    PORT: Number(env.PORT ?? 3000),
    RODAR_MIGRATIONS: env.RODAR_MIGRATIONS === 'true',
  };
}
