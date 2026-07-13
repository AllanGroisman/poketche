/**
 * Formatação de exibição. Valores monetários chegam da API em centavos inteiros
 * (constituição IV) — aqui só convertemos para texto; nenhuma aritmética de dinheiro.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos inteiros → "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}

/** Diferença em centavos → "+R$ 10,00" / "-R$ 5,00" (com sinal). */
export function formatBRLDelta(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${formatBRL(Math.abs(cents))}`;
}

/** Fração (0.1234) → "+12,3%" com sinal. */
export function formatPercentDelta(fraction: number): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** ISO → "14/08/2020". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

/** ISO → "há 3 dias" / "agora" (aproximado, para timestamps de cotação). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '—';
  const diffMs = now.getTime() - then.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
