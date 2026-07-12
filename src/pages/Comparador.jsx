import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer,
} from 'recharts';

import {
  brl, dec, decAuto, pct, parseBR, toDraft, clamp, snap, VALID_DECIMAL,
} from '../core/format.js';
import {
  FAIXAS_IR, faixaIndex, aliquotaIR, aliquotaIOF, aliquotaEfetiva,
  brutoEquivalente, deflate, liquidar,
} from '../core/ir.js';
import {
  MIN_D, MAX_D, CHART_MIN_D, hojeUTC, acumuladoDiasUteis, addDays, ymd, diffDays, fmtDate,
} from '../core/calendario.js';
import '../styles/comparador.css';

/* ---------------- cores ---------------- */
const ACC_A = '#f2b84b', ACCBG_A = 'rgba(242,184,75,.15)';
const ACC_B = '#a878f5', ACCBG_B = 'rgba(168,120,245,.16)';

const CHIPS = [
  { l: '15 d', v: 15 }, { l: '30 d', v: 30 }, { l: '90 d', v: 90 }, { l: '180 d', v: 180 }, { l: '181 d', v: 181 },
  { l: '360 d', v: 360 }, { l: '361 d', v: 361 }, { l: '720 d', v: 720 },
  { l: '721 d', v: 721 }, { l: '2 anos', v: 730 }, { l: '3 anos', v: 1095 },
  { l: '5 anos', v: 1825 }, { l: '10 anos', v: 3650 },
];

const MODOS = [
  { id: 'pre', label: 'Prefixado' },
  { id: 'cdi', label: '% do CDI' },
  { id: 'cdiplus', label: 'CDI +' },
  { id: 'ipca', label: 'IPCA +' },
];

/* ================= CAMPO NUMÉRICO ================= */
function NumField({ value, onCommit, min = -Infinity, max = Infinity, step = 1, decimals = 2, prefix, suffix, ariaLabel }) {
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;
  const shown = editing ? draft : decAuto(value, decimals);

  const handleChange = (e) => {
    const raw = e.target.value;
    if (raw !== '' && !VALID_DECIMAL.test(raw)) return;
    setDraft(raw);
    const n = parseBR(raw);
    if (isFinite(n) && n >= min && n <= max) onCommit(snap(n));
  };
  const handleFocus = (e) => { const el = e.target; setDraft(toDraft(value)); requestAnimationFrame(() => el.select()); };
  const handleBlur = () => {
    const n = parseBR(draft);
    if (isFinite(n)) onCommit(clamp(snap(n), min, max));
    setDraft(null);
  };
  const bump = (dir, big) => {
    const cur = editing && isFinite(parseBR(draft)) ? parseBR(draft) : value;
    const next = clamp(snap(cur + dir * step * (big ? 10 : 1)), min, max);
    onCommit(next);
    if (editing) setDraft(toDraft(next));
  };
  const handleKey = (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); bump(1, e.shiftKey); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1, e.shiftKey); }
    else if (e.key === 'Enter') { e.currentTarget.blur(); }
  };

  return (
    <div className="numWrap">
      {prefix && <span className="numFix">{prefix}</span>}
      <input className="numInput" type="text" inputMode="decimal" autoComplete="off" spellCheck="false"
        aria-label={ariaLabel} value={shown}
        onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKey} />
      {suffix && <span className="numFix rt">{suffix}</span>}
      <div className="numSteps">
        <button type="button" tabIndex={-1} aria-label="diminuir" onClick={() => bump(-1, false)}>−</button>
        <button type="button" tabIndex={-1} aria-label="aumentar" onClick={() => bump(1, false)}>+</button>
      </div>
    </div>
  );
}

/* ---------------- taxas ---------------- */
const grossRate = (modo, p, cdi, ipca) => {
  if (modo === 'pre') return p.pre / 100;
  if (modo === 'cdi') return (cdi / 100) * (p.perc / 100);
  if (modo === 'cdiplus') return (1 + cdi / 100) * (1 + p.spread / 100) - 1;
  if (modo === 'ipca') return (1 + ipca / 100) * (1 + p.real / 100) - 1;
  return 0;
};

const asFormat = (fmt, i, cdi, ipca) => {
  if (!isFinite(i)) return '—';
  if (fmt === 'pre') return pct(i * 100, 2) + ' a.a.';
  if (fmt === 'cdi') {
    if (Math.abs(cdi) < 1e-9) return '—';
    return dec((i / (cdi / 100)) * 100, 1) + '% do CDI';
  }
  if (fmt === 'cdiplus') {
    const s = (1 + i) / (1 + cdi / 100) - 1;
    return 'CDI ' + (s < 0 ? '− ' : '+ ') + pct(Math.abs(s) * 100, 2);
  }
  const r = (1 + i) / Math.max(1e-6, 1 + ipca / 100) - 1;
  return 'IPCA ' + (r < 0 ? '− ' : '+ ') + pct(Math.abs(r) * 100, 2);
};

/* ---------------- sub-componentes ---------------- */
function Step({ n, title, children }) {
  return (
    <div className="step">
      <div className="h"><span className="n">{n}</span><span className="tt">{title}</span></div>
      <div className="ml">{children}</div>
    </div>
  );
}

function CompLines({ modo, p, cdi, ipca, i }) {
  if (modo === 'pre') return (<>
    <div><span className="op">=</span> taxa prefixada contratada</div>
    <div><span className="res">= {pct(i * 100, 2)} a.a.</span></div>
  </>);
  if (modo === 'cdi') return (<>
    <div><span className="op">=</span> CDI × (% do CDI)</div>
    <div><span className="op">=</span> {pct(cdi, 2)} × {decAuto(p.perc, 2)}%</div>
    <div><span className="res">= {pct(i * 100, 2)} a.a.</span></div>
  </>);
  if (modo === 'cdiplus') return (<>
    <div><span className="op">=</span> (1 + CDI) × (1 + spread) − 1</div>
    <div><span className="op">=</span> (1 + {pct(cdi, 2)}) × (1 + {pct(p.spread, 2)}) − 1</div>
    <div><span className="res">= {pct(i * 100, 2)} a.a.</span></div>
    <div className="obs">compõe fatores — não é somar</div>
  </>);
  return (<>
    <div><span className="op">=</span> (1 + IPCA) × (1 + juro real) − 1</div>
    <div><span className="op">=</span> (1 + {pct(ipca, 2)}) × (1 + {pct(p.real, 2)}) − 1</div>
    <div><span className="res">= {pct(i * 100, 2)} a.a.</span></div>
    <div className="obs">IPCA é projeção sua, não garantia</div>
  </>);
}

