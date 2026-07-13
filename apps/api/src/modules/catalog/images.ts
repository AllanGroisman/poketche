import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ObjectStore, StoredObject } from '../../integrations/storage/r2.js';

/**
 * Proxy de imagens do catálogo com cache próprio em R2 (constituição V — não servir direto
 * das fontes; o explorador público expõe imagens que nenhum usuário possui, então cache
 * é essencial de escala). Miss → busca na fonte, persiste no R2 e serve. Sem R2 configurado
 * (dev), redireciona 302 para a fonte. Helpers reusados pelo job `image-backfill` (T018).
 */

export type ImageSize = 'small' | 'large';
const LONG_CACHE = 'public, max-age=31536000, immutable';

export function isImageSize(v: string): v is ImageSize {
  return v === 'small' || v === 'large';
}

export function imageKey(translationId: string, size: ImageSize): string {
  return `cards/${translationId}/${size}`;
}

/** Garante o objeto em cache: retorna o cacheado, senão busca na fonte e persiste. null se a fonte falhar. */
export async function warmImage(
  store: ObjectStore,
  key: string,
  sourceUrl: string,
): Promise<StoredObject | null> {
  const cached = await store.get(key);
  if (cached) return cached;

  const res = await fetch(sourceUrl);
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') ?? 'image/png';
  const body = new Uint8Array(await res.arrayBuffer());
  await store.put(key, body, contentType);
  return { body, contentType };
}

export interface CatalogImagesDeps {
  prisma: PrismaClient;
  store: ObjectStore;
}

export async function registerCatalogImages(
  app: FastifyInstance,
  deps: CatalogImagesDeps,
): Promise<void> {
  app.get(
    '/catalog/images/:translationId/:size',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { translationId, size } = req.params as { translationId: string; size: string };
      if (!isImageSize(size)) {
        return reply.code(400).send({ error: { code: 'bad_request', message: 'size inválido' } });
      }

      const translation = await deps.prisma.cardTranslation.findUnique({
        where: { id: translationId },
        select: { imageSmallUrl: true, imageLargeUrl: true },
      });
      if (!translation) {
        return reply
          .code(404)
          .send({ error: { code: 'not_found', message: 'tradução não encontrada' } });
      }
      const sourceUrl = size === 'small' ? translation.imageSmallUrl : translation.imageLargeUrl;

      // Sem R2 (dev): redireciona para a fonte — o app segue funcional.
      if (!deps.store.enabled) {
        return reply.redirect(sourceUrl, 302);
      }

      // Qualquer falha no cache/fonte degrada para redirect à fonte (constituição V —
      // o app segue operável mesmo com o R2 indisponível).
      let obj: StoredObject | null = null;
      try {
        obj = await warmImage(deps.store, imageKey(translationId, size), sourceUrl);
      } catch (err) {
        req.log.warn({ err }, 'image proxy: falha no cache, redirecionando à fonte');
      }
      if (!obj) {
        return reply.redirect(sourceUrl, 302);
      }
      return reply
        .header('Content-Type', obj.contentType)
        .header('Cache-Control', LONG_CACHE)
        .send(Buffer.from(obj.body));
    },
  );
}
