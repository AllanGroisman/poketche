import type { FastifyInstance } from 'fastify';
import type { Language, Prisma, PrismaClient, ScanSession } from '@prisma/client';
import { z } from 'zod';
import type { CardCandidate, CardIdentifier } from '../../integrations/identifier/index.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { ensureProfile } from '../account/service.js';
import { localize } from '../catalog/localize.js';
import type { PriceLike } from '../pricing/current.js';
import { computeSummary, type SummaryCapture } from './summary.js';
import { confirmSession } from './confirm.js';

/**
 * Sessões de escaneamento (T069, FR-021–FR-023/FR-053–FR-059). Nada aqui toca a coleção: a sessão
 * é um rascunho, e só o `confirm` grava (FR-058).
 *
 * **Ciclo de vida**: uma sessão aberta nasce `pending` e assim fica até `confirmed`/`discarded`. O
 * enum tem também `active`, que o MVP não usa: distinguir "escaneando agora" de "interrompida"
 * exigiria o app avisar o servidor ao ser morto — que é exatamente o caso que o FR-059 precisa
 * cobrir e o único em que esse aviso não chega. Tratar toda sessão aberta como recuperável é o que
 * faz o FR-059 valer sem depender de um sinal que não existe.
 */

const conditionEnum = z.enum(['mint', 'near_mint', 'excellent', 'good', 'played', 'damaged']);
const languageEnum = z.enum(['en', 'pt']);
const variantEnum = z.enum(['normal', 'reverse_foil', 'holo']);

const createSessionSchema = z.object({
  camera: z.enum(['back', 'front']).default('back'),
  recorded: z.boolean().default(false),
});

const patchSessionSchema = z
  .object({ camera: z.enum(['back', 'front']), recorded: z.boolean() })
  .partial();

const captureSchema = z.object({
  /** Crop da carta em base64 (FR-021: o app manda a carta recortada, não a cena inteira). */
  image_base64: z.string().min(1),
});

const patchCaptureSchema = z
  .object({
    card_id: z.string().uuid(),
    condition: conditionEnum,
    language: languageEnum,
    variant: variantEnum,
    quantity: z.number().int().min(1),
  })
  .partial();

/** Carta adicionada manualmente na revisão (FR-056: "adicionar manualmente cartas não detectadas"). */
const manualCaptureSchema = z.object({
  card_id: z.string().uuid(),
  condition: conditionEnum.default('near_mint'),
  language: languageEnum.default('en'),
  variant: variantEnum.default('normal'),
  quantity: z.number().int().min(1).default(1),
});

export interface ScannerDeps {
  prisma: PrismaClient;
  identifier: CardIdentifier;
  maxCropKb: number;
}

const includeCard = {
  card: {
    include: {
      set: { select: { externalId: true, name: true } },
      translations: { select: { id: true, language: true, name: true } },
    },
  },
} as const;

type CaptureWithCard = Prisma.ScanCaptureGetPayload<{ include: typeof includeCard }>;

/**
 * Forma persistida dos candidatos. Fixada aqui de propósito: `candidates` é um `Json` no banco e
 * é lido cru pelo app, então gravar o tipo interno do identificador acoplaria o payload da revisão
 * a um detalhe de implementação do adapter — e mudá-lo depois quebraria capturas já gravadas.
 */
const serializeCandidates = (candidates: CardCandidate[]) =>
  candidates.map((c) => ({
    card_id: c.cardId,
    name: c.name,
    number: c.number,
    set_name: c.setName,
    language: c.language,
    confidence: c.confidence,
  }));

/** Idioma de exibição da captura: o da carta, com o fallback do FR-067 quando indeterminado. */
const displayLang = (capture: CaptureWithCard): Language => capture.language ?? 'en';

function serializeCapture(capture: CaptureWithCard) {
  return {
    id: capture.id,
    status: capture.status,
    candidates: capture.candidates,
    condition: capture.condition,
    language: capture.language,
    variant: capture.variant,
    quantity: capture.quantity,
    language_detected: capture.languageDetected,
    method: capture.identificationMethod,
    created_at: capture.createdAt,
    card: capture.card
      ? {
          id: capture.card.id,
          external_id: capture.card.externalId,
          number: capture.card.number,
          rarity: capture.card.rarity,
          set: { external_id: capture.card.set.externalId, name: capture.card.set.name },
          ...localize(capture.card.translations, displayLang(capture)),
        }
      : null,
  };
}

const serializeSession = (s: ScanSession, captureCount?: number) => ({
  id: s.id,
  status: s.status,
  camera: s.camera,
  recorded: s.recorded,
  created_at: s.createdAt,
  confirmed_at: s.confirmedAt,
  discarded_at: s.discardedAt,
  ...(captureCount == null ? {} : { capture_count: captureCount }),
});

