/* Formatação e parsing pt-BR.
   Nomes explícitos de propósito: `dec` formata, `parseBR` interpreta.
   (Os dois arquivos originais chamavam ambas as coisas de `num`.) */

const safe = (v) => (Number.isFinite(v) ? v : 0);

/** 1234.5 → "1.234,50" */
export const dec = (v, d = 2) =>
  safe(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Como `dec`, mas sem casas decimais à toa: 730 → "730", 1234.5 → "1.234,5" */
export const decAuto = (v, d = 2) =>
  safe(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d });

export const brl = (v, d = 2) =>
  safe(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

/** Recebe o valor JÁ em pontos percentuais: pct(15) → "15,00%" */
export const pct = (v, d = 2) => dec(v, d) + '%';

/** Recebe o valor em decimal: pctOf(0.15) → "15,00%" */
export const pctOf = (v, d = 2) => pct(safe(v) * 100, d);

/** Aceita vírgula ou ponto como separador decimal. Devolve NaN se não der. */
export const parseBR = (s) => {
  if (s == null) return NaN;
  const x = String(s).trim().replace(',', '.');
  if (x === '' || x === '-' || x === '.' || x === '-.') return NaN;
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : NaN;
};

/** Como `parseBR`, mas com piso em vez de NaN — para campos que nunca podem ficar vazios. */
export const parseBROr = (s, fallback = 0) => {
  const n = parseBR(s);
  return Number.isFinite(n) ? n : fallback;
};

/** Um número virando rascunho de input: 1234.5 → "1234,5" */
export const toDraft = (v) => (Number.isFinite(v) ? String(v).replace('.', ',') : '');

/** O que o usuário pode digitar num campo decimal, enquanto digita. */
export const VALID_DECIMAL = /^-?\d*(?:[.,]\d*)?$/;

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Mata o lixo de ponto flutuante que aparece ao somar passos: 0.30000000000000004 → 0.3 */
export const snap = (n) => Math.round(n * 1e6) / 1e6;
