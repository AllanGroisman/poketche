import type { FastifyInstance } from 'fastify';
import { registerScannerRoutes, type ScannerDeps } from './routes.js';

/**
 * Módulo do scanner (US5): sessões, capturas, revisão e confirmação. A identificação em si mora
 * atrás de `CardIdentifier` (integrations/identifier/) — trocar o motor de OCR, ou mover o
 * pipeline para o aparelho, não toca nada aqui (constituição V, research.md §3).
 */
export function registerScanner(app: FastifyInstance, deps: ScannerDeps): void {
  registerScannerRoutes(app, deps);
}

export { confirmSession } from './confirm.js';
export { computeSummary, type ScanSummary, type SummaryCapture } from './summary.js';
export type { ScannerDeps } from './routes.js';
