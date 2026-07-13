import type { CardTranslation, Language } from '@prisma/client';

/**
 * Seleção da tradução de exibição (FR-011): idioma pedido/do item quando disponível,
 * senão fallback para EN, senão a primeira existente. Centraliza a regra para busca,
 * coleção e explorador.
 */

export interface LocalizedCard {
  translation_id: string;
  language: Language;
  name: string;
  image_small_url: string;
  image_large_url: string;
}

/** Caminho do proxy de imagens (T018), relativo ao prefixo /api/v1. */
export function imageProxyPath(translationId: string, size: 'small' | 'large'): string {
  return `/catalog/images/${translationId}/${size}`;
}

export function localize(
  translations: Pick<CardTranslation, 'id' | 'language' | 'name'>[],
  preferred: Language,
): LocalizedCard | null {
  const chosen =
    translations.find((t) => t.language === preferred) ??
    translations.find((t) => t.language === 'en') ??
    translations[0];
  if (!chosen) return null;
  return {
    translation_id: chosen.id,
    language: chosen.language,
    name: chosen.name,
    image_small_url: imageProxyPath(chosen.id, 'small'),
    image_large_url: imageProxyPath(chosen.id, 'large'),
  };
}
