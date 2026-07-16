/**
 * Adapter de push isolado (constituição V — T062). O domínio fala `PushProvider`; trocar o
 * Expo por outro serviço não toca em job nem em rota.
 */

export interface PushMessage {
  /** Token Expo do dispositivo destino (`ExponentPushToken[...]`). */
  to: string;
  title: string;
  body: string;
  /** Payload de deep link consumido pelo app ao tocar na notificação. */
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  /**
   * Tokens que o provedor reportou como inválidos (`DeviceNotRegistered`) — o chamador os
   * remove para não insistir em aparelhos que desinstalaram o app.
   */
  invalidTokens: string[];
}

export interface PushProvider {
  send(messages: PushMessage[]): Promise<PushSendResult>;
}
