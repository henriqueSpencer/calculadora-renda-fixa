import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';

import { brl, dec, pctOf, parseBROr } from '../core/format.js';
import { aliquotaIR, aliquotaIOF, aliquotaEfetiva, brutoEquivalente, regraDeBolso } from '../core/ir.js';
import { hojeUTC, diasCorridosEmMeses } from '../core/calendario.js';
import '../styles/taxapre.css';

const PRESETS = [
  [6, "6 m"],
  [12, "1 ano"],
  [24, "2 anos"],
  [36, "3 anos"],
  [60, "5 anos"],
  [120, "10 anos"],
  [240, "20 anos"],
  [360, "30 anos"],
];

/* Custódia da B3 no Tesouro Direto: 0,20% a.a. sobre o valor dos títulos.
   A isenção dos primeiros R$ 10 mil vale só para o Tesouro Selic — num prefixado
   ela incide desde o primeiro real. */
const CUSTODIA = 0.002;

/* Colunas da matriz de equivalência, em meses. */
const COLS = [6, 12, 24, 36, 60, 120, 240, 360];

function Dial({ label, aside, str, setStr, step, min, max, unit, dec = 2 }) {
  const v = parseBROr(str);
  const write = (x) => {
    const clamped = Math.max(min, Math.min(max, x));
    setStr(clamped.toFixed(dec).replace(".", ","));
  };
  return (
    <div className="dial">
      <div className="dial-l">
        <span>{label}</span>
        {aside && <em>{aside}</em>}
      </div>
      <div className="dial-r">
        <button className="stepper" onClick={() => write(v - step)} aria-label="diminuir">−</button>
        <div className="fieldwrap">
          <input
            className="field"
            type="text"
            inputMode="decimal"
            value={str}
            onChange={(e) => setStr(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => write(parseBROr(str))}
          />
          <span className="unit">{unit}</span>
        </div>
        <button className="stepper" onClick={() => write(v + step)} aria-label="aumentar">+</button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.max(min, Math.min(max, v))}
        onChange={(e) => write(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function TaxaPre() {
  const [precoStr, setPrecoStr] = useState("100,00");
  const [divStr, setDivStr] = useState("0,85");
  const [prazo, setPrazo] = useState(60);
  const [irFII, setIrFII] = useState(0); // cenário de tributação dos rendimentos

  const hoje = useMemo(hojeUTC, []);

  /* Os dois relógios do título, como manda a lei e o mercado:
     - o IR olha o CALENDÁRIO (12 meses = 365 dias, não 360 — e 365 já cai na faixa
       de 17,5%, não na de 20%);
     - o juro capitaliza no relógio do problema, que aqui é mensal (o FII paga todo mês). */
  const diasDe = React.useCallback((meses) => diasCorridosEmMeses(meses, hoje), [hoje]);
  const aliqDoPrazo = React.useCallback((meses) => aliquotaIR(diasDe(meses)), [diasDe]);

  /* A mordida que o prefixado leva de fato: IOF (só abaixo de 30 dias) e depois o IR
     sobre o que sobrou. Num prazo de 1 mês caindo em fevereiro são 28 dias — e aí o
     IOF existe. Acima disso, `efetiva` é simplesmente o IR. */
  const efetivaDoPrazo = React.useCallback((meses) => aliquotaEfetiva(diasDe(meses), false), [diasDe]);

  const preco = Math.max(0.01, parseBROr(precoStr));
  const div = Math.max(0, parseBROr(divStr));

  const dyBruto = div / preco;
  const dy = dyBruto * (1 - irFII / 100); // yield mensal que chega na sua mão
  const iFII = Math.pow(1 + dy, 12) - 1; // taxa efetiva a.a., já líquida

  const anos = prazo / 12;
  const dias = diasDe(prazo);
  const alq = aliqDoPrazo(prazo);
  const iof = aliquotaIOF(dias);
  const efetiva = efetivaDoPrazo(prazo);

  const iIsento = iFII; // isento é isento: empata na mesma taxa
  const iBruto = brutoEquivalente(iFII, anos, efetiva); // CDB / Tesouro Pré
  const iBrutoTD = (1 + iBruto) * (1 + CUSTODIA) - 1; // com custódia da B3
  const pedagio = iBruto - iFII;
  const bolso = regraDeBolso(iFII, efetiva); // a regra de bolso que todo mundo usa

  /* ---- prova de que os três chegam no mesmo lugar (base R$ 1.000) ---- */
  const BASE = 1000;
  const provaFII = BASE * Math.pow(1 + dy, prazo);
  const provaIsen = BASE * Math.pow(1 + iIsento, anos);
  const provaBrutoBruto = BASE * Math.pow(1 + iBruto, anos);
  const provaIR = (provaBrutoBruto - BASE) * efetiva;
  const provaBrutoLiq = provaBrutoBruto - provaIR;

  /* ---- curva: taxa equivalente × prazo ---- */
  const curva = useMemo(() => {
    const out = [];
    for (let m = 1; m <= 360; m++) {
      const a = efetivaDoPrazo(m);
      const b = brutoEquivalente(iFII, m / 12, a) * 100;
      const i = iFII * 100;
      out.push({ m, isento: i, bruto: b, faixa: [i, b], aliq: a, dias: diasDe(m) });
    }
    return out;
  }, [iFII, efetivaDoPrazo, diasDe]);

  const yMax = Math.max(...curva.map((c) => c.bruto));
  const dom = [
    Math.max(0, Math.floor((iFII * 100 - 0.8) * 2) / 2),
    Math.ceil((yMax + 0.5) * 2) / 2,
  ];

  /* ---- matriz ---- */
  const matriz = useMemo(() => {
    const rows = [];
    for (let i = 0; i <= 18; i++) {
      const d = 0.4 + i * 0.05; // DY mensal bruto, em %
      const y = (d / 100) * (1 - irFII / 100);
      const iAno = Math.pow(1 + y, 12) - 1;
      rows.push({
        key: d,
        dy: d,
        isento: iAno,
        cells: COLS.map((m) => brutoEquivalente(iAno, m / 12, efetivaDoPrazo(m))),
      });
    }
    const vals = rows.flatMap((r) => r.cells);
    return { rows, lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [irFII, efetivaDoPrazo]);

  /* rampa quente da apólice: de painel escuro (taxa baixa) a latão (taxa alta) */
  const heat = (v) => {
    const t = matriz.hi === matriz.lo ? 0.5 : (v - matriz.lo) / (matriz.hi - matriz.lo);
    const r = Math.round(40 + t * 191);
    const g = Math.round(36 + t * 142);
    const b = Math.round(22 + t * 56);
    return `rgba(${r},${g},${b},${0.14 + t * 0.5})`;
  };

  const linhaAtual = Math.round((dyBruto * 100) / 0.05) * 0.05;
  const colAtual = COLS.reduce((a, c) => (Math.abs(c - prazo) < Math.abs(a - prazo) ? c : a), COLS[0]);

  /* ---- tooltip ---- */
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="tip">
        <div className="h">
          {d.m} {d.m === 1 ? "mês" : "meses"} · {dec(d.dias, 0)} dias · IR {pctOf(d.aliq, 1)}
        </div>
        <div className="r">
          <span style={{ color: "var(--isen)" }}>isento</span>
          <span>{dec(d.isento)}%</span>
        </div>
        <div className="r">
          <span style={{ color: "var(--trib)" }}>tributado, bruto</span>
          <span>{dec(d.bruto)}%</span>
        </div>
        <div className="r" style={{ color: "var(--warn)" }}>
          <span>pedágio do IR</span>
          <span>+{dec(d.bruto - d.isento)} p.p.</span>
        </div>
      </div>
    );
  };

  const IR_OPTS = [
    [0, "0% — hoje"],
    [5, "5%"],
    [10, "10%"],
  ];

  return (
    <div className="eq">
      <div className="eq-w">
        <header style={{ marginBottom: 20 }}>
          <p className="eyebrow">Cota estável · dividendo constante · reinvestido todo mês</p>
          <h1 className="t">Qual prefixado empata com este FII?</h1>
          <p className="lede">
            Preço da cota, dividendo e prazo. É só o que entra. A taxa pré sai pronta — na versão
            isenta e na versão bruta, com o IR do prazo já embutido.
          </p>
        </header>

        {/* ---------------- entradas ---------------- */}
        <div className="card" style={{ marginBottom: 13 }}>
          <p className="ct">O FII</p>
          <div className="grid g3">
            <Dial
              label="Preço da cota"
              str={precoStr}
              setStr={setPrecoStr}
              step={0.5}
              min={0.5}
              max={250}
              unit="R$"
            />
            <Dial
              label="Dividendo mensal"
              aside="por cota"
              str={divStr}
              setStr={setDivStr}
              step={0.01}
              min={0}
              max={5}
              unit="R$"
            />
            <div className="dial">
              <div className="dial-l">
                <span>Yield mensal</span>
                <em>calculado</em>
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 30,
                  fontWeight: 600,
                  color: "var(--fii)",
                  letterSpacing: "-.02em",
                  fontVariantNumeric: "tabular-nums",
                  padding: "5px 0 2px",
                  textAlign: "right",
                }}
              >
                {dec(dyBruto * 100, 3)}
                <small style={{ fontSize: 15, color: "var(--faint)", fontFamily: "var(--sans)" }}> % a.m.</small>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--faint)", textAlign: "right", lineHeight: 1.5 }}>
                {brl(div)} ÷ {brl(preco)}
                <br />
                Reinvestido: <b style={{ color: "var(--dim)" }}>{pctOf(iFII)} a.a.</b>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              paddingTop: 13,
              borderTop: "1px solid var(--line)",
              display: "flex",
              gap: 14,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 11.5, color: "var(--dim)" }}>
              IR sobre os rendimentos do FII
            </span>
            <div className="chips">
              {IR_OPTS.map(([v, l]) => (
                <button
                  key={v}
                  className="chip"
                  data-on={irFII === v ? "1" : "0"}
                  onClick={() => setIrFII(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: "var(--faint)", flex: 1, minWidth: 240 }}>
              A Lei 11.033/2004 segue valendo — PF não paga IR sobre rendimento de FII. Os outros dois
              botões são cenário de estresse.
            </span>
          </div>
        </div>

        {/* ---------------- prazo ---------------- */}
        <div className="card" style={{ marginBottom: 13 }}>
          <p className="ct">O prazo</p>
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div className="chips" style={{ flex: 1, minWidth: 270 }}>
              {PRESETS.map(([m, l]) => (
                <button key={m} className="chip" data-on={prazo === m ? "1" : "0"} onClick={() => setPrazo(m)}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 26,
                  fontWeight: 600,
                  color: "var(--fii)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {prazo}
              </span>
              <span style={{ fontSize: 12, color: "var(--faint)", marginLeft: 6 }}>
                meses · {dec(dias, 0)} dias corridos · IR de {pctOf(alq, 1)}
                {iof > 0 && <> · <b style={{ color: "var(--warn)" }}>IOF de {pctOf(iof, 0)}</b></>}
              </span>
            </div>
          </div>
          <input
            type="range"
            min={1}
            max={360}
            step={1}
            value={prazo}
            onChange={(e) => setPrazo(parseInt(e.target.value, 10))}
          />
        </div>

        {/* ---------------- resultado ---------------- */}
        <div className="hero" style={{ marginBottom: 13 }}>
          <div className="hero-top">
            <span className="hero-eq">
              <b>{dec(dyBruto * 100, 3)}%</b> ao mês, reinvestido <s>→</s>{" "}
              <b>{pctOf(iFII)}</b> ao ano, líquido na sua conta
            </span>
            <span className="hero-eq">
              <s>resgate em</s> {prazo} meses <s>=</s> {dec(dias, 0)} dias corridos <s>·</s> IR de{" "}
              {pctOf(alq, 1)}
            </span>
          </div>

          <div className="hero-body">
            <div className="out">
              <p className="out-k" style={{ color: "var(--isen)" }}>Prefixado isento</p>
              <p className="out-w">LCI · LCA · CRI · CRA · debênture incentivada</p>
              <div className="out-v" style={{ color: "var(--isen)" }}>
                {dec(iIsento * 100)}
                <small>% a.a.</small>
              </div>
              <p className="out-f">
                Sem IR, empata na mesma taxa. Se a LCI que te ofereceram paga menos que isso, o FII ganha.
              </p>
            </div>

            <div className="divider">
              <div className="toll">
                <div className="tv">+{dec(pedagio * 100)} p.p.</div>
                <div className="tl">pedágio do IR</div>
              </div>
            </div>

            <div className="out">
              <p className="out-k" style={{ color: "var(--trib)" }}>Prefixado tributado · bruto</p>
              <p className="out-w">CDB · Tesouro Prefixado · debênture comum</p>
              <div className="out-v" style={{ color: "var(--trib)" }}>
                {dec(iBruto * 100)}
                <small>% a.a.</small>
              </div>
              <p className="out-f">
                É a taxa <b>na tela da corretora</b>. Depois do IR de {pctOf(alq, 1)} sobram exatamente{" "}
                <b style={{ color: "var(--isen)" }}>{pctOf(iFII)}</b>.
                <br />
                Se for Tesouro Direto, some a custódia de 0,20%:{" "}
                <b style={{ color: "var(--trib)" }}>{pctOf(iBrutoTD)}</b>.
              </p>
            </div>
          </div>
        </div>

        {/* ---------------- prova ---------------- */}
        <div className="card" style={{ marginBottom: 13 }}>
          <p className="ct">A prova · R$ 1.000 em cada um, por {prazo} meses</p>
          <div className="grid g3">
            <div>
              <div className="row">
                <span className="k">FII, dividendo recomprando cota</span>
                <span className="v" style={{ color: "var(--fii)" }}>{brl(provaFII)}</span>
              </div>
              <div className="row">
                <span className="k">Cotas multiplicadas por</span>
                <span className="v">{dec(Math.pow(1 + dy, prazo), 3)}×</span>
              </div>
            </div>
            <div>
              <div className="row">
                <span className="k">Isento a {pctOf(iIsento)}</span>
                <span className="v" style={{ color: "var(--isen)" }}>{brl(provaIsen)}</span>
              </div>
              <div className="row">
                <span className="k">IR pago</span>
                <span className="v">{brl(0)}</span>
              </div>
            </div>
            <div>
              <div className="row">
                <span className="k">Tributado a {pctOf(iBruto)}, bruto</span>
                <span className="v" style={{ color: "var(--faint)" }}>{brl(provaBrutoBruto)}</span>
              </div>
              <div className="row">
                <span className="k">− IR de {pctOf(alq, 1)}</span>
                <span className="v" style={{ color: "var(--warn)" }}>−{brl(provaIR)}</span>
              </div>
              <div className="row">
                <span className="k">Sobra</span>
                <span className="v" style={{ color: "var(--trib)" }}>{brl(provaBrutoLiq)}</span>
              </div>
            </div>
          </div>
          <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>
            Os três param no mesmo centavo. É isso que "equivalente" quer dizer.
          </p>
        </div>

        {/* ---------------- curva ---------------- */}
        <div className="card" style={{ marginBottom: 13 }}>
          <p className="ct">A taxa equivalente cai com o prazo</p>
          <div className="legend" style={{ marginBottom: 4 }}>
            <span><i style={{ background: "var(--isen)" }} />Isento — não muda: {pctOf(iIsento)}</span>
            <span><i style={{ background: "var(--trib)" }} />Tributado, bruto</span>
            <span><i style={{ background: "rgba(232,117,106,.5)" }} />O que o IR cobra a mais</span>
          </div>
          <div style={{ height: 300, marginTop: 10 }}>
            <ResponsiveContainer>
              <ComposedChart data={curva} margin={{ top: 16, right: 10, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#2C2819" strokeDasharray="2 4" vertical={false} />
                <ReferenceArea x1={1} x2={6} fill="#E8756A" fillOpacity={0.05} />
                <ReferenceArea x1={6} x2={12} fill="#E8756A" fillOpacity={0.035} />
                <ReferenceArea x1={12} x2={24} fill="#E8756A" fillOpacity={0.02} />
                <XAxis
                  dataKey="m"
                  scale="log"
                  domain={[1, 360]}
                  type="number"
                  ticks={[1, 3, 6, 12, 24, 60, 120, 240, 360]}
                  tickFormatter={(m) => (m < 12 ? `${m}m` : `${m / 12}a`)}
                  stroke="#5A5238"
                  tick={{ fill: "#8A8168", fontSize: 10.5, fontFamily: "var(--mono)" }}
                  tickLine={false}
                  allowDataOverflow
                />
                <YAxis
                  domain={dom}
                  tickFormatter={(v) => `${dec(v, 1)}%`}
                  stroke="#5A5238"
                  tick={{ fill: "#8A8168", fontSize: 10.5, fontFamily: "var(--mono)" }}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<Tip />} />
                <Area dataKey="faixa" fill="#E8756A" fillOpacity={0.14} stroke="none" isAnimationActive={false} />
                <Line dataKey="isento" stroke="#5CC98D" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="bruto" stroke="#B79AE6" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                <ReferenceLine
                  x={prazo}
                  stroke="#E7B24E"
                  strokeDasharray="3 3"
                  label={{
                    value: `${dec(iBruto * 100)}%`,
                    fill: "#E7B24E",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    position: "top",
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
            Os três degraus são a tabela regressiva (22,5% → 20% → 17,5% → 15%). Mas repare que, depois
            de 2 anos, a alíquota trava em 15% e a curva <b>continua descendo</b>. Não é erro: o IR do
            prefixado é cobrado uma única vez, lá no fim, e até lá o imposto que você ainda não pagou
            fica rendendo junto com o principal. Quanto mais longo o prazo, mais barato fica ser
            tributado — e mais difícil o FII fica de defender.
          </p>
        </div>

        {/* ---------------- tabela de prazos ---------------- */}
        <div className="card" style={{ marginBottom: 13 }}>
          <p className="ct">Prazo a prazo · clique para escolher</p>
          <table className="tb">
            <thead>
              <tr>
                <th>Prazo</th>
                <th>Dias corridos</th>
                <th>IR</th>
                <th>Isento</th>
                <th>Tributado, bruto</th>
                <th>Pedágio</th>
                <th>Regra de bolso</th>
                <th>Erro dela</th>
              </tr>
            </thead>
            <tbody>
              {PRESETS.map(([m, l]) => {
                const a = efetivaDoPrazo(m);
                const b = brutoEquivalente(iFII, m / 12, a);
                const rb = regraDeBolso(iFII, a);
                return (
                  <tr key={m} data-on={prazo === m ? "1" : "0"} onClick={() => setPrazo(m)}>
                    <td>{l}</td>
                    <td style={{ color: "var(--faint)" }}>{dec(diasDe(m), 0)}</td>
                    <td style={{ color: "var(--faint)" }}>{dec(a * 100, 1)}%</td>
                    <td style={{ color: "var(--isen)" }}>{dec(iFII * 100)}%</td>
                    <td style={{ color: "var(--trib)" }}>{dec(b * 100)}%</td>
                    <td style={{ color: "var(--warn)" }}>+{dec((b - iFII) * 100)}</td>
                    <td style={{ color: "var(--faint)" }}>{dec(rb * 100)}%</td>
                    <td style={{ color: Math.abs(rb - b) > 0.002 ? "var(--warn)" : "var(--faint)" }}>
                      {rb - b >= 0 ? "+" : ""}
                      {dec((rb - b) * 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 13, marginBottom: 0 }}>
            <b>A regra de bolso mente.</b> Dividir a taxa por <code>(1 − IR)</code> só é exato em 1 ano.
            Em {PRESETS.find(([m]) => m === prazo)?.[1] ?? `${prazo} meses`} ela pede{" "}
            <b style={{ color: "var(--faint)" }}>{pctOf(bolso)}</b> quando o número certo é{" "}
            <b style={{ color: "var(--trib)" }}>{pctOf(iBruto)}</b> — {dec(Math.abs(bolso - iBruto) * 100)} p.p.
            de diferença. Usando a regra de bolso você recusa CDBs que, na conta certa, ganhariam do FII.
          </p>
        </div>

        {/* ---------------- matriz ---------------- */}
        <div className="card" style={{ marginBottom: 13 }}>
          <p className="ct">Matriz de equivalência</p>
          <p className="note" style={{ margin: "0 0 13px" }}>
            <b>Yield mensal do FII na linha, prazo na coluna.</b> A célula é a taxa que um prefixado
            tributado precisa mostrar na tela — bruta — para empatar. A coluna verde é o isento, que não
            depende de prazo nenhum.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="mx">
              <thead>
                <tr>
                  <th className="l">DY mês</th>
                  <th className="l" style={{ color: "var(--faint)" }}>R$/cota</th>
                  <th style={{ color: "var(--isen)" }}>Isento</th>
                  {COLS.map((m) => (
                    <th key={m} className={m === colAtual ? "on" : ""}>
                      {m < 12 ? `${m}m` : `${m / 12}a`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matriz.rows.map((r) => {
                  const on = Math.abs(r.key - linhaAtual) < 0.001;
                  return (
                    <tr key={r.key}>
                      <td
                        className="l"
                        style={on ? { color: "var(--fii)", fontWeight: 700 } : undefined}
                      >
                        {dec(r.dy, 2)}%
                      </td>
                      <td className="l" style={{ color: "var(--faint)", fontSize: 10.5 }}>
                        {dec((r.dy / 100) * preco, 2)}
                      </td>
                      <td className="isn" style={{ background: "rgba(92,201,141,.09)" }}>
                        {dec(r.isento * 100)}
                      </td>
                      {r.cells.map((v, i) => (
                        <td
                          key={i}
                          className={on && COLS[i] === colAtual ? "hit" : ""}
                          style={{ background: heat(v) }}
                        >
                          {dec(v * 100)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------------- rodapé ---------------- */}
        <div className="grid g2">
          <div className="card">
            <p className="ct">Como sai a conta</p>
            <p className="note" style={{ margin: 0 }}>
              O yield mensal é <code>D / P</code>. Com a cota travada, cada dividendo recompra cota ao
              mesmo preço, então o número de cotas cresce geometricamente:{" "}
              <code>(1 + y)^12 − 1</code> ao ano — e essa taxa já é líquida, porque o rendimento de FII
              não paga IR. Sem valorização, também não existe ganho de capital, então os 20% da venda de
              cotas não entram em lugar nenhum.
              <br />
              <br />
              Para o prefixado, o IR morde o rendimento acumulado uma vez só, no resgate. Igualando os
              montantes finais:
              <br />
              <code>(1+i_liq)^n = 1 + [(1+i_bruto)^n − 1]·(1−α)</code>
              <br />
              <br />
              E isolando a taxa bruta — que é o número grande azul lá em cima:
              <br />
              <code>i_bruto = {"{"}1 + [(1+i_liq)^n − 1]/(1−α){"}"}^(1/n) − 1</code>
              <br />
              <br />
              <b>A alíquota α sai do calendário, não de "meses × 30".</b> Os cortes da Lei
              11.033 são em dias corridos, e um ano tem 365 — não 360. Por isso "1 ano" cai
              em <b>17,5%</b> (365 &gt; 360) e não em 20%, e "2 anos" cai em <b>15%</b> (730
              &gt; 720) e não em 17,5%. Arredondar o mês para 30 dias empurra o prazo para a
              faixa de cima e infla a taxa que o prefixado parece precisar pagar.
              <br />
              <br />
              <b>Abaixo de 30 dias entra o IOF</b> (Decreto 6.306/2007): 96% do rendimento no 1º
              dia, caindo a zero no 30º. Ele é cobrado antes do IR, que então incide só sobre o
              que sobrou — por isso α aqui é <code>1 − (1−IOF)(1−IR)</code>, e não a soma dos dois.
              Só morde no prazo de 1 mês, e mesmo assim apenas quando o mês é curto.
            </p>
          </div>

          <div className="card">
            <p className="ct">O que a conta não vê</p>
            <p className="note" style={{ margin: 0 }}>
              <b>Cota estável é premissa, não previsão.</b> Ela serve para isolar o dividendo — mas é
              justamente na cota que mora o risco do FII. Uma queda de 10% no preço apaga um ano inteiro
              de rendimento.
              <br />
              <br />
              Dividendo constante também é premissa. Vacância, inadimplência, reajuste de contrato e
              queda da Selic mexem no que o fundo distribui. O prefixado paga a taxa contratada aconteça
              o que acontecer — a menos que o emissor quebre, e aí o FGC cobre até R$ 250 mil por
              CPF/instituição (vale para CDB, LCI e LCA; <b>não</b> vale para CRI, CRA nem debênture).
              <br />
              <br />
              Ficam de fora: marcação a mercado se você vender o prefixado antes do vencimento, IOF nos
              primeiros 30 dias, corretagem, e o fato de que o reinvestimento aqui é fracionário — na
              prática você compra cota inteira e sobra troco parado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
