import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

/**
 * Erro de aplicação com código estável e status HTTP. O handler global serializa
 * tudo como `{ error: { code, message } }` (contrato em contracts/rest-api.md).
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string) => new AppError('bad_request', msg, 400);
export const unauthorized = (msg = 'não autenticado') => new AppError('unauthorized', msg, 401);
export const forbidden = (msg = 'sem permissão') => new AppError('forbidden', msg, 403);
export const notFound = (msg = 'não encontrado') => new AppError('not_found', msg, 404);
export const conflict = (msg: string) => new AppError('conflict', msg, 409);
export const unprocessable = (msg: string) => new AppError('unprocessable', msg, 422);

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'validation_error',
          message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      });
    }
    const message = error instanceof Error ? error.message : 'erro interno';
    app.log.error(error);
    return reply.status(500).send({ error: { code: 'internal_error', message } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: 'rota não encontrada' } });
  });
}
