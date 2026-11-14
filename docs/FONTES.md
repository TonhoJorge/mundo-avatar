# Fontes e método

Este mapa junta informação de várias fontes, com níveis de confiança diferentes. Cada lugar em `public/data/places.json` registra:

- **`canon`**: origem da informação (`serie`, `quadrinhos`, `livros`, `rumor`);
- **`conf`**: confiança na **posição** no mapa:
  - `alta`: aparece claramente no mapa oficial;
  - `media`: posição relativa descrita na série;
  - `baixa`: estimativa;
- **`refs`**: episódios ou obras em que o lugar aparece (títulos originais, em inglês, para facilitar a conferência).

## Fontes primárias (canônicas)

- *Avatar: The Last Airbender* (2005–2008), 3 livros. Geografia geral, nações e a maioria dos lugares da era de Aang.
- *The Legend of Korra* (2012–2014), 4 livros. Cidade República, República Unida, Zaofu, portais espirituais, Império da Terra.
- *Avatar: Seven Havens* (Paramount+, estreia em 9 out. 2026; Livro 1 *Survival*). Ellora, Nova Ba Sing Se, Ilhas Flutuantes, Akasha, Floresta da República. Série em exibição: **informações podem mudar**.
- **Quadrinhos da Dark Horse:**
  - era de Aang: *The Promise*, *The Search*, *The Rift*, *Smoke and Shadow*, *North and South*, *Imbalance*;
  - era de Korra: *Turf Wars*, *Ruins of the Empire*.

  Até agora só *The Promise* foi usado (Yu Dao); os demais estão listados para próximas rodadas.
- **Romances:** *The Rise of Kyoshi* / *The Shadow of Kyoshi* (F. C. Yee), *The Dawn of Yangchen*. Eras anteriores, ainda não mapeadas.
- **Avatar Legends: The Roleplaying Game (Magpie Games):** livro básico e o suplemento *Voyage of the Unity*, que traz um mapa da era de Roku. É uma boa referência para expandir o mapa.

## Fontes secundárias consultadas nesta versão

**Sobre *Seven Havens* (localização dos refúgios):**

- CBR, *Every Haven Introduced in Avatar: Seven Havens, So Far*: https://www.cbr.com/avatar-seven-havens-book-one-survival-list/
- Wikipédia (inglês): https://en.wikipedia.org/wiki/Avatar:_Seven_Havens
- Avatar Wiki (fandom), páginas *Seven Havens* e *Ellora* (conteúdo lido via busca, sem acesso direto): https://avatar.fandom.com/wiki/Seven_Havens
- TV Tropes, personagens de *Seven Havens*: https://tvtropes.org/pmwiki/pmwiki.php/Characters/AvatarSevenHavens
- Knight Edge Media (relatos de bastidores; tratados como rumor): https://knightedgemedia.com/2025/10/where-are-the-twin-avatars-in-avatar-seven-havens-exclusive/
- ComicBook.com, *What we know so far*: https://comicbook.com/anime/news/avatar-seven-havens-what-we-know-so-far

**Mapas e projetos de fãs** (referência de formato e de projeção, nada copiado):

- Mapa especulativo dos Sete Refúgios (DeviantArt): https://www.deviantart.com/amanithelion/art/Avatar-Seven-Havens-Map-1391847114
- Mapa topográfico para impressão 3D: https://www.myminifactory.com/object/3d-print-avatar-the-last-airbender-topographic-map-206635
- Mapa interativo animado (itch.io): https://iyiyo.itch.io/avatarlastairbendermap
- Mapa do mundo para Civilization (CivFanatics): https://forums.civfanatics.com/threads/radsters-avatar-last-airbender-huge-world-map-128-80.558476/
- Mapa do servidor de Minecraft Avatarverse: https://wiki.avatarverse.net/pages/theWorld/map.html

Não foi encontrado nenhum repositório aberto com o mundo Avatar já georreferenciado (GeoJSON ou similar). A geografia deste projeto foi montada do zero.

## Como as posições foram definidas

1. O mapa-múndi oficial foi tratado como uma projeção plana do globo.
2. Continentes, ilhas e lugares receberam coordenadas aproximadas a partir da disposição conhecida desse mapa e das descrições relativas da série. Exemplos:
   - Ellora fica no sudeste do Grande Continente;
   - as Ilhas Flutuantes ficam a nordeste de Ellora, onde era a Baía Camaleão;
   - a Passagem da Serpente fica entre o Lago Oriental e o mar.
3. O gerador confere se cada lugar terrestre caiu em terra.
4. Posições `baixa` devem ser revisadas com o **modo editor** sobre a arte oficial (veja [ARTE-OFICIAL.md](ARTE-OFICIAL.md)).

## Ainda falta consultar

O ambiente onde o projeto foi montado bloqueava o acesso direto a alguns sites. Com acesso liberado, os próximos passos são:

- **Avatar Wiki** (`avatar.fandom.com`): campos de localização das páginas de cada lugar e o mapa-múndi.
- **Reddit:** r/TheLastAirbender e r/legendofkorra, onde há discussões sobre geografia, escala do mundo e mapas de fãs.
- **Wikipédia:** listas de episódios para conferir cada referência.
- **Quadrinhos e romances** listados acima, para lugares extras de cada era.
