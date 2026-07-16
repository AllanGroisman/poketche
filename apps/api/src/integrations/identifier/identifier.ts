import type { PrismaClient } from '@prisma/client';
import { lookupCard } from './catalog-lookup.js';
import { nameCandidates, parseCardNumber } from './text.js';
import type { CardIdentifier, IdentifyResult, OcrEngine } from './types.js';

/**
 * `CardIdentifier` OCR-first (T068, research.md §3): lê o crop inteiro, extrai nome e número, e
 * casa contra o catálogo. Abaixo do limiar a captura vira "a revisar" com os candidatos — o
 * comportamento que o FR-023/FR-060 pedem e que absorve foil, reflexo e texto ilegível sem
 * inventar identificação.
 */

export interface OcrIdentifierOptions {
  /** Confiança mínima para dar a carta por identificada. Abaixo disso: "a revisar". */
  threshold: number;
}

export class OcrCardIdentifier implements CardIdentifier {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ocr: OcrEngine,
    private readonly options: OcrIdentifierOptions,
  ) {}

  async identify(crop: Buffer): Promise<IdentifyResult> {
    const text = await this.ocr.recognize(crop);
    const number = parseCardNumber(text.lines);
    const names = nameCandidates(text.lines);

    const { candidates } = await lookupCard(this.prisma, names, number);
    const best = candidates[0] ?? null;
    const identified = best != null && best.confidence >= this.options.threshold;

    return {
      card: identified ? best : null,
      candidates,
      // Sem identificação o idioma é chute — a tradução casada pode ser a EN de uma carta PT.
      // FR-067: assume `en` e marca como não detectado, para a revisão ajustar.
      language: identified ? best.language : 'en',
      languageDetected: identified,
      variant: 'normal',
      confidence: best?.confidence ?? 0,
      method: 'ocr',
    };
  }
}

/**
 * Identificador controlado pelos testes, no mesmo espírito do `NoopPushProvider`: o teste enfileira
 * o resultado e assere o efeito, sem depender do OCR real nem do conteúdo do catálogo.
 */
export class StubCardIdentifier implements CardIdentifier {
  readonly received: Buffer[] = [];
  private queue: IdentifyResult[] = [];

  /** Nada identificado — o mesmo que o OCR devolve quando não lê a carta. */
  private static unidentified(): IdentifyResult {
    return {
      card: null,
      candidates: [],
      language: 'en',
      languageDetected: false,
      variant: 'normal',
      confidence: 0,
      method: 'ocr',
    };
  }

  enqueue(result: Partial<IdentifyResult>): void {
    this.queue.push({ ...StubCardIdentifier.unidentified(), ...result });
  }

  async identify(crop: Buffer): Promise<IdentifyResult> {
    this.received.push(crop);
    return this.queue.shift() ?? StubCardIdentifier.unidentified();
  }

  /** Um resultado enfileirado e não consumido vazaria para o teste seguinte. */
  reset(): void {
    this.queue = [];
    this.received.length = 0;
  }
}
