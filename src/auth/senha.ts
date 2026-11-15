import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: object,
) => Promise<Buffer>;

// custo do scrypt: 2^15 usa ~32 MB por hash, por isso o maxmem maior
const N = 2 ** 15;
const R = 8;
const P = 1;
const TAMANHO = 32;

/** Formato salvo: scrypt$N$r$p$sal$hash (base64). Guardar os parâmetros permite subir o custo depois. */
export async function gerarHash(senha: string) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha, sal, TAMANHO, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    'scrypt',
    N,
    R,
    P,
    sal.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

// usado quando o e-mail não existe: o tempo de resposta fica igual e não entrega quem tem conta
const HASH_FALSO = [
  'scrypt',
  N,
  R,
  P,
  Buffer.alloc(16).toString('base64'),
  Buffer.alloc(TAMANHO).toString('base64'),
].join('$');

export async function conferirSenha(
  senha: string,
  salvo: string | null | undefined,
) {
  const [algoritmo, n, r, p, sal, hash] = (salvo ?? HASH_FALSO).split('$');
  if (algoritmo !== 'scrypt' || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scryptAsync(
    senha,
    Buffer.from(sal, 'base64'),
    esperado.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    },
  );
  return (
    timingSafeEqual(calculado, esperado) &&
    salvo !== null &&
    salvo !== undefined
  );
}
