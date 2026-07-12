# Calculadoras de Renda Fixa

Duas calculadoras, um site só:

- **`/comparador`** — descreva um título (prefixado, % do CDI, CDI+ ou IPCA+) e veja quanto ele
  deixa no bolso depois do IR e do IOF. Ao lado, a tabela de equivalências: quanto cada um dos
  outros formatos teria que pagar para dar exatamente o mesmo resultado, com e sem isenção.
  Inclui memória de cálculo passo a passo e o gráfico da taxa líquida por prazo.
- **`/taxa-pre`** — qual taxa prefixada empata com o dividend yield de um FII, na versão
  isenta e na bruta.

> A rota `/comparador` é herança: a página já comparou dois títulos lado a lado. Ficou tumultuada
> e foi reduzida a um só — a URL continua para não quebrar links compartilhados.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # invariantes financeiras do núcleo
npm run build    # dist/
npm run preview  # serve o dist/ como em produção
```

## Como está montado

```
src/
  core/            # a matemática — as duas páginas dependem daqui, e só daqui
    ir.js          #   tabela regressiva, bruto↔líquido, deflação
    calendario.js  #   feriados ANBIMA, dias úteis, meses → dias corridos
    format.js      #   pt-BR: dec/brl/pct e o parser
  pages/           # uma calculadora cada
  styles/          # CSS de cada página, escopado (.rf e .eq) — não se misturam
  router.js        # History API em 20 linhas
  App.jsx          # navegação + rotas
test/core.test.js  # trava as invariantes (ver abaixo)
```

### Os dois relógios

O detalhe que mais confunde nesse assunto, e que o `core` centraliza para não divergir:

- **O IR conta dias corridos de calendário.** Os cortes da Lei 11.033/2004 (180/360/720) são
  de calendário. Um ano tem **365 dias, não 360** — então "1 ano" cai em **17,5%**, não em 20%,
  e "2 anos" caem em **15%**, não em 17,5%. Aproximar mês por 30 dias empurra o prazo para a
  faixa de cima e infla a taxa que o prefixado parece precisar pagar.
- **O juro capitaliza em outro relógio.** No comparador, dias úteis / 252 (padrão do mercado)
  ou dias corridos / 365, à escolha. No FII, mensal — porque é assim que o fundo paga.

E há **dois** impostos, não um. O **IOF** morde o rendimento nos 29 primeiros dias (96% no 1º,
zero no 30º) e é cobrado *antes* do IR, que incide só sobre o que sobrou — as alíquotas se
compõem, não se somam: `α = 1 − (1−IOF)(1−IR)`. É o que transforma um bom CDB num péssimo
negócio de curtíssimo prazo.

`npm test` trava isso: os cortes das duas tabelas (IR e IOF, esta conferida dia a dia contra o
decreto), o fato de `brutoEquivalente` ser a inversa exata de `liquidar`, a prova de que FII /
isento / tributado-líquido param no mesmo centavo, e que a regra de bolso (`i / (1 − α)`) só é
exata em exatamente 1 ano.

## Deploy

O build é estático (`dist/`) — qualquer host serve. **O único requisito** é o *SPA fallback*:
`/comparador` e `/taxa-pre` são rotas do React, não arquivos em disco. Sem o fallback, abrir o
link direto ou dar F5 numa rota devolve 404. O `public/_redirects` já cuida disso no Cloudflare
Pages e no Netlify.

### Cloudflare Pages (o escolhido)

Sem limite de banda, CDN rápida no Brasil, deploy a cada `git push`.

```bash
git init && git add . && git commit -m "Calculadoras de renda fixa"
gh repo create calculadora-rf --private --source=. --push
```

Depois, em **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**:

| Campo | Valor |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

Sai em `https://<projeto>.pages.dev`. Domínio próprio entra em *Custom domains*, sem custo.

### Outros hosts

- **Netlify** — mesmo `public/_redirects`, mesmo build. Só conectar o repo.
- **Vercel** — precisa de um `vercel.json` com o rewrite:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- **GitHub Pages** — *não* faz rewrite de rota. Para publicar lá, troque o `useRoute` de
  `pathname` para `hash` (URLs viram `/#/comparador`), ou aceite que o F5 numa rota dá 404.