export function registerScannerRoutes(app: FastifyInstance, deps: ScannerDeps): void {
  const { prisma, identifier } = deps;

  /** Sessão aberta do usuário. 404 opaco para sessão de outro dono — nunca 403. */
  async function ownedSession(userId: string, id: string): Promise<ScanSession> {
    const session = await prisma.scanSession.findFirst({ where: { id, userId } });
    if (!session) throw notFound('sessão não encontrada');
    return session;
  }

  /** Só sessão aberta aceita escrita: confirmada/descartada é história, não rascunho. */
  async function openSession(userId: string, id: string): Promise<ScanSession> {
    const session = await ownedSession(userId, id);
    if (session.status !== 'pending') throw conflict('sessão já encerrada');
    return session;
  }

  app.post('/scan/sessions', { preHandler: app.requireAuth }, async (req, reply) => {
    const body = createSessionSchema.parse(req.body);
    await ensureProfile(prisma, req.user!);

    // Sessão pendente única (FR-059): o app recupera a que existe em vez de abrir outra.
    const existing = await prisma.scanSession.findFirst({
      where: { userId: req.user!.id, status: 'pending' },
    });
    if (existing) throw conflict('já existe uma sessão pendente');

    const session = await prisma.scanSession.create({
      data: {
        userId: req.user!.id,
        status: 'pending',
        camera: body.camera,
        recorded: body.recorded,
      },
    });
    reply.status(201);
    return serializeSession(session);
  });

  /** Recuperação na abertura do app (FR-059). Sem sessão aberta, `session: null` — não é erro. */
  app.get('/scan/sessions/pending', { preHandler: app.requireAuth }, async (req) => {
    const session = await prisma.scanSession.findFirst({
      where: { userId: req.user!.id, status: 'pending' },
    });
    if (!session) return { session: null };
    const captureCount = await prisma.scanCapture.count({ where: { sessionId: session.id } });
    return { session: serializeSession(session, captureCount) };
  });

  /** Câmera lembrada (FR-061) e toggle de gravação (FR-062) — o vídeo nunca sobe (FR-066). */
  app.patch('/scan/sessions/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchSessionSchema.parse(req.body);
    await openSession(req.user!.id, id);
    const session = await prisma.scanSession.update({
      where: { id },
      data: {
        ...(body.camera ? { camera: body.camera } : {}),
        ...(body.recorded == null ? {} : { recorded: body.recorded }),
      },
    });
    return serializeSession(session);
  });

  app.get('/scan/sessions/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const session = await ownedSession(req.user!.id, id);
    const captures = await prisma.scanCapture.findMany({
      where: { sessionId: id },
      include: includeCard,
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...serializeSession(session, captures.length),
      captures: captures.map(serializeCapture),
    };
  });

  app.post('/scan/sessions/:id/captures', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = captureSchema.parse(req.body);
    await openSession(req.user!.id, id);

    const crop = Buffer.from(body.image_base64, 'base64');
    if (crop.length === 0) throw badRequest('imagem inválida');
    if (crop.length > deps.maxCropKb * 1024) {
      throw badRequest(`crop acima de ${deps.maxCropKb}KB`);
    }

    const result = await identifier.identify(crop);

    // Duplicata na mesma sessão incrementa em vez de criar outra captura (FR-053). Só vale para
    // captura identificada: duas "a revisar" podem ser cartas diferentes — quem sabe é a revisão.
    if (result.card) {
      const dup = await prisma.scanCapture.findFirst({
        where: {
          sessionId: id,
          cardId: result.card.cardId,
          status: 'identified',
          language: result.language,
          variant: result.variant,
        },
      });
      if (dup) {
        const updated = await prisma.scanCapture.update({
          where: { id: dup.id },
          data: { quantity: { increment: 1 } },
          include: includeCard,
        });
        reply.status(200);
        return { capture: serializeCapture(updated), duplicate: true };
      }
    }

    const capture = await prisma.scanCapture.create({
      data: {
        sessionId: id,
        cardId: result.card?.cardId ?? null,
        status: result.card ? 'identified' : 'needs_review',
        candidates: serializeCandidates(result.candidates),
        // Condição não é detectável por imagem: fica nula até a revisão definir (FR-056).
        condition: null,
        language: result.language,
        languageDetected: result.languageDetected,
        variant: result.variant,
        identificationMethod: result.method,
        quantity: 1,
      },
      include: includeCard,
    });
    reply.status(201);
    return { capture: serializeCapture(capture), duplicate: false };
  });

  /** Adicionar manualmente carta não detectada (FR-056). */
  app.post('/scan/sessions/:id/manual', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = manualCaptureSchema.parse(req.body);
    await openSession(req.user!.id, id);

    const card = await prisma.card.findUnique({
      where: { id: body.card_id },
      select: { id: true },
    });
    if (!card) throw notFound('carta não encontrada');

    const capture = await prisma.scanCapture.create({
      data: {
        sessionId: id,
        cardId: body.card_id,
        status: 'identified',
        candidates: [],
        condition: body.condition,
        language: body.language,
        languageDetected: false,
        variant: body.variant,
        identificationMethod: 'manual',
        quantity: body.quantity,
      },
      include: includeCard,
    });
    reply.status(201);
    return { capture: serializeCapture(capture) };
  });

  /** Resolver "a revisar" e ajustar qty/condição/idioma/variante (FR-056). */
  app.patch(
    '/scan/sessions/:id/captures/:captureId',
    { preHandler: app.requireAuth },
    async (req) => {
      const { id, captureId } = req.params as { id: string; captureId: string };
      const body = patchCaptureSchema.parse(req.body);
      await openSession(req.user!.id, id);

      const existing = await prisma.scanCapture.findFirst({
        where: { id: captureId, sessionId: id },
      });
      if (!existing) throw notFound('captura não encontrada');

      if (body.card_id) {
        const card = await prisma.card.findUnique({
          where: { id: body.card_id },
          select: { id: true },
        });
        if (!card) throw notFound('carta não encontrada');
      }

      const capture = await prisma.scanCapture.update({
        where: { id: captureId },
        data: {
          ...(body.card_id ? { cardId: body.card_id } : {}),
          ...(body.condition ? { condition: body.condition } : {}),
          ...(body.language ? { language: body.language } : {}),
          ...(body.variant ? { variant: body.variant } : {}),
          ...(body.quantity ? { quantity: body.quantity } : {}),
          // Escolher a carta na revisão resolve o "a revisar" e o método passa a ser `manual`:
          // quem decidiu foi o usuário, não o OCR — e o histórico precisa dizer isso.
          ...(body.card_id
            ? { status: 'identified' as const, identificationMethod: 'manual' as const }
            : {}),
          // Idioma corrigido à mão deixa de ser "detectado automaticamente" (FR-067).
          ...(body.language ? { languageDetected: false } : {}),
        },
        include: includeCard,
      });
      return { capture: serializeCapture(capture) };
    },
  );

  app.delete(
    '/scan/sessions/:id/captures/:captureId',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { id, captureId } = req.params as { id: string; captureId: string };
      await openSession(req.user!.id, id);
      const existing = await prisma.scanCapture.findFirst({
        where: { id: captureId, sessionId: id },
      });
      if (!existing) throw notFound('captura não encontrada');
      await prisma.scanCapture.delete({ where: { id: captureId } });
      reply.status(204);
      return null;
    },
  );

  /** Resumo estatístico da revisão (FR-057). */
  app.get('/scan/sessions/:id/summary', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await ownedSession(req.user!.id, id);

    const captures = await prisma.scanCapture.findMany({
      where: { sessionId: id },
      include: includeCard,
    });
    const cardIds = [
      ...new Set(captures.map((c) => c.cardId).filter((v): v is string => v != null)),
    ];

    const [prices, wishlistItems] = await Promise.all([
      cardIds.length
        ? prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
        : Promise.resolve([]),
      cardIds.length
        ? prisma.wishlistItem.findMany({
            where: { cardId: { in: cardIds }, wishlist: { userId: req.user!.id } },
            select: { cardId: true },
          })
        : Promise.resolve([]),
    ]);

    const pricesByCard = new Map<string, PriceLike[]>();
    for (const p of prices) {
      const list = pricesByCard.get(p.cardId) ?? [];
      list.push(p);
      pricesByCard.set(p.cardId, list);
    }

    const summaryCaptures: SummaryCapture[] = captures.map((c) => ({
      cardId: c.cardId,
      quantity: c.quantity,
      condition: c.condition,
      variant: c.variant,
      rarity: c.card?.rarity ?? '',
      setName: c.card?.set.name ?? '',
      cardName: (c.card ? localize(c.card.translations, displayLang(c))?.name : null) ?? '',
    }));

    return computeSummary(
      summaryCaptures,
      pricesByCard,
      new Set(wishlistItems.map((w) => w.cardId)),
    );
  });

  /** Grava na coleção (FR-058) + pergunta de wishlist (FR-052). */
  app.post('/scan/sessions/:id/confirm', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await openSession(req.user!.id, id);
    return confirmSession(prisma, req.user!.id, id);
  });

  app.post('/scan/sessions/:id/discard', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await openSession(req.user!.id, id);
    // Descartar não apaga a sessão: as capturas somem por cascade só se a sessão sumir, e o
    // histórico do que foi escaneado e jogado fora é barato de manter.
    const session = await prisma.scanSession.update({
      where: { id },
      data: { status: 'discarded', discardedAt: new Date() },
    });
    return serializeSession(session);
  });
}
