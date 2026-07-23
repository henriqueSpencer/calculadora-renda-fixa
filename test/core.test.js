import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FAIXAS_IR, aliquotaIR, aliquotaIOF, aliquotaEfetiva,
  brutoEquivalente, regraDeBolso, deflate, liquidar, IR_SMART_SELIC,
} from '../src/core/ir.js';
import { diasCorridosEmMeses, acumuladoDiasUteis, addMonths, diffDays } from '../src/core/calendario.js';

const perto = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `esperava ${b}, veio ${a} (dif ${Math.abs(a - b)})`);

test('IR: os cortes da tabela caem exatamente onde a lei diz', () => {
  assert.equal(aliquotaIR(1), 0.225);
  assert.equal(aliquotaIR(180), 0.225);
  assert.equal(aliquotaIR(181), 0.20);
  assert.equal(aliquotaIR(360), 0.20);
  assert.equal(aliquotaIR(361), 0.175);
  assert.equal(aliquotaIR(720), 0.175);
  assert.equal(aliquotaIR(721), 0.15);
  assert.equal(aliquotaIR(7300), 0.15);
  assert.equal(FAIXAS_IR.length, 4);
});

test('calendário: um ano tem 365 dias, não 360 — e isso muda a faixa do IR', () => {
  for (const base of [new Date(Date.UTC(2026, 6, 12)), new Date(Date.UTC(2027, 0, 31))]) {
    const d12 = diasCorridosEmMeses(12, base);
    assert.ok(d12 === 365 || d12 === 366, `12 meses deram ${d12} dias`);
    assert.equal(aliquotaIR(d12), 0.175, '1 ano cai em 17,5% — não nos 20% do "meses × 30"');

    const d24 = diasCorridosEmMeses(24, base);
    assert.ok(d24 >= 730 && d24 <= 731, `24 meses deram ${d24} dias`);
    assert.equal(aliquotaIR(d24), 0.15, '2 anos caem em 15% — não nos 17,5% do "meses × 30"');
  }
});

test('calendário: addMonths gruda no último dia quando o mês destino é curto', () => {
  const jan31 = new Date(Date.UTC(2027, 0, 31));
  assert.equal(addMonths(jan31, 1).toISOString().slice(0, 10), '2027-02-28');
  assert.equal(addMonths(jan31, 13).toISOString().slice(0, 10), '2028-02-29'); // bissexto
});

test('brutoEquivalente é a inversa exata de liquidar', () => {
  for (const i of [0.05, 0.1069, 0.15, 0.22]) {
    for (const anos of [0.5, 1, 2, 5, 20]) {
      for (const dias of [90, 200, 500, 1500]) {
        const c = liquidar({ i, isento: false, dias, anos, capital: 1000, ipcaDec: 0.045 });
        const volta = brutoEquivalente(c.txLiqAno, anos, aliquotaIR(dias));
        perto(volta, i, 1e-12);
      }
    }
  }
});

test('a regra de bolso só acerta em exatamente 1 ano', () => {
  const iLiq = 0.1069, aliq = 0.15;
  perto(regraDeBolso(iLiq, aliq), brutoEquivalente(iLiq, 1, aliq), 1e-12);

  // em 5 anos ela exagera: pede uma taxa maior do que a necessária
  assert.ok(regraDeBolso(iLiq, aliq) > brutoEquivalente(iLiq, 5, aliq) + 0.001);
});

test('isento: o bruto é o próprio líquido', () => {
  perto(brutoEquivalente(0.12, 3, 0), 0.12);
  const c = liquidar({ i: 0.12, isento: true, dias: 1000, anos: 3, capital: 1000, ipcaDec: 0 });
  perto(c.txLiqAno, 0.12, 1e-12);
  assert.equal(c.irReais, 0);
});

