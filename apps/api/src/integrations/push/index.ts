import type { AppConfig } from '../../lib/config.js';
import { ExpoPushProvider, NoopPushProvider } from './expo.js';
import type { PushProvider } from './types.js';

export type { PushMessage, PushProvider, PushSendResult } from './types.js';
export { ExpoPushProvider, NoopPushProvider, chunk, type PushHttp } from './expo.js';

/**
 * O Expo aceita envios sem access token (projetos sem "enhanced security"), então a ausência de
 * `EXPO_ACCESS_TOKEN` **não** desliga o push — só o envia sem credencial. O provider noop fica
 * para testes e para quem quiser silenciar o canal explicitamente.
 */
export function createPushProvider(
  config: AppConfig,
  logger?: { warn: (msg: string) => void },
): PushProvider {
  if (config.NODE_ENV === 'test') return new NoopPushProvider();
  return new ExpoPushProvider({ accessToken: config.EXPO_ACCESS_TOKEN, logger });
}
