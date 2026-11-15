import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { Publico } from './comum/decoradores.js';
import { FILA_NOTIFICACOES } from './notificacoes/notificacoes.js';

// se o serviço travar, o healthcheck não pode travar junto
function comPrazo(promessa: Promise<unknown>, ms = 2000) {
  const estourou = new Promise((_, rejeita) =>
    setTimeout(() => rejeita(new Error('timeout')), ms).unref(),
  );
  return Promise.race([promessa, estourou]).then(
    () => 'ok',
    () => 'fora do ar',
  );
}

/** Usado pelo healthcheck do Docker/orquestrador: 200 se banco e Redis respondem, 503 se não. */
@ApiTags('saude')
@Controller('saude')
export class SaudeController {
  constructor(
    private readonly ds: DataSource,
    @InjectQueue(FILA_NOTIFICACOES) private readonly fila: Queue,
  ) {}

  @Publico()
  @Get()
  async verificar() {
    const [banco, redis] = await Promise.all([
      comPrazo(this.ds.query('SELECT 1')),
      // qualquer leitura da fila já passa pelo Redis
      comPrazo(this.fila.getJobCounts('waiting')),
    ]);
    const resultado = { banco, redis };
    if (banco !== 'ok' || redis !== 'ok')
      throw new ServiceUnavailableException(resultado);
    return resultado;
  }
}
