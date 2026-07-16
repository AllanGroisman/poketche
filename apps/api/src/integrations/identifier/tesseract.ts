import type { OcrEngine, OcrText } from './types.js';

/**
 * `OcrEngine` sobre o tesseract.js (decisão do spike T066 — research.md §3): self-hosted, sem
 * credencial e sem custo por captura, o que destrava a US5 sem depender de configuração externa.
 *
 * O que se sabe do risco: a precisão em fonte estilizada e foil é o ponto fraco conhecido do
 * Tesseract, e o SC-006 (≥ 80%) só é medido no Independent Test em aparelho físico. Se não bater,
 * a troca é deste arquivo — `CardIdentifier` e todo o fluxo de sessões ficam intactos. É
 * literalmente o motivo de a interface existir.
 */

/** `por+eng` num passe só: o scanner não sabe o idioma da carta antes de ler (FR-067). */
const LANGS = 'por+eng';

export interface TesseractOptions {
  logger?: { warn: (msg: string) => void };
}

/** Só o que este adapter usa do worker do tesseract.js — não o tipo inteiro da lib. */
interface TesseractWorker {
  recognize(image: Buffer): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
}

export class TesseractOcrEngine implements OcrEngine {
  /**
   * O worker carrega ~10MB de dados de idioma na primeira chamada. Criar um por captura jogaria
   * esse custo em cima do SC-006a (≤ 2s), então ele é criado uma vez e reusado — a promise é
   * memoizada para que capturas concorrentes no mesmo boot não iniciem dois carregamentos.
   */
  private worker: Promise<TesseractWorker> | null = null;

  constructor(private readonly options: TesseractOptions = {}) {}

  private getWorker(): Promise<TesseractWorker> {
    const existing = this.worker;
    if (existing) return existing;
    const created = import('tesseract.js').then((m) => m.createWorker(LANGS));
    this.worker = created;
    return created;
  }

  async recognize(image: Buffer): Promise<OcrText> {
    try {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(image);
      return {
        lines: data.text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        // O tesseract reporta confiança em 0..100.
        confidence: data.confidence / 100,
      };
    } catch (err) {
      // OCR indisponível não pode derrubar a sessão: a captura vira "a revisar" e o usuário
      // resolve na tela de revisão, que já existe para isso.
      this.options.logger?.warn(
        `OCR indisponível: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { lines: [], confidence: 0 };
    }
  }

  async close(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    if (w) await (await w).terminate();
  }
}

/** Motor de OCR controlado pelos testes: devolve as linhas que o teste enfileirar. */
export class StubOcrEngine implements OcrEngine {
  readonly received: Buffer[] = [];
  private queue: OcrText[] = [];

  /** Enfileira o resultado da próxima captura. Sem fila, devolve texto vazio ("a revisar"). */
  enqueue(lines: string[], confidence = 0.9): void {
    this.queue.push({ lines, confidence });
  }

  async recognize(image: Buffer): Promise<OcrText> {
    this.received.push(image);
    return this.queue.shift() ?? { lines: [], confidence: 0 };
  }
}