test('a prova do FII: os três param no mesmo centavo', () => {
  const dy = 0.0085;                       // 0,85% ao mês
  const iFII = Math.pow(1 + dy, 12) - 1;   // já líquido: FII de PF não paga IR
  const meses = 60;
  const anos = meses / 12;
  const aliq = aliquotaIR(diasCorridosEmMeses(meses, new Date(Date.UTC(2026, 6, 12))));

  const BASE = 1000;
  const fii = BASE * Math.pow(1 + dy, meses);
  const isento = BASE * Math.pow(1 + iFII, anos);

  const iBruto = brutoEquivalente(iFII, anos, aliq);
  const bruto = BASE * Math.pow(1 + iBruto, anos);
  const tributadoLiq = bruto - (bruto - BASE) * aliq;

  perto(fii, isento, 1e-9);
  perto(tributadoLiq, isento, 1e-9);
});

test('a conferência embutida do comparador: isento em IPCA+ == taxa líquida real', () => {
  const ipcaDec = 0.045;
  const c = liquidar({ i: 0.14, isento: false, dias: 900, anos: 2.5, capital: 1000, ipcaDec });

  // "o equivalente isento, escrito como IPCA+, é o próprio ganho real líquido"
  const equivIsentoEmIpca = (1 + c.txLiqAno) / (1 + ipcaDec) - 1;
  perto(equivIsentoEmIpca, c.txLiqRealAno, 1e-12);
  perto(deflate(c.txLiqAno, ipcaDec), c.txLiqRealAno, 1e-12);
});

test('dias úteis: conta (hoje, vencimento], nunca passa dos dias corridos', () => {
  const base = new Date(Date.UTC(2026, 6, 12)); // domingo
  const cum = acumuladoDiasUteis(base);

  assert.equal(cum[0], 0, 'no dia da aplicação ainda não rendeu nada');
  assert.ok(cum[7] >= 4 && cum[7] <= 5, `uma semana deu ${cum[7]} dias úteis`);

  // ~252 dias úteis por ano, e nunca mais dias úteis do que corridos
  for (const d of [365, 730, 1825, 7300]) {
    assert.ok(cum[d] < d, `${cum[d]} úteis em ${d} corridos`);
    const porAno = cum[d] / (d / 365);
    assert.ok(porAno > 245 && porAno < 255, `${porAno.toFixed(1)} dias úteis por ano em ${d} dias`);
  }
});

test('dias úteis: feriados nacionais somem do calendário', () => {
  // 2027: 01/01 (sex, Ano Novo) não conta; 04/01 (seg) conta.
  const base = new Date(Date.UTC(2026, 11, 31)); // quinta
  const cum = acumuladoDiasUteis(base);
  assert.equal(cum[1], 0, '01/01/2027 é feriado');   // sexta, Ano Novo
  assert.equal(cum[2], 0, '02/01/2027 é sábado');
  assert.equal(cum[3], 0, '03/01/2027 é domingo');
  assert.equal(cum[4], 1, '04/01/2027 é o primeiro dia útil');
});

test('deflate: o IR morde o ganho nominal, então IPCA+7 não entrega 7 reais líquidos', () => {
  const ipcaDec = 0.045;
  const iNominal = (1 + ipcaDec) * (1 + 0.07) - 1;  // "IPCA + 7%"
  const c = liquidar({ i: iNominal, isento: false, dias: 1500, anos: 4, capital: 1000, ipcaDec });
  assert.ok(c.txLiqRealAno < 0.07, `real líquido deu ${(c.txLiqRealAno * 100).toFixed(2)}%`);

  // já o isento entrega os 7% reais cheios
  const iso = liquidar({ i: iNominal, isento: true, dias: 1500, anos: 4, capital: 1000, ipcaDec });
  perto(iso.txLiqRealAno, 0.07, 1e-12);
});

/* ---------------- IOF (Decreto 6.306/2007, Anexo I) ---------------- */

test('IOF: os 30 dias da tabela batem com o decreto, dia a dia', () => {
  const OFICIAL = [96,93,90,86,83,80,76,73,70,66,63,60,56,53,50,46,43,40,36,33,30,26,23,20,16,13,10,6,3,0];
  for (let d = 1; d <= 30; d++) {
    assert.equal(Math.round(aliquotaIOF(d) * 100), OFICIAL[d - 1], `dia ${d}`);
  }
  assert.equal(aliquotaIOF(31), 0, 'do 30º dia em diante o IOF some');
  assert.equal(aliquotaIOF(7300), 0);
});

