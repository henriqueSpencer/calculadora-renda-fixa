# Calculadoras de Renda Fixa — instruções para o Claude

SPA em React + Vite com duas calculadoras e uma navegação só. Sem backend: tudo roda no
navegador, o build é estático.

- **`/comparador`** (`src/pages/Comparador.jsx`) — **um** título (prefixado, % do CDI, CDI+ ou
  IPCA+): quanto ele deixa no bolso depois do IR/IOF, e a tabela de equivalências ao lado — quanto
  cada outro formato teria que pagar para empatar, com e sem isenção.
- **`/taxa-pre`** (`src/pages/TaxaPre.jsx`) — qual prefixado empata com o dividend yield de um FII.

A rota se chama `/comparador` por herança: a página **já comparou dois títulos lado a lado** e foi
reduzida a um só (a tela ficava tumultuada). A URL foi mantida para não quebrar links já
compartilhados — não "conserte" isso renomeando, e não reintroduza o segundo título.

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
src/styles/tokens.css   --display/--sans/--mono: a tipografia do site inteiro
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
No **comparador** a conta é a conta: o IOF entra até no isento (`aliquotaEfetiva(dias, true)`). No
**taxa-pré** o isento empata na mesma taxa do FII, sem IOF (`iIsento = iFII`) — e isso é
**proposital, não divergência**: os papéis isentos ali (LCI/LCA/CRI/CRA) têm carência > 30 dias e
nunca caem na janela do IOF, enquanto o CDB tributado do outro lado pode ter liquidez diária. Não
"unifique" isso forçando IOF no isento do taxa-pré.

O gráfico "taxa × prazo" começa em `CHART_MIN_D` (30 dias) mesmo com `MIN_D` = 1: abaixo disso o
IOF domina e anualizar um punhado de dias explode a escala. Quando o prazo é menor que 30, o
marcador some do gráfico e a nota explica por quê — não tente "consertar" isso plotando a faixa.

## Identidade visual — "Apólice" (ledger escuro)
O site inteiro veste uma apólice cor de tinta (papel escuro **quente**, não o azul de terminal
antigo), com quatro tintas que **carregam significado** — não as troque à toa:
- **ametista `#B79AE6`** = o relógio dos dias CORRIDOS (o IR);
- **pinho `#5CC98D`** = o relógio dos dias ÚTEIS (o juro) e o isento;
- **sangue `#E8756A`** = a mordida do imposto (IOF + IR, que se empilham);
- **latão `#E7B24E`** = o que sobra no bolso (o herói).

Papel `#14120C`, tinta `#EDE7D6`. A assinatura é a **banda dos dois relógios** (`ClockBand`, no
comparador): dois trilhos paralelos com os cortes do IR (181/361/721) entalhados **só** no trilho
dos corridos, e o de dias úteis mais curto dentro da mesma janela. Cues de ledger: régua fina,
lombada de latão em cada card, série da `Lei Nº 11.033/2004` na nav, tabela do IR como escada
regressiva. As cores/vars vivem nos blocos `.rf` (comparador) e `.eq` (taxa-pré) — ao criar UI
nova, **puxe delas**, não hardcode o azul/dourado antigos. As páginas ainda têm cores inline em JS
(strokes de gráfico do Recharts, `heat()` da matriz): se mexer, use a paleta acima.

## Convenções que SEMPRE importam
- **CSS é escopado, sempre.** O comparador vive sob `.rf`, o taxa-pré sob `.eq`, a navegação sob
  `.nav*`. **Nunca** escreva um seletor global (`.card`, `.row`, `input[type=range]`) num
  arquivo de página — as duas convivem no mesmo bundle e um seletor solto vaza de uma para a
  outra. Toda regra nova em `styles/comparador.css` começa com `.rf `, e em `styles/taxapre.css`
  com `.eq `.
- **`dec` formata, `parseBR` interpreta.** Nos arquivos originais as duas coisas se chamavam
  `num()`, com significados opostos em cada página. Não ressuscite esse nome.
- **Tipografia vem de `tokens.css`.** `--display` (Archivo Expanded) nos títulos, `--sans` (Archivo)
  no corpo, `--mono` (IBM Plex Mono, tabular) para todo número que o usuário compara. Os webfonts
  são carregados no `<link>` do `index.html`; só os stacks (com fallback de sistema) ficam no
  `tokens.css`. **Não declare `font-family` numa página** e não reintroduza a serif: as duas
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
- O comparador tinha dois títulos (A e B) com veredito de quem ganhava. Hoje é um só: entrada à
  esquerda, `EquivCard` à direita, e o veredito virou painel de resultado do próprio título.
- Os controles do taxa-pré (campos do `Dial`, sliders) não tinham `aria-label` — leitores de tela
  anunciavam campos anônimos. Todo input/slider agora tem rótulo acessível, como no comparador.
- Uma auditoria profunda (execução do core com centenas de inputs + revisor independente) confirmou
  que **o core está correto** — não há erro de cálculo; os 16 testes são invariantes reais.

## Deploy
Cloudflare Pages, projeto **`calculadora-renda-fixa`** (o subdomínio tem sufixo `-crm`), no ar em
**https://calculadora-renda-fixa-crm.pages.dev**. Deploy é **manual** — o push no GitHub **não**
dispara deploy. Para publicar (o `--branch=main` faz ir para produção, não um preview):

```bash
npm test && npm run build && npx wrangler pages deploy dist --project-name=calculadora-renda-fixa --branch=main
```

**O único requisito de host** é o *SPA fallback*: `/comparador` e `/taxa-pre` são rotas do React,
não arquivos — sem o fallback, um F5 na rota dá 404. Já resolvido por `public/_redirects` (vale
para Cloudflare e Netlify). No Vercel seria um `vercel.json` com rewrite; o GitHub Pages não faz
rewrite e exigiria trocar o router para hash.

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
