# Usando a arte oficial do mapa

O repositório traz uma pintura **procedural e original** do mundo, inspirada no estilo da série. O mapa oficial é arte da Nickelodeon/Paramount e **não** está incluído aqui. Você pode usá-lo no seu servidor; a responsabilidade pelo uso da imagem é sua. Num projeto de fã sem fins lucrativos, mantenha o crédito aos detentores.

## 1. Conseguir a imagem

Use a imagem do mapa-múndi da série na maior resolução que conseguir. Ela deve mostrar o **mundo inteiro numa projeção plana**: Polo Norte em cima, Polo Sul embaixo, de ponta a ponta na horizontal.

## 2. Calibrar os lugares sobre a arte (opcional, recomendado)

1. Abra o site, vá em **Camadas → Modo editor**.
2. Em *Sobreposição de calibração*, carregue a imagem e clique em **Aplicar**.
3. Ajuste os limites:
   - **Oeste/Leste/Sul/Norte**, se a imagem não cobrir o globo inteiro;
   - **Opacidade**, até a arte alinhar com os continentes.
4. Arraste os marcadores dos lugares para cima das posições certas.
5. Clique em **Exportar places.json** e substitua `public/data/places.json`.

## 3. Usar a arte como textura do globo

Coloque a imagem na pasta `arte/` com o nome da era:

```
arte/aang.jpg      arte/korra.png      arte/havens.webp
```

Se a imagem não cobrir o mundo todo, crie `arte/<era>.bounds` com `oeste,sul,leste,norte`, por exemplo `-180,-85,180,85`.

- **No Docker:** o build detecta a pasta sozinho. Basta rodar `docker compose up -d --build`.
- **No computador:**

  ```bash
  npm run tiles
  ```

  ```bash
  node tools/import-art.mjs --auto
  ```

As imagens de `arte/` ficam fora do git (`.gitignore`). Copie-as direto para a pasta do projeto no servidor.

## 4. Ajustar a geografia procedural à arte

Se preferir manter o estilo procedural, mas com litorais fiéis ao mapa oficial:

1. Use a sobreposição do editor para ler as coordenadas: clique no mapa e a coordenada é copiada.
2. Copie os contornos para os polígonos de `world/geography.mjs`.
3. Regenere com `npm run tiles`.