test('IOF: morde o rendimento antes do IR, e o IR pega só o que sobra', () => {
  const c = liquidar({ i: 0.15, isento: false, dias: 10, anos: 10 / 365, capital: 10000, ipcaDec: 0 });

  perto(c.iofReais, c.rendBruto * 0.66, 1e-9);                       // IOF do 10º dia
  perto(c.irReais, (c.rendBruto - c.iofReais) * 0.225, 1e-9);        // IR sobre a base já reduzida
  perto(c.rendLiq, c.rendBruto - c.iofReais - c.irReais, 1e-9);

  // as alíquotas se compõem, não se somam
  assert.ok(c.iofReais + c.irReais < c.rendBruto * (0.66 + 0.225));
  perto(c.efetivaDec, 1 - (1 - 0.66) * (1 - 0.225), 1e-12);
});

test('IOF: some no 30º dia — é por isso que quase ninguém o vê', () => {
  const d29 = liquidar({ i: 0.15, isento: false, dias: 29, anos: 29 / 365, capital: 10000, ipcaDec: 0 });
  const d30 = liquidar({ i: 0.15, isento: false, dias: 30, anos: 30 / 365, capital: 10000, ipcaDec: 0 });
  assert.ok(d29.iofReais > 0, 'no 29º dia ainda há IOF (3%)');
  assert.equal(d30.iofReais, 0, 'no 30º dia o IOF é zero');

  // um dia a mais de prazo rende MAIS dinheiro líquido, apesar do juro extra ser trivial
  assert.ok(d30.rendLiq > d29.rendLiq);
});

test('IOF: a isenção de LCI/LCA é de imposto de RENDA, não de IOF', () => {
  const c = liquidar({ i: 0.15, isento: true, dias: 10, anos: 10 / 365, capital: 10000, ipcaDec: 0 });
  assert.equal(c.irReais, 0, 'isento de IR');
  assert.ok(c.iofReais > 0, 'mas o IOF continua incidindo');
});

test('IOF: brutoEquivalente continua sendo a inversa exata, agora com a alíquota efetiva', () => {
  for (const dias of [5, 10, 29, 30, 100, 1000]) {
    for (const isento of [false, true]) {
      const anos = dias / 365;
      const c = liquidar({ i: 0.15, isento, dias, anos, capital: 1000, ipcaDec: 0 });
      const volta = brutoEquivalente(c.txLiqAno, anos, aliquotaEfetiva(dias, isento));
      perto(volta, 0.15, 1e-9);
    }
  }
});

test('Smart Selic: IR travado em 15% e sem IOF, em qualquer prazo', () => {
  assert.equal(IR_SMART_SELIC, 0.15);
  for (const dias of [10, 29, 180, 365, 730, 3650]) {
    const T = liquidar({ i: 0.15, isento: false, dias, anos: dias / 365, capital: 1000, ipcaDec: 0.045, smartSelic: true });
    assert.equal(T.iofDec, 0, `Smart Selic não paga IOF (dias=${dias})`);
    assert.equal(T.aliqDec, 0.15, `Smart Selic paga 15% (dias=${dias})`);
  }
});

test('Smart Selic ganha de um CDB de mesma taxa no curto prazo (15% vs 22,5% + IOF)', () => {
  const dias = 200, anos = dias / 365, i = 0.15;
  const ss = liquidar({ i, isento: false, dias, anos, capital: 1000, ipcaDec: 0.045, smartSelic: true });
  const cdb = liquidar({ i, isento: false, dias, anos, capital: 1000, ipcaDec: 0.045 });
  assert.ok(ss.txLiqAno > cdb.txLiqAno, `Smart Selic (${ss.txLiqAno}) deveria bater o CDB (${cdb.txLiqAno})`);
  // e num prazo longo (>720d) os dois pagam 15%: empatam
  const dl = 800, al = dl / 365;
  const ssL = liquidar({ i, isento: false, dias: dl, anos: al, capital: 1000, ipcaDec: 0.045, smartSelic: true });
  const cdbL = liquidar({ i, isento: false, dias: dl, anos: al, capital: 1000, ipcaDec: 0.045 });
  perto(ssL.txLiqAno, cdbL.txLiqAno, 1e-12);
});
