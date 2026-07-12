import React, { useEffect } from 'react';

import Comparador from './pages/Comparador.jsx';
import TaxaPre from './pages/TaxaPre.jsx';
import { useRoute } from './router.js';
import './styles/shell.css';

const ROTAS = [
  {
    path: '/comparador',
    nav: 'Comparador de títulos',
    navCurta: 'Comparador',
    Page: Comparador,
    title: 'Comparador de Renda Fixa — rendimento líquido depois do IR',
    desc: 'Compare dois títulos de renda fixa lado a lado: prefixado, % do CDI, CDI+ ou IPCA+. Calcula a rentabilidade líquida ao ano depois do Imposto de Renda, com tabela regressiva, matriz de equivalências e memória de cálculo completa.',
  },
  {
    path: '/taxa-pre',
    nav: 'FII → prefixado equivalente',
    navCurta: 'FII → Prefixado',
    Page: TaxaPre,
    title: 'Qual prefixado empata com este FII?',
    desc: 'Converte o dividend yield mensal de um fundo imobiliário na taxa prefixada equivalente — isenta e bruta — com a tabela regressiva de IR aplicada ao prazo.',
  },
];

const PADRAO = ROTAS[0];

export default function App() {
  const [path, navigate] = useRoute();
  const rota = ROTAS.find((r) => r.path === path);

  /* Rota desconhecida (inclusive "/") cai no comparador, sem empilhar histórico. */
  useEffect(() => {
    if (!rota) navigate(PADRAO.path, { replace: true });
  }, [rota, navigate]);

  const atual = rota ?? PADRAO;

  useEffect(() => {
    document.title = atual.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', atual.desc);
  }, [atual]);

  const ir = (e, to) => {
    /* Deixa o ctrl/cmd-clique e o botão do meio abrirem em nova aba, como todo link. */
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };

  const { Page } = atual;

  return (
    <>
      <header className="nav">
        <div className="nav-w">
          <a
            className="nav-marca"
            href={PADRAO.path}
            onClick={(e) => ir(e, PADRAO.path)}
            aria-label="Início"
          >
            <span className="nav-glifo" aria-hidden="true" />
            Renda Fixa
          </a>

          <nav className="nav-abas" aria-label="Calculadoras">
            {ROTAS.map((r) => {
              const on = r.path === atual.path;
              return (
                <a
                  key={r.path}
                  href={r.path}
                  className={'nav-aba' + (on ? ' on' : '')}
                  aria-current={on ? 'page' : undefined}
                  onClick={(e) => ir(e, r.path)}
                >
                  <span className="longo">{r.nav}</span>
                  <span className="curto">{r.navCurta}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main>
        <Page />
      </main>
    </>
  );
}
