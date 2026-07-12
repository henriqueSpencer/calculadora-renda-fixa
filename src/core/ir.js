/* Imposto de renda sobre renda fixa e as equivalências de taxa.
   Fonte única da verdade para as duas calculadoras. */

/* Lei 11.033/2004 — tabela regressiva.
   Os cortes são de CALENDÁRIO: dias corridos, não dias úteis nem "meses × 30". */
export const FAIXAS_IR = [
  { faixa: 'Até 180 dias',      intervalo: '0 – 180 dias',     aliq: 22.5 },
  { faixa: 'De 181 a 360 dias', intervalo: '181 – 360 dias',   aliq: 20.0 },
  { faixa: 'De 361 a 720 dias', intervalo: '361 – 720 dias',   aliq: 17.5 },
  { faixa: 'Acima de 720 dias', intervalo: '721 dias ou mais', aliq: 15.0 },
];

export const faixaIndex = (diasCorridos) =>
  diasCorridos <= 180 ? 0 : diasCorridos <= 360 ? 1 : diasCorridos <= 720 ? 2 : 3;

/** Alíquota em decimal (0.225, 0.20, 0.175, 0.15) a partir dos dias CORRIDOS. */
export const aliquotaIR = (diasCorridos) => FAIXAS_IR[faixaIndex(diasCorridos)].aliq / 100;

/* IOF regressivo — Decreto 6.306/2007, Anexo I ("IOF/Títulos").
   Morde o RENDIMENTO (nunca o principal) e só existe nos 29 primeiros dias:
   96% no 1º dia, caindo ~3 pontos por dia, 3% no 29º, e ZERO do 30º em diante.
   É por isso que ninguém fala dele: quase todo título de renda fixa é resgatado
   depois disso. Mas num CDB de liquidez diária sacado em duas semanas, ele come
   metade do rendimento.

   O IOF independe da isenção de IR: LCI/LCA/CRI/CRA são isentas de imposto de
   RENDA, não de IOF. Na prática esses papéis têm carência maior que 30 dias, o
   que torna o ponto acadêmico — mas a conta é a conta. */
export const aliquotaIOF = (diasCorridos) => {
  const d = Math.floor(diasCorridos);
  if (d >= 30) return 0;
  if (d <= 1) return 0.96;
  return Math.floor((100 * (30 - d)) / 30) / 100;
};

/** A mordida total sobre o rendimento: IOF primeiro, IR sobre o que sobrou.
    Não é iof + ir — é 1 − (1−iof)(1−ir), porque o IR incide sobre a base já
    reduzida pelo IOF. */
export const aliquotaEfetiva = (diasCorridos, isentoIR) => {
  const iof = aliquotaIOF(diasCorridos);
  const ir = isentoIR ? 0 : aliquotaIR(diasCorridos);
  return 1 - (1 - iof) * (1 - ir);
};

/**
 * Taxa BRUTA a.a. que, depois do IR cobrado uma única vez no resgate, entrega
 * exatamente a taxa líquida `iLiq` a.a. ao longo de `anos`:
 *
 *   (1 + i_liq)^n = 1 + [(1 + i_bruto)^n − 1] · (1 − α)
 *
 * Não é i_liq / (1 − α). Essa regra de bolso só é exata em n = 1, porque o
 * imposto morde o rendimento acumulado, não a taxa de cada período.
 */
export const brutoEquivalente = (iLiq, anos, aliq) => {
  if (aliq <= 0) return iLiq; /* isento: o bruto é o próprio líquido */
  if (aliq >= 1 || anos <= 0) return NaN;
  const fator = 1 + (Math.pow(1 + iLiq, anos) - 1) / (1 - aliq);
  return fator <= 0 ? NaN : Math.pow(fator, 1 / anos) - 1;
};

/** A regra de bolso que todo mundo usa — exposta para poder mostrar o quanto ela erra. */
export const regraDeBolso = (iLiq, aliq) => iLiq / (1 - aliq);

/** Desconta a inflação de uma taxa nominal (Fisher). */
export const deflate = (nominal, ipcaDec) => (1 + nominal) / Math.max(1e-6, 1 + ipcaDec) - 1;

/**
 * Um título, do bruto ao bolso.
 *   `i`      taxa bruta a.a.
 *   `dias`   dias CORRIDOS até o resgate → define a alíquota
 *   `anos`   prazo no relógio da capitalização (du/252 ou dc/365) → define o juro
 * São dois relógios diferentes de propósito: é assim que a lei e o mercado funcionam.
 */
export const liquidar = ({ i, isento, dias, anos, capital, ipcaDec }) => {
  const n = Math.max(1e-6, anos);
  const fatorBruto = Math.pow(1 + i, n);
  const fatorRendBruto = fatorBruto - 1;

  /* A ordem importa: o IOF morde primeiro, e o IR incide sobre o que sobrou. */
  const iofDec = aliquotaIOF(dias);
  const aliqDec = isento ? 0 : aliquotaIR(dias);
  const efetivaDec = 1 - (1 - iofDec) * (1 - aliqDec);

  const fatorRendLiq = fatorRendBruto * (1 - efetivaDec);
  const fatorLiq = 1 + fatorRendLiq;
  const txLiqAno = Math.pow(fatorLiq, 1 / n) - 1;

  const rendBruto = capital * fatorRendBruto;
  const iofReais = rendBruto * iofDec;
  const irReais = (rendBruto - iofReais) * aliqDec;
  const rendLiq = rendBruto - iofReais - irReais;

  return {
    i, isento, t: n,
    fatorBruto, fatorRendBruto, fatorRendLiq, fatorLiq,
    aliqDec, aliqPct: aliqDec * 100,
    iofDec, iofPct: iofDec * 100,
    efetivaDec, efetivaPct: efetivaDec * 100,
    txLiqAno,
    txLiqRealAno: deflate(txLiqAno, ipcaDec),
    montanteBruto: capital * fatorBruto,
    rendBruto, iofReais, irReais, rendLiq,
    montanteLiq: capital + rendLiq,
  };
};
