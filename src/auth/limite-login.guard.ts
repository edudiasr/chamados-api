import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limita tentativas de login por e-mail (e não só por IP): assim um ataque
 * de força bruta numa conta trava mesmo se vier de vários IPs.
 */
@Injectable()
export class LimiteLoginGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    return email ? `login:${email}` : `ip:${req.ip}`;
  }
}
