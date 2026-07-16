import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { apiRequest } from './api';

/**
 * Registro do aparelho para notificações de preço-alvo (T062, FR-046).
 *
 * Push é acessório: se a permissão for negada, o app segue inteiro — os indicadores de "atingiu
 * o alvo" continuam nas telas (FR-048/FR-049). Por isso nada aqui lança: falhar em registrar não
 * pode quebrar a abertura do app.
 */

/** Notificação recebida com o app aberto ainda deve aparecer. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken(): Promise<string | null> {
  try {
    // Emulador/simulador não emite token — não adianta pedir permissão.
    if (!Device_isPhysical()) return null;

    const existing = await Notifications.getPermissionsAsync();
    const status =
      existing.status === 'granted'
        ? existing.status
        : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    // Android exige um canal para exibir notificações.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Alertas de preço',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await apiRequest('/me/push-tokens', {
      method: 'POST',
      body: { expo_token: token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    return token;
  } catch {
    // Sem push, o app continua utilizável — silencioso de propósito.
    return null;
  }
}

/** `expo-device` não é dependência do projeto; `isDevice` do Constants basta aqui. */
function Device_isPhysical(): boolean {
  return Constants.isDevice ?? true;
}
