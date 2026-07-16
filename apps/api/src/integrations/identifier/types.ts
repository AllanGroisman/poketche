import type { IdentificationMethod, Language, Variant } from '@prisma/client';

/**
 * Identificação de carta isolada atrás de interface (constituição V — T068). O fluxo de sessões
 * fala `CardIdentifier`: trocar o motor de OCR, ou mover o pipeline para o aparelho, não toca
 * sessões, molduras, feedback nem gravação.
 *
 * Decisão do spike T066 (research.md §3): o **alvo é híbrido** (ML Kit on-device → fallback
 * backend); o MVP entrega só a camada backend, que é a própria camada de fallback do alvo. É por
 * isso que a interface recebe o crop já recortado — no dia em que a etapa on-device entrar, ela
 * resolve o que conseguir e delega o resto para cá, sem mudar este contrato.
 */

/** Motor de OCR — a peça de terceiro de fato. `TesseractOcrEngine` hoje, trocável isolada. */
export interface OcrEngine {
  recognize(image: Buffer): Promise<OcrText>;
}

export interface OcrText {
  /** Linhas de texto reconhecidas, na ordem em que aparecem na imagem. */
  lines: string[];
  /** Confiança média do motor (0..1) — sinal do OCR, não da identificação. */
  confidence: number;
}

export interface CardCandidate {
  cardId: string;
  name: string;
  number: string;
  setName: string;
  language: Language;
  /** 0..1 — o quanto esta carta explica o texto lido. */
  confidence: number;
}

export interface IdentifyResult {
  /** Carta resolvida acima do limiar, ou `null` → a captura entra como "a revisar" (FR-023). */
  card: CardCandidate | null;
  /** Top-N alternativas para a tela de revisão (FR-060), melhor primeiro. */
  candidates: CardCandidate[];
  /**
   * Idioma da tradução casada. Quando não determinável com confiança, **assume `en`** e marca
   * `languageDetected: false` — o default que o FR-067 manda, ajustável na revisão. É por isso
   * que este campo não é nulo: a captura sempre nasce com um idioma utilizável.
   */
  language: Language;
  languageDetected: boolean;
  /**
   * Sempre `normal` no MVP. O OCR **não distingue** reverse foil de normal: mesma carta canônica,
   * mesmo `(set, number)`, texto idêntico — a distinção é visual. Caso obrigatório do T066,
   * resolvido por ajuste na revisão, igual ao idioma indeterminado.
   */
  variant: Variant;
  confidence: number;
  method: IdentificationMethod;
}

export interface CardIdentifier {
  identify(crop: Buffer): Promise<IdentifyResult>;
}
