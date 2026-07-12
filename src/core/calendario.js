/* Calendário: datas em UTC puro (sem fuso, sem horário de verão) e dias úteis
   pelo calendário ANBIMA. */

export const MIN_D = 30;
export const MAX_D = 7300; /* 20 anos */

export const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);
export const ymd = (dt) => dt.toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);
export const fmtDate = (dt) => dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/** Hoje, zerado e normalizado em UTC. */
export const hojeUTC = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

/** Soma meses de calendário, grudando no último dia quando o mês destino é curto
    (31/jan + 1 mês = 28/fev, não 03/mar). */
export const addMonths = (dt, m) => {
  const alvo = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + m, 1));
  const y = alvo.getUTCFullYear();
  const mo = alvo.getUTCMonth();
  const ultimo = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(dt.getUTCDate(), ultimo)));
};

/** Quantos dias corridos de calendário cabem em N meses, contados a partir de `base`.
    12 meses NÃO são 360 dias — são 365 (ou 366). É essa diferença que muda a faixa do IR. */
export const diasCorridosEmMeses = (meses, base = hojeUTC()) =>
  diffDays(base, addMonths(base, meses));

/* Feriados nacionais (Resolução CMN 4.880 / calendário ANBIMA).
   Móveis derivados da Páscoa: Carnaval (−48/−47), Sexta-feira Santa (−2), Corpus Christi (+60). */
const easter = (y) => {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mo - 1, da));
};

export const holidaysFor = (y) => {
  const p = easter(y);
  const s = new Set([
    `${y}-01-01`, `${y}-04-21`, `${y}-05-01`, `${y}-09-07`,
    `${y}-10-12`, `${y}-11-02`, `${y}-11-15`, `${y}-12-25`,
  ]);
  if (y >= 2024) s.add(`${y}-11-20`); /* Consciência Negra — Lei 14.759/2023 */
  s.add(ymd(addDays(p, -48))); /* Carnaval (segunda) */
  s.add(ymd(addDays(p, -47))); /* Carnaval (terça)   */
  s.add(ymd(addDays(p, -2)));  /* Sexta-feira Santa  */
  s.add(ymd(addDays(p, 60)));  /* Corpus Christi     */
  return s;
};

/** Dias úteis acumulados de `base` até `base + i` dias, para todo i em [0, MAX_D].
    Conta o intervalo (base, base+i] — o dia da aplicação não rende, o do vencimento sim. */
export const acumuladoDiasUteis = (base) => {
  const y0 = base.getUTCFullYear();
  const feriados = new Set();
  for (let y = y0; y <= y0 + 21; y++) holidaysFor(y).forEach((h) => feriados.add(h));

  const cum = new Int32Array(MAX_D + 1);
  let acc = 0;
  for (let i = 1; i <= MAX_D; i++) {
    const dt = addDays(base, i);
    const w = dt.getUTCDay();
    if (w !== 0 && w !== 6 && !feriados.has(ymd(dt))) acc++;
    cum[i] = acc;
  }
  return cum;
};
