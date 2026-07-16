import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../lib/config.js';
import { OcrCardIdentifier, StubCardIdentifier } from './identifier.js';
import { TesseractOcrEngine } from './tesseract.js';
import type { CardIdentifier } from './types.js';

export type { CardCandidate, CardIdentifier, IdentifyResult, OcrEngine, OcrText } from './types.js';
export { OcrCardIdentifier, StubCardIdentifier } from './identifier.js';
export { StubOcrEngine, TesseractOcrEngine } from './tesseract.js';
export { nameCandidates, normalizeNumber, parseCardNumber } from './text.js';
export { scoreOf } from './catalog-lookup.js';

/**
 * Nos testes o identificador é o stub: o OCR real carrega ~10MB de dados de idioma e leva
 * segundos por captura — a suíte de integração testa o fluxo de sessões, não o Tesseract.
 */
export function createCardIdentifier(
  config: AppConfig,
  prisma: PrismaClient,
  logger?: { warn: (msg: string) => void },
): CardIdentifier {
  if (config.NODE_ENV === 'test') return new StubCardIdentifier();
  return new OcrCardIdentifier(prisma, new TesseractOcrEngine({ logger }), {
    threshold: config.SCANNER_CONFIDENCE_THRESHOLD,
  });
}
