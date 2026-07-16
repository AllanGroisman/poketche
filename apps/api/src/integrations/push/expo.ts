import type { PushMessage, PushProvider, PushSendResult } from './types.js';

/**
 * `PushProvider` sobre o Expo Push Service (T062). O envio é resiliente por desenho: push é
 * acessório ao ciclo de cotações (constituição V) — uma falha aqui **não** pode derrubar o job
 * `wishlist-alerts` nem impedir a gravação do estado dos alertas. Erros viram `failed`, nunca
 * exceção.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** O Expo aceita no máximo 100 mensagens por requisição. */
const CHUNK_SIZE = 100;

/** Resposta do Expo: um ticket por mensagem, na mesma ordem do envio. */
interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export type PushHttp = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface ExpoPushOptions {
  accessToken?: string;
  /** Injetável para os testes; default `fetch` global (Node 22). */
  http?: PushHttp;
  logger?: { warn: (msg: string) => void };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class ExpoPushProvider implements PushProvider {
  private readonly http: PushHttp;

  constructor(private readonly options: ExpoPushOptions = {}) {
    this.http = options.http ?? ((url, init) => fetch(url, init));
  }

  async send(messages: PushMessage[]): Promise<PushSendResult> {
    const result: PushSendResult = { sent: 0, failed: 0, invalidTokens: [] };
    if (messages.length === 0) return result;

    for (const batch of chunk(messages, CHUNK_SIZE)) {
      try {
        const res = await this.http(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(this.options.accessToken
              ? { authorization: `Bearer ${this.options.accessToken}` }
              : {}),
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          result.failed += batch.length;
          this.options.logger?.warn(`expo push HTTP ${res.status} (${batch.length} mensagens)`);
          continue;
        }
        const body = (await res.json()) as { data?: ExpoTicket[] };
        const tickets = body.data ?? [];
        batch.forEach((msg, i) => {
          const ticket = tickets[i];
          if (!ticket || ticket.status === 'error') {
            result.failed++;
            // Aparelho que desinstalou o app: o token nunca mais funciona (limpar).
            if (ticket?.details?.error === 'DeviceNotRegistered') result.invalidTokens.push(msg.to);
          } else {
            result.sent++;
          }
        });
      } catch (err) {
        result.failed += batch.length;
        this.options.logger?.warn(
          `expo push indisponível: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return result;
  }
}

/** Sem credencial de push configurada: descarta silenciosamente (dev/testes). */
export class NoopPushProvider implements PushProvider {
  readonly sentMessages: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<PushSendResult> {
    this.sentMessages.push(...messages);
    return { sent: messages.length, failed: 0, invalidTokens: [] };
  }
}