function EquivCard({ nome, c, dias, t, modo, isento, cdi, ipca, acc, accbg }) {
  const aliq = aliquotaIR(dias);
  const iof = aliquotaIOF(dias);
  const net = c.txLiqAno;

  /* Num resgate de menos de 30 dias, o IOF morde os dois lados: o isento de IR
     também paga IOF, então o "bruto do isento" deixa de ser o próprio líquido. */
  const brutoTrib = brutoEquivalente(net, t, aliquotaEfetiva(dias, false));
  const brutoIsento = brutoEquivalente(net, t, aliquotaEfetiva(dias, true));
  const alvoCDI = asFormat('cdi', isento ? brutoTrib : brutoIsento, cdi, ipca);
  const alvoPre = asFormat('pre', isento ? brutoTrib : brutoIsento, cdi, ipca);

  return (
    <div className="card equivCard" style={{ '--acc': acc, '--accbg': accbg, borderTop: `2px solid ${acc}` }}>
      <div className="tituloHead">
        <span className="dotAcc" />
        <div>
          <b style={{ fontSize: 15 }}>{nome}</b>
          <div className="eqAnchor">
            âncora: <b>{pct(net * 100, 2)} a.a. líquido</b> · {decAuto(dias, 0)} dias corridos · IR {pct(aliq * 100, 1)}
            {iof > 0 && <> · <b style={{ color: '#f0776b' }}>IOF {pct(iof * 100, 0)}</b></>}
          </div>
        </div>
      </div>

      <table className="eqTable">
        <thead>
          <tr><th>Formato</th><th style={{ textAlign: 'right' }}>Se pagar IR</th><th style={{ textAlign: 'right' }}>Se for isento</th></tr>
        </thead>
        <tbody>
          {MODOS.map((m) => {
            const meTrib = modo === m.id && !isento;
            const meIse = modo === m.id && isento;
            return (
              <tr key={m.id}>
                <td className="eqFmt">{m.label}</td>
                <td className={'eqVal' + (meTrib ? ' me' : '')}>
                  {asFormat(m.id, brutoTrib, cdi, ipca)}
                  {meTrib && <span className="eqTag">este título</span>}
                </td>
                <td className={'eqVal' + (meIse ? ' me' : '')}>
                  {asFormat(m.id, brutoIsento, cdi, ipca)}
                  {meIse && <span className="eqTag">este título</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="eqMsg">
        {isento
          ? <>Para empatar com este título, um <b>tributado</b> (CDB, Tesouro, debênture) precisa pagar no mínimo <b className="k" style={{ color: acc }}>{alvoCDI}</b> — ou <b className="k" style={{ color: acc }}>{alvoPre}</b> prefixado.</>
          : <>Uma <b>LCI/LCA isenta</b> já empata com este título pagando apenas <b className="k" style={{ color: acc }}>{alvoCDI}</b> — ou <b className="k" style={{ color: acc }}>{alvoPre}</b> prefixado.</>}
      </div>
    </div>
  );
}

function TituloCard({ nome, setNome, modo, setModo, p, setP, isento, setIsento, iBruta, cdi, ipca, acc, accbg }) {
  const upd = (k) => (n) => setP({ ...p, [k]: n });
  const formula =
    modo === 'cdi' ? `${pct(cdi, 2)} × ${decAuto(p.perc, 2)}%`
      : modo === 'cdiplus' ? `(1 + ${pct(cdi, 2)}) × (1 + ${pct(p.spread, 2)}) − 1`
        : modo === 'ipca' ? `(1 + ${pct(ipca, 2)}) × (1 + ${pct(p.real, 2)}) − 1`
          : 'taxa contratada';

  return (
    <div className="card" style={{ '--acc': acc, '--accbg': accbg, borderTop: `2px solid ${acc}` }}>
      <div className="tituloHead">
        <span className="dotAcc" />
        <input className="inp nameInp" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="dê um nome" aria-label="nome do título" />
      </div>

      <div className="field">
        <span>Como é a remuneração?</span>
        <div className="seg4">
          {MODOS.map((m) => (<button key={m.id} className={modo === m.id ? 'on' : ''} onClick={() => setModo(m.id)}>{m.label}</button>))}
        </div>
      </div>

      {modo === 'pre' && (
        <div className="field"><span>Taxa bruta contratada</span>
          <NumField value={p.pre} onCommit={upd('pre')} min={0} max={100} step={0.1} decimals={2} suffix="% a.a." ariaLabel="taxa prefixada" />
        </div>
      )}
      {modo === 'cdi' && (
        <div className="field"><span>Percentual do CDI</span>
          <NumField value={p.perc} onCommit={upd('perc')} min={0} max={500} step={1} decimals={2} suffix="% do CDI" ariaLabel="percentual do CDI" />
        </div>
      )}
      {modo === 'cdiplus' && (
        <div className="field"><span>Spread sobre o CDI — o "+" do CDI +</span>
          <NumField value={p.spread} onCommit={upd('spread')} min={-20} max={50} step={0.1} decimals={2} suffix="% a.a." ariaLabel="spread sobre o CDI" />
        </div>
      )}
      {modo === 'ipca' && (
        <div className="field"><span>Juro real contratado — o "+" do IPCA +</span>
          <NumField value={p.real} onCommit={upd('real')} min={-20} max={50} step={0.1} decimals={2} suffix="% a.a." ariaLabel="juro real" />
        </div>
      )}

      <div className="brutaBox">
        <div className="bbTop">Taxa bruta nominal <b style={{ color: acc }}>{pct(iBruta * 100, 2)} a.a.</b></div>
        <div className="bbFormula">{formula}</div>
      </div>

      <div className="switch" onClick={() => setIsento(!isento)} role="switch" aria-checked={isento} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsento(!isento); } }}>
        <span className={'track' + (isento ? ' on' : '')} style={isento ? { background: acc } : {}}><span className="knob" /></span>
        <span><b>Isento de IR</b><em>LCI, LCA, CRI, CRA, deb. incentivada</em></span>
      </div>
    </div>
  );
}

function StepsColumn({ nome, c, capital, dias, du, base, isento, acc, accbg, modo, p, cdi, ipca }) {
  const fi = faixaIndex(dias);
  const b252 = base === 252;
  const temIOF = c.iofDec > 0;

  /* o passo do IOF só existe em resgates de menos de 30 dias — a numeração
     se fecha sozinha para não pular número quando ele some */
  let passo = 0;
  const n = () => String(++passo);
  return (
    <div className="stepcol" style={{ '--acc': acc, '--accbg': accbg }}>
      <div className="stepcolHead">
        <span className="dotAcc" />
        <div><b>{nome}</b><em>líq. {pct(c.txLiqAno * 100, 2)} nominal · {pct(c.txLiqRealAno * 100, 2)} real</em></div>
      </div>

      <Step n={n()} title="Taxa bruta nominal ao ano">
        <CompLines modo={modo} p={p} cdi={cdi} ipca={ipca} i={c.i} />
      </Step>

      <Step n={n()} title={b252 ? 'Prazo em anos (base 252 dias úteis)' : 'Prazo em anos (base 365 dias corridos)'}>
        {b252 ? (<>
          <div><span className="op">=</span> dias úteis ÷ 252</div>
          <div><span className="op">=</span> {decAuto(du, 0)} ÷ 252</div>
        </>) : (<>
          <div><span className="op">=</span> dias corridos ÷ 365</div>
          <div><span className="op">=</span> {decAuto(dias, 0)} ÷ 365</div>
        </>)}
        <div><span className="res">= {dec(c.t, 4)} anos</span></div>
        <div className="obs">o juro capitaliza neste relógio; o IR usa outro (dias corridos)</div>
      </Step>

      <Step n={n()} title="Montante bruto">
        <div><span className="op">=</span> Capital × (1 + taxa)^anos</div>
        <div><span className="op">=</span> {brl(capital)} × (1 + {dec(c.i, 4)})^{dec(c.t, 4)}</div>
        <div><span className="op">=</span> {brl(capital)} × {dec(c.fatorBruto, 6)}</div>
        <div><span className="res">= {brl(c.montanteBruto)}</span></div>
      </Step>

      <Step n={n()} title="Rendimento bruto (o lucro)">
        <div><span className="op">=</span> Montante bruto − Capital</div>
        <div><span className="op">=</span> {brl(c.montanteBruto)} − {brl(capital)}</div>
        <div><span className="res">= {brl(c.rendBruto)}</span></div>
      </Step>

      {temIOF && (
        <Step n={n()} title="IOF — o imposto que some no 30º dia">
          <div><span className="op">prazo</span> {decAuto(dias, 0)} dias corridos — menos de 30</div>
          <div><span className="op">tabela</span> Decreto 6.306/2007 — 96% no 1º dia, 0% no 30º</div>
          <div><span className="op">=</span> {pct(c.iofPct, 0)} × {brl(c.rendBruto)}</div>
          <div><span className="neg">= −{brl(c.iofReais)}</span></div>
          <div className="obs">morde o rendimento, nunca o principal — e o IR só vem depois dele</div>
        </Step>
      )}

      <Step n={n()} title="Alíquota de IR — sempre dias CORRIDOS">
        <div><span className="op">prazo</span> {decAuto(dias, 0)} dias corridos</div>
        <div><span className="op">faixa</span> {FAIXAS_IR[fi].faixa}</div>
        {isento
          ? <div><span className="res" style={{ color: '#54d1a5' }}>= isento (0%)</span></div>
          : <div><span className="res">= {pct(FAIXAS_IR[fi].aliq, 1)}</span></div>}
        <div className="obs">a tabela do IR ignora dias úteis — conta calendário, mesmo na base 252</div>
      </Step>

      <Step n={n()} title="IR devido">
        {isento
          ? <><div><span className="op">=</span> título isento</div><div><span className="res" style={{ color: '#54d1a5' }}>= {brl(0)}</span></div></>
          : <>
            <div><span className="op">=</span> alíquota × {temIOF ? 'Rendimento já sem o IOF' : 'Rendimento bruto'}</div>
            <div><span className="op">=</span> {pct(c.aliqPct, 1)} × {brl(c.rendBruto - c.iofReais)}</div>
            <div><span className="neg">= −{brl(c.irReais)}</span></div>
            {temIOF && <div className="obs">a base do IR é o rendimento menos o IOF — os impostos não se somam, se compõem</div>}
            {modo === 'ipca' && <div className="obs">incide sobre o ganho nominal — inclusive sobre a inflação</div>}
          </>}
      </Step>

      <Step n={n()} title="Rendimento líquido">
        <div><span className="op">=</span> Rendimento bruto {temIOF ? '− IOF ' : ''}− IR</div>
        <div><span className="op">=</span> {brl(c.rendBruto)} {temIOF ? `− ${brl(c.iofReais)} ` : ''}− {brl(c.irReais)}</div>
        <div><span className="res">= {brl(c.rendLiq)}</span></div>
      </Step>

      <Step n={n()} title="Montante líquido final">
        <div><span className="op">=</span> Capital + Rendimento líquido</div>
        <div><span className="op">=</span> {brl(capital)} + {brl(c.rendLiq)}</div>
        <div><span className="res">= {brl(c.montanteLiq)}</span></div>
      </Step>

      <Step n={n()} title="Taxa líquida no período">
        <div><span className="op">=</span> Rendimento líquido ÷ Capital</div>
        <div><span className="op">=</span> {brl(c.rendLiq)} ÷ {brl(capital)}</div>
        <div><span className="res">= {pct(c.fatorRendLiq * 100, 2)}</span></div>
      </Step>

      <Step n={n()} title="★ Taxa líquida NOMINAL ao ano">
        <div><span className="op">=</span> (Montante líq. ÷ Capital)^(1 ÷ anos) − 1</div>
        <div><span className="op">=</span> ({dec(c.fatorLiq, 6)})^(1 ÷ {dec(c.t, 4)}) − 1</div>
        <div><span className="res" style={{ fontSize: 15 }}>= {pct(c.txLiqAno * 100, 2)} a.a.</span></div>
      </Step>

      <Step n={n()} title="★ Taxa líquida REAL ao ano">
        <div><span className="op">=</span> (1 + líq. nominal) ÷ (1 + IPCA) − 1</div>
        <div><span className="op">=</span> (1 + {pct(c.txLiqAno * 100, 2)}) ÷ (1 + {pct(ipca, 2)}) − 1</div>
        <div><span className="res" style={{ fontSize: 15 }}>= {pct(c.txLiqRealAno * 100, 2)} a.a.</span></div>
        <div className="obs">é o que sobra acima da inflação — o ganho de poder de compra</div>
      </Step>
    </div>
  );
}

export default function Comparador() {
  const hoje = useMemo(hojeUTC, []);

  /* dias úteis acumulados de hoje até hoje+d, para todo d — calendário ANBIMA */
  const cumDU = useMemo(() => acumuladoDiasUteis(hoje), [hoje]);
  const duFor = (d) => cumDU[clamp(Math.round(d), 0, MAX_D)];

  const [capital, setCapital] = useState(10000);
  const [cdi, setCdi] = useState(15);
  const [ipca, setIpca] = useState(4.5);
  const [dias, setDias] = useState(730);
  const [prazoMode, setPrazoMode] = useState('dias');   /* 'dias' | 'data' */
  const [base, setBase] = useState(252);                /* 252 | 365 */
  const [view, setView] = useState('nom');
  const ipcaDec = ipca / 100;
  const real = view === 'real';
  const b252 = base === 252;

  const [nomeA, setNomeA] = useState('Tesouro IPCA+ 2035');
  const [modoA, setModoA] = useState('ipca');
  const [pA, setPA] = useState({ pre: 13, perc: 110, spread: 2, real: 7 });
  const [isentoA, setIsentoA] = useState(false);

  const [nomeB, setNomeB] = useState('LCA 93% CDI');
  const [modoB, setModoB] = useState('cdi');
  const [pB, setPB] = useState({ pre: 12, perc: 93, spread: 1.5, real: 6 });
  const [isentoB, setIsentoB] = useState(true);

  /* datas */
  const vencDate = addDays(hoje, dias);
  const vencISO = ymd(vencDate);
  const minISO = ymd(addDays(hoje, MIN_D));
  const maxISO = ymd(addDays(hoje, MAX_D));
  const onDateChange = (iso) => {
    if (!iso) return;
    const t = Date.parse(iso + 'T00:00:00Z');
    if (!isFinite(t)) return;
    setDias(clamp(diffDays(hoje, new Date(t)), MIN_D, MAX_D));
  };

  /* o relógio da capitalização */
  const tFor = (d) => (b252 ? Math.max(1e-6, duFor(d) / 252) : Math.max(1e-6, d / 365));
  const duAtual = duFor(dias);
  const tAtual = tFor(dias);

  const iA = grossRate(modoA, pA, cdi, ipca);
  const iB = grossRate(modoB, pB, cdi, ipca);
  const A = liquidar({ i: iA, isento: isentoA, dias, anos: tAtual, capital, ipcaDec });
  const B = liquidar({ i: iB, isento: isentoB, dias, anos: tAtual, capital, ipcaDec });

  const aWins = A.txLiqAno >= B.txLiqAno;
  const winName = aWins ? nomeA : nomeB;
  const dPp = Math.abs(real ? A.txLiqRealAno - B.txLiqRealAno : A.txLiqAno - B.txLiqAno) * 100;
  const dReais = Math.abs(A.montanteLiq - B.montanteLiq);
  const empate = Math.abs(A.txLiqAno - B.txLiqAno) * 100 < 0.005;

  const chartMax = dias > 3650 ? MAX_D : 3650;
  const chart = useMemo(() => {
    const set = new Set();
    for (let d = CHART_MIN_D; d <= chartMax; d += Math.max(15, Math.round(chartMax / 240))) set.add(d);
    [30, 180, 181, 360, 361, 720, 721, 1825, 3650, chartMax, dias].forEach((d) => { if (d >= CHART_MIN_D && d <= chartMax) set.add(d); });
    const xs = Array.from(set).sort((a, b) => a - b);
    const f = (d, i, ise) => {
      const t = b252 ? Math.max(1e-6, cumDU[d] / 252) : Math.max(1e-6, d / 365);
      const rb = Math.pow(1 + i, t) - 1;
      const a = aliquotaEfetiva(d, ise);
      const nom = Math.pow(1 + rb * (1 - a), 1 / t) - 1;
      return (real ? deflate(nom, ipcaDec) : nom) * 100;
    };
    const rows = xs.map((d) => ({ dias: d, a: f(d, iA, isentoA), b: f(d, iB, isentoB) }));
    let lo = Infinity, hi = -Infinity;
    rows.forEach((r) => { lo = Math.min(lo, r.a, r.b); hi = Math.max(hi, r.a, r.b); });
    const pad = Math.max(0.3, (hi - lo) * 0.18);
    return { rows, dom: [lo - pad, hi + pad] };
  }, [iA, iB, isentoA, isentoB, dias, ipcaDec, real, b252, cumDU, chartMax]);

  const iofAtual = aliquotaIOF(dias);
  const temIOF = iofAtual > 0;                /* resgate antes do 30º dia */
  const noGrafico = dias >= CHART_MIN_D;

  const ticks = [30, 180, 360, 720, 1095, 1825, 2555, 3650, 5475, 7300].filter((x) => x <= chartMax);
  const sliderPct = ((dias - MIN_D) / (MAX_D - MIN_D)) * 100;
  const yA = real ? A.txLiqRealAno : A.txLiqAno;
  const yB = real ? B.txLiqRealAno : B.txLiqAno;
  const aliqAtual = aliquotaIR(dias);

  const metrics = [
    { label: 'Taxa líquida nominal ao ano', a: pct(A.txLiqAno * 100, 2), b: pct(B.txLiqAno * 100, 2), av: A.txLiqAno, bv: B.txLiqAno, hl: true },
    { label: 'Taxa líquida real ao ano (acima da inflação)', a: pct(A.txLiqRealAno * 100, 2), b: pct(B.txLiqRealAno * 100, 2), av: A.txLiqRealAno, bv: B.txLiqRealAno, hl: true },
    { label: 'Taxa bruta nominal ao ano', a: pct(iA * 100, 2), b: pct(iB * 100, 2) },
    ...(temIOF ? [{ label: 'Alíquota de IOF (resgate antes de 30 dias)', a: pct(A.iofPct, 0), b: pct(B.iofPct, 0) }] : []),
    { label: 'Alíquota de IR', a: isentoA ? 'isento' : pct(A.aliqPct, 1), b: isentoB ? 'isento' : pct(B.aliqPct, 1) },
    { label: 'Rendimento líquido', a: brl(A.rendLiq), b: brl(B.rendLiq), av: A.rendLiq, bv: B.rendLiq, hl: true },
    ...(temIOF ? [{ label: 'IOF descontado', a: brl(A.iofReais), b: brl(B.iofReais) }] : []),
    { label: 'IR descontado', a: brl(A.irReais), b: brl(B.irReais) },
    { label: 'Montante líquido final', a: brl(A.montanteLiq), b: brl(B.montanteLiq), av: A.montanteLiq, bv: B.montanteLiq, hl: true },
  ];

  const CustomTip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const va = payload.find((x) => x.dataKey === 'a')?.value || 0;
    const vb = payload.find((x) => x.dataKey === 'b')?.value || 0;
    return (
      <div style={{ background: '#0d1626', border: '1px solid #2c3d5a', borderRadius: 10, padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
        <div style={{ color: '#8394ac', marginBottom: 5 }}>{decAuto(label, 0)} dias · {decAuto(cumDU[label] || 0, 0)} úteis · líq. {real ? 'real' : 'nominal'}</div>
        <div style={{ color: ACC_A }}>{nomeA}: {pct(va, 2)} a.a.</div>
        <div style={{ color: ACC_B, marginTop: 2 }}>{nomeB}: {pct(vb, 2)} a.a.</div>
      </div>
    );
  };

  return (
    <div className="rf">
      <div className="wrap">

        <div className="eyebrow">Renda fixa · comparador de rendimento líquido</div>
        <h1>Qual dos dois títulos sobra mais no bolso</h1>
        <p className="sub">
          Informe o prazo em dias <b style={{ color: '#e9eef7' }}>ou a data de vencimento</b> — o dash conta os dias sozinho, nas duas moedas que importam:
          <b style={{ color: '#e9eef7' }}> dias corridos</b> para a faixa do IR e <b style={{ color: '#e9eef7' }}>dias úteis</b> para a capitalização base 252.
        </p>

        {/* ---------- GLOBAIS ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="gTop">
            <div className="field" style={{ marginBottom: 0 }}>
              <span>Capital investido (nos dois)</span>
              <NumField value={capital} onCommit={setCapital} min={0} max={1e11} step={1000} decimals={2} prefix="R$" ariaLabel="capital investido" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span>CDI</span>
              <NumField value={cdi} onCommit={setCdi} min={0} max={100} step={0.1} decimals={2} suffix="% a.a." ariaLabel="CDI ao ano" />
              <em className="mini">usado por % do CDI e CDI +</em>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span>IPCA projetado</span>
              <NumField value={ipca} onCommit={setIpca} min={-10} max={100} step={0.1} decimals={2} suffix="% a.a." ariaLabel="IPCA projetado ao ano" />
              <em className="mini">usado por IPCA + e pelo retorno real</em>
            </div>
          </div>

          {/* prazo */}
          <div className="prazoBox">
            <div className="prazoTop">
              <span className="lbl">Prazo até o resgate</span>
              <div className="seg small">
                <button className={prazoMode === 'dias' ? 'on' : ''} onClick={() => setPrazoMode('dias')}>Por prazo</button>
                <button className={prazoMode === 'data' ? 'on' : ''} onClick={() => setPrazoMode('data')}>Por vencimento</button>
              </div>
            </div>

            {prazoMode === 'dias' ? (
              <>
                <div className="prazoBig"><b className="k">{decAuto(dias, 0)}</b><i>dias corridos</i></div>
                <input type="range" min={MIN_D} max={MAX_D} step="1" value={dias} aria-label="prazo em dias"
                  onChange={(e) => setDias(Number(e.target.value))}
                  style={{ background: `linear-gradient(90deg, #cbb4e6 0%, #cbb4e6 ${sliderPct}%, #223148 ${sliderPct}%, #223148 100%)` }} />
                <div className="row" style={{ marginTop: 12, gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ width: 170, flex: '0 0 auto' }}>
                    <NumField value={dias} onCommit={setDias} min={MIN_D} max={MAX_D} step={1} decimals={0} suffix="dias" ariaLabel="prazo exato em dias" />
                  </div>
                  <div className="chips">
                    {CHIPS.map((c) => (<button key={c.v} className={'chip' + (dias === c.v ? ' on' : '')} onClick={() => setDias(c.v)}>{c.l}</button>))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="dateRow">
                  <div>
                    <span className="dLbl">Data de vencimento</span>
                    <input className="dateInput" type="date" value={vencISO} min={minISO} max={maxISO}
                      aria-label="data de vencimento" onChange={(e) => onDateChange(e.target.value)} />
                  </div>
                  <div className="dArrow">→</div>
                  <div className="dOut">
                    <b className="k">{decAuto(dias, 0)}</b>
                    <span>dias corridos até lá</span>
                  </div>
                </div>
                <div className="chips" style={{ marginTop: 12 }}>
                  {[{ l: '+6 meses', v: 183 }, { l: '+1 ano', v: 365 }, { l: '+2 anos', v: 730 }, { l: '+3 anos', v: 1095 }, { l: '+5 anos', v: 1825 }, { l: '+10 anos', v: 3650 }].map((c) => (
                    <button key={c.v} className={'chip' + (dias === c.v ? ' on' : '')} onClick={() => setDias(c.v)}>{c.l}</button>
                  ))}
                </div>
              </>
            )}

            {/* resumo das duas contagens */}
            <div className="calGrid">
              <div className="calCell"><span>hoje</span><b>{fmtDate(hoje)}</b></div>
              <div className="calCell"><span>vencimento</span><b>{fmtDate(vencDate)}</b></div>
              <div className="calCell hi"><span>dias corridos → IR</span><b>{decAuto(dias, 0)}</b></div>
              <div className="calCell hi2"><span>dias úteis → juro (252)</span><b>{decAuto(duAtual, 0)}</b></div>
              <div className="calCell"><span>anos ({b252 ? '252' : '365'})</span><b>{dec(tAtual, 3)}</b></div>
            </div>

            <div className="baseRow">
              <div>
                <span className="lbl">Base de capitalização do juro</span>
                <em>É o relógio do rendimento. O IR não usa este relógio — ele conta dias corridos, sempre.</em>
              </div>
              <div className="seg small">
                <button className={b252 ? 'on' : ''} onClick={() => setBase(252)}>252 dias úteis</button>
                <button className={!b252 ? 'on' : ''} onClick={() => setBase(365)}>365 corridos</button>
              </div>
            </div>
            {b252 && <div className="baseNote">Padrão do mercado brasileiro: CDB, LCI/LCA, CDI, prefixados e Tesouro (inclusive IPCA+) capitalizam em dias úteis, base 252.</div>}

            {temIOF && (
              <div className="iofWarn">
                <b>IOF de {pct(iofAtual * 100, 0)} sobre o rendimento.</b> Resgatar em {decAuto(dias, 0)} dias
                — menos de 30 — aciona a tabela regressiva do IOF (Decreto 6.306/2007): 96% no 1º dia,
                caindo até 0% no 30º. Ele morde o <b>rendimento</b>, nunca o principal, e o IR só incide
                sobre o que sobra dele. É o que transforma um bom CDB num péssimo negócio de curtíssimo prazo.
              </div>
            )}
          </div>

          <div className="tipbar">
            Nos campos numéricos: vírgula ou ponto valem como decimal · <b>↑ ↓</b> ajustam pelo passo (<b>Shift</b> = 10×) · <b>Enter</b> confirma
          </div>
        </div>

        {/* ---------- ENTRADAS ---------- */}
        <div className="titulos">
          <TituloCard nome={nomeA} setNome={setNomeA} modo={modoA} setModo={setModoA} p={pA} setP={setPA}
            isento={isentoA} setIsento={setIsentoA} iBruta={iA} cdi={cdi} ipca={ipca} acc={ACC_A} accbg={ACCBG_A} />
          <TituloCard nome={nomeB} setNome={setNomeB} modo={modoB} setModo={setModoB} p={pB} setP={setPB}
            isento={isentoB} setIsento={setIsentoB} iBruta={iB} cdi={cdi} ipca={ipca} acc={ACC_B} accbg={ACCBG_B} />
        </div>

        {/* ---------- VEREDITO ---------- */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="tag">Comparação · vencendo em {fmtDate(vencDate)}</div>
          <div className="verdict">
            <div className={'vBlock' + (aWins && !empate ? ' win' : '')} style={{ '--acc': ACC_A }}>
              {aWins && !empate && <span className="wpill">melhor líquida</span>}
              <span className="vName">{nomeA}</span>
              <div className="vFlow"><i>bruta {pct(iA * 100, 2)}</i><b className="k vBig">{pct(A.txLiqAno * 100, 2)}</b><i>a.a. líq. nominal</i></div>
              <div className="vReal">real: <b className="k">{pct(A.txLiqRealAno * 100, 2)}</b> a.a. acima da inflação</div>
            </div>
            <div className={'vBlock' + (!aWins && !empate ? ' win' : '')} style={{ '--acc': ACC_B }}>
              {!aWins && !empate && <span className="wpill">melhor líquida</span>}
              <span className="vName">{nomeB}</span>
              <div className="vFlow"><i>bruta {pct(iB * 100, 2)}</i><b className="k vBig">{pct(B.txLiqAno * 100, 2)}</b><i>a.a. líq. nominal</i></div>
              <div className="vReal">real: <b className="k">{pct(B.txLiqRealAno * 100, 2)}</b> a.a. acima da inflação</div>
            </div>
          </div>

          <div className="deltaStrip">
            {empate
              ? <>Empate técnico: os dois entregam praticamente a mesma taxa líquida ao ano neste prazo.</>
              : <><b style={{ color: aWins ? ACC_A : ACC_B }}>{winName}</b> rende <b className="k">{dec(dPp, 2)} p.p.</b> a.a. a mais — resgatando em {fmtDate(vencDate)}, são <b className="k">{brl(dReais)}</b> a mais no bolso com {brl(capital)} aplicados.</>}
          </div>

          <table className="cmp">
            <thead>
              <tr>
                <th>Métrica</th>
                <th style={{ color: ACC_A, textAlign: 'right' }}>{nomeA}</th>
                <th style={{ color: ACC_B, textAlign: 'right' }}>{nomeB}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const aB = m.hl && !empate && m.av > m.bv + 1e-9;
                const bB = m.hl && !empate && m.bv > m.av + 1e-9;
                return (
                  <tr key={m.label}>
                    <td className="ml0">{m.label}</td>
                    <td style={{ textAlign: 'right', color: aB ? ACC_A : '#c6d2e6', fontWeight: aB ? 700 : 400 }}>{m.a}</td>
                    <td style={{ textAlign: 'right', color: bB ? ACC_B : '#c6d2e6', fontWeight: bB ? 700 : 400 }}>{m.b}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ---------- EQUIVALÊNCIAS ---------- */}
        <div className="secHead">
          <h2>O mesmo título, em outras roupas</h2>
          <p>
            Cada tabela mostra <b>quanto um título de outro formato teria que pagar para deixar exatamente o mesmo dinheiro no seu bolso</b>, vencendo em {fmtDate(vencDate)}.
            Todas as taxas de uma mesma tabela são equivalentes entre si — mudam de roupa, não de resultado.
          </p>
        </div>

        <div className="titulos" style={{ marginTop: 14 }}>
          <EquivCard nome={nomeA} c={A} dias={dias} t={tAtual} modo={modoA} isento={isentoA} cdi={cdi} ipca={ipca} acc={ACC_A} accbg={ACCBG_A} />
          <EquivCard nome={nomeB} c={B} dias={dias} t={tAtual} modo={modoB} isento={isentoB} cdi={cdi} ipca={ipca} acc={ACC_B} accbg={ACCBG_B} />
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="cardHead"><div><h2>Como a equivalência é calculada</h2><p>É o cálculo de sempre, só que de trás para frente: parte do líquido e volta até a taxa bruta que cada formato precisaria oferecer.</p></div></div>
          <div className="steps2">
            <Step n="1" title="Ancorar no líquido">
              <div>A taxa líquida ao ano do título é o alvo — é o que precisa ser igualado.</div>
              <div style={{ marginTop: 6 }}><span className="op">alvo A</span><span className="res" style={{ color: ACC_A }}>{pct(A.txLiqAno * 100, 2)} a.a.</span></div>
              <div><span className="op">alvo B</span><span className="res" style={{ color: ACC_B }}>{pct(B.txLiqAno * 100, 2)} a.a.</span></div>
            </Step>
            <Step n="2" title="Desfazer o IR (voltar ao bruto)">
              <div><span className="op">bruto =</span></div>
              <div>[1 + ((1 + líquida)^anos − 1) ÷ (1 − alíquota)]^(1÷anos) − 1</div>
              <div className="obs">
                Se o alvo for <b>isento</b>, alíquota = 0 → o bruto é o próprio líquido.<br />
                Se o alvo <b>pagar IR</b>, alíquota = {pct(aliqAtual * 100, 1)} — faixa dos {decAuto(dias, 0)} dias corridos.
              </div>
            </Step>
            <Step n="3" title="Traduzir o bruto para cada formato">
              <div><span className="op">Prefixado</span> o próprio bruto</div>
              <div><span className="op">% do CDI</span> bruto ÷ CDI</div>
              <div><span className="op">CDI +</span> (1 + bruto) ÷ (1 + CDI) − 1</div>
              <div><span className="op">IPCA +</span> (1 + bruto) ÷ (1 + IPCA) − 1</div>
              <div className="obs">O "+" pode sair negativo (CDI − 2%): o título entrega menos que o próprio índice.</div>
            </Step>
          </div>
          <div className="eqNote">
            Conferência embutida: o equivalente <b>isento em IPCA +</b> é sempre igual à <b>taxa líquida real</b> do passo 11 — sem IR, o "+" do IPCA é literalmente o ganho acima da inflação. Os dois números batem.
          </div>
        </div>

        {/* ---------- GRÁFICO ---------- */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="cardHead">
            <div>
              <h2>Taxa líquida ao ano conforme o prazo</h2>
              <p>Onde as linhas se cruzam, o título que vale mais a pena muda. Os degraus são as trocas de faixa do IR — em 181, 361 e 721 <b style={{ color: '#c6d2e6' }}>dias corridos</b>.</p>
            </div>
            <div className="chartCtl">
              <div className="seg small">
                <button className={!real ? 'on' : ''} onClick={() => setView('nom')}>Nominal</button>
                <button className={real ? 'on' : ''} onClick={() => setView('real')}>Real</button>
              </div>
              <div className="legend">
                <span><i style={{ background: ACC_A }} />{nomeA}</span>
                <span><i style={{ background: ACC_B }} />{nomeB}</span>
              </div>
            </div>
          </div>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart.rows} margin={{ top: 8, right: 14, bottom: 6, left: -8 }}>
                <CartesianGrid stroke="#1f2c44" vertical={false} />
                <XAxis dataKey="dias" type="number" domain={[CHART_MIN_D, chartMax]} allowDecimals={false} ticks={ticks}
                  tick={{ fill: '#7b8aa3', fontSize: 11, fontFamily: 'var(--mono)' }} tickLine={false} axisLine={{ stroke: '#2c3d5a' }} />
                <YAxis domain={chart.dom} tick={{ fill: '#7b8aa3', fontSize: 11, fontFamily: 'var(--mono)' }}
                  tickFormatter={(v) => dec(v, 1) + '%'} tickLine={false} axisLine={false} width={54} />
                {[180, 360, 720].map((b) => (<ReferenceLine key={b} x={b} stroke="#2c3d5a" strokeDasharray="3 4" />))}
                {real && <ReferenceLine y={0} stroke="#f0776b" strokeDasharray="4 4" strokeOpacity={0.6} />}
                <Tooltip content={<CustomTip />} cursor={{ stroke: '#5a6980', strokeDasharray: '4 4' }} />
                <Line type="linear" dataKey="a" stroke={ACC_A} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey="b" stroke={ACC_B} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                {/* abaixo de 30 dias o ponto cairia fora do eixo — o gráfico começa onde o IOF acaba */}
                {noGrafico && <>
                  <ReferenceLine x={dias} stroke="#8394ac" strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.7} />
                  <ReferenceDot x={dias} y={yA * 100} r={5} fill={ACC_A} stroke="#0d1320" strokeWidth={2} isFront />
                  <ReferenceDot x={dias} y={yB * 100} r={5} fill={ACC_B} stroke="#0d1320" strokeWidth={2} isFront />
                </>}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="axisNote">
            {noGrafico
              ? <>eixo em dias corridos → os pontos marcam {fmtDate(vencDate)}. </>
              : <><b style={{ color: '#f0776b' }}>Seu prazo ({decAuto(dias, 0)} dias) fica fora deste gráfico</b>, que começa em 30 dias — abaixo disso o IOF domina tudo e a curva viraria uma parede. Veja a memória de cálculo. </>}
            {real
              ? <>Mostrando o ganho <b style={{ color: '#e9eef7' }}>acima da inflação</b> (IPCA {pct(ipca, 2)} descontado). A linha vermelha é o zero real.</>
              : <>Mostrando o retorno <b style={{ color: '#e9eef7' }}>nominal</b>, sem descontar a inflação.</>}
          </div>
        </div>

        {/* ---------- MEMÓRIA ---------- */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="cardHead"><div><h2>Memória de cálculo</h2><p>Passo a passo dos dois títulos, lado a lado. Repare nos passos 2 e 5: são os dois relógios diferentes rodando no mesmo título.</p></div></div>
          <div className="stepcols">
            <StepsColumn nome={nomeA} c={A} capital={capital} dias={dias} du={duAtual} base={base} isento={isentoA} acc={ACC_A} accbg={ACCBG_A} modo={modoA} p={pA} cdi={cdi} ipca={ipca} />
            <StepsColumn nome={nomeB} c={B} capital={capital} dias={dias} du={duAtual} base={base} isento={isentoB} acc={ACC_B} accbg={ACCBG_B} modo={modoB} p={pB} cdi={cdi} ipca={ipca} />
          </div>
        </div>

        {/* ---------- TABELA IR ---------- */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="cardHead">
            <div><h2>Tabela regressiva do IR — em dias corridos</h2><p>Lei 11.033/2004. Vale para CDB, RDB, LC, Tesouro Direto (inclusive IPCA+), debêntures comuns e fundos de renda fixa. Títulos isentos não entram nela.</p></div>
          </div>
          <table>
            <thead><tr><th>Prazo da aplicação</th><th>Intervalo (dias corridos)</th><th style={{ textAlign: 'right' }}>Alíquota sobre o rendimento</th></tr></thead>
            <tbody>
              {FAIXAS_IR.map((f, idx) => (
                <tr key={f.faixa} className={idx === faixaIndex(dias) ? 'cur' : ''}>
                  <td>{idx === faixaIndex(dias) && <span className="dot" />}{f.faixa}</td>
                  <td style={{ color: '#8394ac' }}>{f.intervalo}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{pct(f.aliq, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="axisNote" style={{ textAlign: 'left', marginTop: 12 }}>
            Faixa destacada = a dos {decAuto(dias, 0)} dias corridos até {fmtDate(vencDate)}. Os {decAuto(duAtual, 0)} dias úteis <b style={{ color: '#c6d2e6' }}>não entram</b> nesta conta.
          </div>
        </div>

        {/* ---------- NOTAS ---------- */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="cardHead"><div><h2>Como calculamos (e o que assumimos)</h2></div></div>
          <ul className="notes">
            <li><b>Dois relógios, um título.</b> O <span className="k">IR conta dias corridos</span> (Lei 11.033/2004 — os cortes de 180/360/720 são de calendário). O <span className="k">juro capitaliza em dias úteis</span>, base 252, que é o padrão do mercado brasileiro. Trocar a base muda o rendimento, mas nunca muda a faixa do IR.</li>
            <li><b>Dias úteis pelo calendário ANBIMA.</b> Feriados nacionais (Resolução CMN 4.880), com Carnaval, Sexta-feira Santa e Corpus Christi derivados da Páscoa, e 20/11 incluído a partir de 2024. Feriados estaduais e municipais (que não suspendem o mercado nacional) não entram.</li>
            <li><b>Contagem a partir de hoje.</b> A data de vencimento vira dias corridos contando de {fmtDate(hoje)}. Na prática, uma compra hoje liquida em D+0/D+1 — se o seu título já está na carteira, use o modo "Por prazo" com os dias que faltam.</li>
            <li><b>CDI + e IPCA + compõem fatores, não somam.</b> Convenção ANBIMA: "CDI + 2%" com CDI a 15% dá <span className="k">1,15 × 1,02 − 1 = 17,30%</span>. No IPCA + é a equação de Fisher: <span className="k">(1 + IPCA) × (1 + juro real) − 1</span>.</li>
            <li><b>O IR incide sobre o ganho nominal.</b> Num IPCA +, o imposto morde também a parte que era só reposição da inflação. Por isso um "IPCA + 7%" nunca entrega 7% reais líquidos.</li>
            <li><b>As equivalências valem só neste vencimento.</b> A alíquota depende dos dias corridos, então mudar a data recalcula todas as tabelas.</li>
            <li><b>O IOF entra na conta.</b> Decreto 6.306/2007: tabela regressiva sobre o <span className="k">rendimento</span> nos 29 primeiros dias — 96% no 1º dia, 3% no 29º, zero do 30º em diante. Ele é cobrado <span className="k">antes</span> do IR, e o imposto de renda incide só sobre o que sobra dele (por isso as alíquotas não se somam: elas se compõem). Vale inclusive para papéis isentos de IR — a isenção de LCI/LCA/CRI/CRA é de imposto de <span className="k">renda</span>, não de IOF; na prática esses papéis têm carência maior que 30 dias, então o ponto é acadêmico.</li>
            <li><b>O que continua de fora:</b> custódia (0,20% a.a. da B3 no Tesouro Direto), corretagem, marcação a mercado se você vender antes do vencimento, e come-cotas de fundos.</li>
          </ul>
        </div>

        <div className="foot">Troque o vencimento e veja as duas contagens — e o IR — se mexerem junto.</div>
      </div>
    </div>
  );
}
