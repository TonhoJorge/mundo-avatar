# Mundo Avatar

Globo interativo do mundo de *Avatar*, no estilo Google Earth: gire o planeta, aproxime, incline a câmera e explore os lugares em **três eras**:

| Era | Período | Série |
| --- | --- | --- |
| Aang | 99–100 DG | Avatar: A Lenda de Aang |
| Korra | 170–174 DG | A Lenda de Korra |
| Pavi e Nisha | ≈ 399 DG | Avatar: Sete Refúgios |

**Site no ar:** https://avatarmaps.vercel.app (espelho: https://tonhojorge.github.io/mundo-avatar/)

> Projeto de fã, **sem fins lucrativos**. *Avatar* e seus personagens são marcas da Nickelodeon/Paramount. A pintura do mapa incluída aqui é procedural e original. A arte oficial pode ser usada no seu próprio servidor (veja [docs/ARTE-OFICIAL.md](docs/ARTE-OFICIAL.md)).

## O que tem

- Globo 3D leve (MapLibre GL), que roda bem em máquinas e celulares modestos. Só carrega os pedaços do mapa que aparecem na tela.
- Mapa pintado em estilo pergaminho para cada era:
  - Nações com cores próprias, fronteira das colônias, muralhas de Ba Sing Se.
  - Vinhas espirituais na era de Korra.
  - Terras Duras e refúgios brilhando na era de Pavi e Nisha.
- **10 idiomas** com tradução completa (português, inglês, espanhol, francês, alemão, italiano, russo, japonês, chinês e coreano) e mais 28 pela tradução automática do navegador (Chrome no computador). Traduções em `i18n-src/`, geradas com `node tools/i18n-strings.mjs build`.
- **Fotos** de cada lugar, vindas do Avatar Wiki com crédito e link (`node tools/fetch-photos.mjs`).
- **Cidades em 3D**: prédios estilizados ao aproximar e inclinar (muralhas de Ba Sing Se, pirâmide de Omashu, cúpulas de Zaofu, arranha-céus da Cidade República…).
- **Comunidade**: login, contribuições por lugar, votação com credibilidade de 0 a 10, ouvidoria contra perseguição e trilha de desenvolvedores aprovada automaticamente pelo GitHub. Regras no banco (`supabase/schema.sql`); veja [docs/COMUNIDADE.md](docs/COMUNIDADE.md) para ligar.
- Busca com sugestões, painel de detalhes por era, links compartilháveis (`?era=korra&lugar=zaofu`) e nuvens ou tempestades opcionais.
- Modo editor, para calibrar as posições:
  - arrastar marcadores;
  - copiar coordenadas;
  - sobrepor uma imagem de referência;
  - exportar o `places.json` corrigido.

## Estrutura

```
public/data/places.json   catálogo de lugares (nomes, descrições por era, fontes)
public/fonts/             glifos dos rótulos (gerados por tools/build-glyphs.mjs)
world/geography.mjs       continentes, ilhas, montanhas, biomas e territórios
tools/render-world.mjs    pinta o mapa e gera os tiles de cada era
tools/import-art.mjs      transforma uma imagem de mapa (ex.: arte oficial) em tiles
tools/check-data.mjs      valida o catálogo (roda antes de cada build)
tools/smoke-test.mjs      teste automático no navegador (desenvolvimento)
src/                      aplicação web (MapLibre + JavaScript puro)
deploy/                   configuração do nginx e script de atualização
docs/                     fontes pesquisadas e guia da arte oficial
```

## Rodar no seu computador

Requer Node.js 20.9 ou mais novo.

```bash
npm install
```

```bash
npm run tiles:rapido
```

```bash
npm run dev
```

`tiles:rapido` gera o mapa até o zoom 3 em cerca de 1 minuto. Para a qualidade final, use `npm run tiles`: zoom 6, alguns minutos.

## Publicar no GitHub Pages (automático)

Cada push na `main` dispara o workflow [.github/workflows/pages.yml](.github/workflows/pages.yml): ele gera o mapa (zoom 6, com cache), faz o build do app e publica em https://tonhojorge.github.io/mundo-avatar/. Não precisa de servidor. O primeiro build demora uns 15–25 minutos; depois, mudanças só no app saem em 2–3 minutos.

## Publicar no servidor (instância isolada com Docker)

Passo a passo detalhado para iniciantes: [docs/PUBLICAR.md](docs/PUBLICAR.md).

No servidor, com Docker e o plugin Compose instalados:

```bash
git clone https://github.com/TonhoJorge/mundo-avatar.git
```

```bash
cd mundo-avatar && docker compose up -d --build
```

O site fica em `http://SEU-SERVIDOR:8080`. O primeiro build gera o mapa inteiro e demora alguns minutos. Depois disso o container só serve arquivos estáticos.

- **Isolamento:** o container usa a própria rede (`mundo-avatar`), roda sem root, tem sistema de arquivos somente leitura e é limitado a 1 CPU e 256 MB de RAM. Mesmo assim sobra muito, porque o servidor é só um nginx.
- **Porta e qualidade:** crie um arquivo `.env` ao lado do `docker-compose.yml` com `MUNDO_AVATAR_PORTA=8090` ou `MAX_ZOOM=5`.
- **Domínio próprio/HTTPS:** aponte seu proxy reverso (nginx, Caddy, Traefik) para `http://127.0.0.1:8080`.
- **Atualizar:**

  ```bash
  ./deploy/atualizar.sh
  ```

  O script faz `git pull` e reconstrói o container.
- **Saúde:** `http://SEU-SERVIDOR:8080/healthz` responde `ok`.

## Editar o mundo

- **Lugares:** edite `public/data/places.json`. `npm run check` aponta qualquer erro. Cada lugar tem:
  - `eras`: em quais eras aparece, com nome, nação, descrição e estado próprios de cada era;
  - `conf`: confiança na posição;
  - `canon`: origem da informação;
  - `refs`: episódios ou obras.
- **Posições:** ative *Camadas → Modo editor*, arraste os marcadores e clique em *Exportar places.json*. Substitua o arquivo e regenere o mapa.
- **Geografia (litorais, montanhas, biomas, territórios):** edite `world/geography.mjs` e rode `npm run tiles`. O gerador avisa se algum lugar terrestre cair na água.

## Fontes

A pesquisa e o nível de confiança de cada informação estão em [docs/FONTES.md](docs/FONTES.md).
