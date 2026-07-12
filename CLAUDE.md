# Calculadoras de Renda Fixa — instruções para o Claude

SPA em React + Vite com duas calculadoras e uma navegação só. Sem backend: tudo roda no
navegador, o build é estático.

- **`/comparador`** (`src/pages/Comparador.jsx`) — dois títulos lado a lado (prefixado, % do
  CDI, CDI+, IPCA+) pelo líquido depois do IR.
- **`/taxa-pre`** (`src/pages/TaxaPre.jsx`) — qual prefixado empata com o dividend yield de um FII.

## Regra principal
**Toda a matemática vive em `src/core/`.** As páginas só desenham. Se você precisar de uma
alíquota, de uma conversão bruto↔líquido, de um formato pt-BR ou de uma contagem de dias,
importe do core — **não escreva de novo na página**. As duas calculadoras já divergiram uma vez
justamente assim (ver "Bugs que já foram corrigidos"), e o resultado foi cada página dizendo um
número diferente para o mesmo imposto.

```
src/core/ir.js          IR regressivo, IOF regressivo, aliquotaEfetiva, brutoEquivalente, liquidar
src/core/calendario.js  feriados ANBIMA, dias úteis, addMonths, diasCorridosEmMeses
src/core/format.js      dec/decAuto/brl/pct/pctOf + parseBR
src/styles/tokens.css   --sans e --mono: a tipografia do site inteiro
```

O core é folha: não importa de `pages/`, nem de `styles/`, nem do React.

## Os dois relógios (o conceito que mais confunde neste domínio)
Um mesmo título é medido por **dois calendários diferentes ao mesmo tempo**, e isso é de
propósito — é assim que a lei e o mercado funcionam:

1. **O IR conta dias corridos de calendário.** Os cortes da Lei 11.033/2004 (180/360/720) são
   de calendário puro. **Um ano tem 365 dias, não 360.** Logo "1 ano" cai em **17,5%** (365 > 360),
   não em 20%; "2 anos" caem em **15%** (730 > 720), não em 17,5%. Nunca aproxime mês por 30 dias:
   isso empurra o prazo para a faixa de cima e infla a taxa que o prefixado parece precisar pagar.
   Use `diasCorridosEmMeses(meses, hoje)` e só então `aliquotaIR(dias)`.
2. **O juro capitaliza em outro relógio.** No comparador: dias úteis / 252 (padrão do mercado
   brasileiro) ou dias corridos / 365, à escolha do usuário. No FII: mensal, porque é assim que
   o fundo paga. Trocar a base muda o rendimento e **nunca** muda a faixa do IR.

## Os dois impostos, e a ordem entre eles
O **IOF** (Decreto 6.306/2007) morde o rendimento nos 29 primeiros dias — 96% no 1º, 3% no 29º,
zero do 30º em diante — e é cobrado **antes** do IR, que então incide só sobre o que sobrou. Por
isso as alíquotas **não se somam**: `α_efetiva = 1 − (1 − IOF)(1 − IR)`. Use `aliquotaEfetiva(dias,
isentoIR)` em qualquer conta de equivalência; `liquidar` já faz isso internamente.

O IOF **independe da isenção de IR**: LCI/LCA/CRI/CRA são isentas de imposto de *renda*, não de
IOF (na prática têm carência > 30 dias, o que torna o ponto acadêmico — mas a conta é a conta).

O gráfico "taxa × prazo" começa em `CHART_MIN_D` (30 dias) mesmo com `MIN_D` = 1: abaixo disso o
IOF domina e anualizar um punhado de dias explode a escala. Quando o prazo é menor que 30, o
marcador some do gráfico e a nota explica por quê — não tente "consertar" isso plotando a faixa.

