// Definições das três épocas e rótulos usados na interface.

export const ERAS = [
  {
    id: 'aang',
    label: 'Era de Aang',
    short: 'Aang',
    years: '99–100 DG',
    overlay: 'clouds',
    summary:
      'A Guerra dos Cem Anos chega ao fim. A Nação do Fogo domina colônias no oeste do Reino da Terra e os Nômades do Ar foram exterminados há um século. Aang, o último dobrador de ar, desperta de um iceberg e precisa dominar os quatro elementos antes do Cometa de Sozin.',
    sources: 'Avatar: A Lenda de Aang (2005–2008) e quadrinhos da sequência.',
  },
  {
    id: 'korra',
    label: 'Era de Korra',
    short: 'Korra',
    years: '170–174 DG',
    overlay: 'clouds',
    summary:
      'Setenta anos após a guerra, as antigas colônias formam a República Unida das Nações, com a moderna Cidade República. Korra reabre os portais espirituais, enfrenta a Lótus Vermelha e detém o Império da Terra de Kuvira.',
    sources: 'A Lenda de Korra (2012–2014) e quadrinhos da sequência.',
  },
  {
    id: 'havens',
    label: 'Era de Pavi e Nisha',
    short: 'Pavi e Nisha',
    years: '≈ 399 DG',
    overlay: 'storms',
    summary:
      'Cerca de 225 anos depois de Korra, um Cataclismo derrubou as Quatro Nações. A humanidade sobrevive em sete refúgios isolados, cercados pelas Terras Duras e castigados por tempestades. Os gêmeos Pavi e Nisha, de Ellora, estão no centro da disputa sobre quem é o verdadeiro Avatar.',
    sources: 'Avatar: Sete Refúgios (2026–). Série em exibição: informações e posições ainda podem mudar.',
    unknown: [
      'Montanha da Pena — governada pela imperatriz Yeshe, preserva as tradições dos Nômades do Ar; localização não revelada',
      'Sétimo refúgio — ainda não revelado',
    ],
  },
];

export const eraById = (id) => ERAS.find((e) => e.id === id);

export const NATION = {
  earth: { label: 'Reino da Terra', color: '#5c8040', text: '#34502a' },
  fire: { label: 'Nação do Fogo', color: '#b03426', text: '#7a2418' },
  water: { label: 'Tribos da Água', color: '#3868a0', text: '#22507e' },
  air: { label: 'Nômades do Ar', color: '#d69634', text: '#875a12' },
  republic: { label: 'República Unida', color: '#96683c', text: '#6a4424' },
  havens: { label: 'Sete Refúgios', color: '#d4aa48', text: '#7a5a14' },
  none: { label: 'Sem nação', color: '#8a7a66', text: '#4a3a2a' },
};

export const TYPE_LABEL = {
  capital: 'Capital',
  city: 'Cidade',
  village: 'Vila',
  temple: 'Templo',
  haven: 'Refúgio',
  landmark: 'Lugar notável',
  spirit: 'Lugar espiritual',
  region: 'Região',
  water: 'Águas',
};

export const CONF_LABEL = {
  alta: 'Posição confiável',
  media: 'Posição aproximada',
  baixa: 'Posição estimada',
};

export const CANON_LABEL = {
  serie: 'Série animada',
  quadrinhos: 'Quadrinhos',
  livros: 'Livros',
  rumor: 'Especulação',
};
