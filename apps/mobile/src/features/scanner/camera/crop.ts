import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Recorta a foto para a região da moldura-guia e devolve JPEG em base64 (T070, FR-021).
 *
 * A abordagem é a de **moldura fixa**: não há detecção de borda em tempo real (fora do MVP,
 * decisão do T066). A moldura na tela ocupa uma fração conhecida da largura, no formato de uma
 * carta; recortamos a foto na mesma fração central. Não mapeamos coordenadas preview↔foto (a
 * pré-visualização usa `cover` e escalas diferem): recortar por fração central com a proporção da
 * carta é robusto e tolera a folga da moldura, que é generosa de propósito.
 *
 * Depois reduzimos a largura e comprimimos: o backend limita o tamanho do crop, e o OCR não ganha
 * nada com resolução acima do texto do número/nome.
 */

/** Proporção de uma carta física (63 × 88 mm) — largura ÷ altura. */
export const CARD_ASPECT = 63 / 88;

/** Fração da largura da tela/foto que a moldura ocupa. Espelhado pelo overlay da câmera. */
export const GUIDE_WIDTH_FRACTION = 0.86;

/** Teto de altura do crop como fração da foto, para a moldura nunca encostar nas bordas. */
const GUIDE_MAX_HEIGHT_FRACTION = 0.94;

/** Largura máxima enviada: acima disto o OCR não melhora e o payload só cresce. */
const MAX_CROP_WIDTH = 1000;

/**
 * Retângulo central (em pixels da foto) equivalente à moldura desenhada na tela.
 *
 * Orientação-agnóstico de propósito: o `takePhoto` pode devolver o buffer em landscape (dimensões
 * do sensor) mesmo com o telefone em pé. Em vez de assumir portrait, alinhamos o **lado maior da
 * carta ao lado maior do buffer** — o palpite certo tanto para um buffer portrait quanto para um
 * landscape rotacionado por EXIF —, depois mapeamos de volta para os eixos reais (W/H) da foto.
 */
export function guideCropRect(
  photoW: number,
  photoH: number,
): { originX: number; originY: number; width: number; height: number } {
  const longSide = Math.max(photoW, photoH);
  const shortSide = Math.min(photoW, photoH);

  // Carta em pé: a altura ocupa quase todo o lado maior; a largura sai da proporção no lado menor.
  let cardLong = Math.round(longSide * GUIDE_MAX_HEIGHT_FRACTION);
  let cardShort = Math.round(cardLong * CARD_ASPECT);
  if (cardShort > shortSide * GUIDE_WIDTH_FRACTION) {
    cardShort = Math.round(shortSide * GUIDE_WIDTH_FRACTION);
    cardLong = Math.round(cardShort / CARD_ASPECT);
  }

  const width = photoH >= photoW ? cardShort : cardLong;
  const height = photoH >= photoW ? cardLong : cardShort;
  return {
    originX: Math.round((photoW - width) / 2),
    originY: Math.round((photoH - height) / 2),
    width,
    height,
  };
}

/** Foto do vision-camera (`path`, sem esquema) → base64 do crop da carta. */
export async function cropCardToBase64(
  photoPath: string,
  photoW: number,
  photoH: number,
): Promise<string> {
  const rect = guideCropRect(photoW, photoH);
  const uri = photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`;

  const ref = await ImageManipulator.manipulate(uri)
    .crop(rect)
    .resize({ width: Math.min(rect.width, MAX_CROP_WIDTH) })
    .renderAsync();
  const result = await ref.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });

  if (!result.base64) throw new Error('falha ao processar a imagem');
  return result.base64;
}