## Convenções que SEMPRE importam
- **CSS é escopado, sempre.** O comparador vive sob `.rf`, o taxa-pré sob `.eq`, a navegação sob
  `.nav*`. **Nunca** escreva um seletor global (`.card`, `.row`, `input[type=range]`) num
  arquivo de página — as duas convivem no mesmo bundle e um seletor solto vaza de uma para a
  outra. Toda regra nova em `styles/comparador.css` começa com `.rf `, e em `styles/taxapre.css`
  com `.eq `.
- **`dec` formata, `parseBR` interpreta.** Nos arquivos originais as duas coisas se chamavam
  `num()`, com significados opostos em cada página. Não ressuscite esse nome.
- **Tipografia vem de `tokens.css`.** `--sans` para tudo, `--mono` (tabular) para todo número que
  o usuário compara. **Não declare `font-family` numa página** e não reintroduza a serif: as duas
  páginas tinham stacks diferentes, e o site parecia dois sites.
- **`base: '/'` no `vite.config.js`, nunca `'./'`.** As rotas são reais (`/taxa-pre`), então
  caminho relativo faz o navegador buscar os assets em `/taxa-pre/assets/` e quebra tudo.
- **`npm test` antes de commitar.** São invariantes financeiras, não testes de fachada: que
  `brutoEquivalente` é a inversa exata de `liquidar`, que FII/isento/tributado param no mesmo
  centavo, que os cortes da tabela caem onde a lei manda, e que a regra de bolso `i/(1−α)` só é
  exata em exatamente 1 ano. Se um deles quebrar, a conta está errada — não o teste.

## Bugs que já foram corrigidos (não os reintroduza)
- A alíquota do taxa-pré vinha de `meses × 30` → errava a faixa em 6 m, 1 ano e 2 anos, sempre
  para cima, inflando em ~0,4 p.p. a taxa exigida do prefixado. Hoje vem do calendário real.
- O CSS do taxa-pré vazava `.card`, `.row`, `.chip` e `input[type=range]` no escopo global.
- `grossNeeded` (comparador) e `brutoEquivalente` (taxa-pré) eram a mesma fórmula duplicada.
- A custódia de 0,20% a.a. do Tesouro Direto: a isenção dos primeiros R$ 10 mil vale **só para o
  Tesouro Selic**. Num prefixado ela incide desde o primeiro real.
- O IOF não existia na conta, e o prazo mínimo do comparador era 30 dias — exatamente o dia em que
  o IOF zera. Não estava errado, estava inalcançável. Hoje `MIN_D` = 1 e o IOF é cobrado.
- O taxa-pré usava uma serif nos títulos e nos números; o comparador, sans. Duas caras, um site.

## Deploy
Cloudflare Pages, build `npm run build`, output `dist/`. **O único requisito de host** é o *SPA
fallback*: `/comparador` e `/taxa-pre` são rotas do React, não arquivos — sem o fallback, um F5
na rota dá 404. Já resolvido por `public/_redirects` (vale para Cloudflare e Netlify). No Vercel
seria um `vercel.json` com rewrite; o GitHub Pages não faz rewrite e exigiria trocar o router
para hash.

## Git
Conta **henriqueSpencer** (`gh auth switch --user henriqueSpencer`), autor
`Henrique Spencer <henriquespencer11@gmail.com>`. Commits e PRs **sem nenhuma menção a IA** —
nada de `Co-Authored-By` nem "Generated with".

## Notas
- `_original/` guarda os arquivos de onde este projeto nasceu (os dois `.jsx` soltos e os bundles
  HTML de 600 KB). É histórico. **Não é fonte** — não edite, não importe, não use como referência
  de código: contém justamente os bugs já corrigidos.
- Esta pasta fica dentro do repo `divyval` (`~/Documents/Investimentos`), mas tem repo próprio e
  está no `.gitignore` do pai. Não a versione lá.
- Preço/cotação não vem da CVM. Estas calculadoras não consultam a base DuckDB do projeto pai —
  são autônomas, o usuário digita as taxas.
