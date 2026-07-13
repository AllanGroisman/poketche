import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../auth/plugin.js';

/**
 * Serviço de conta: provisionamento preguiçoso do perfil (a fonte de identidade é o
 * Supabase Auth; a primeira requisição autenticada cria o `UserProfile` + visibilidade
 * privada por padrão — FR-003) e geração de token de compartilhamento não adivinhável.
 */

function seedDisplayName(user: AuthUser): string {
  const local = user.email?.split('@')[0]?.trim();
  return local && local.length > 0 ? local : 'Treinador';
}

/** Token opaco de 32 bytes em base64url — não sequencial, não adivinhável (FR-003b). */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Garante o perfil e a linha de visibilidade (privada) do usuário autenticado.
 * Idempotente: cria na primeira vez, retorna nas seguintes.
 */
export async function ensureProfile(prisma: PrismaClient, user: AuthUser): Promise<void> {
  await prisma.userProfile.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id, displayName: seedDisplayName(user) },
  });
  await prisma.collectionVisibility.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, status: 'private' },
  });
}
