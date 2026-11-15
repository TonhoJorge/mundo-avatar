// Definições das três épocas (textos em português; traduções em public/i18n/).

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
    sources: 'Avatar: Sete Refúgios (2026–). Série em exibição: informações e posições ainda podem mudar. Akasha, Montanha da Pena e o refúgio das Ilhas do Fogo estão em posições estimadas a partir da arte oficial dos sete refúgios vistos do espaço.',
  },
];

export const eraById = (id) => ERAS.find((e) => e.id === id);

// Nomes das nações, tipos etc. ficam no dicionário (chaves nation.*, type.*).
export const NATION = {
  earth: { color: '#5c8040', text: '#34502a' },
  fire: { color: '#b03426', text: '#7a2418' },
  water: { color: '#3868a0', text: '#22507e' },
  air: { color: '#d69634', text: '#875a12' },
  republic: { color: '#96683c', text: '#6a4424' },
  havens: { color: '#d4aa48', text: '#7a5a14' },
  none: { color: '#8a7a66', text: '#4a3a2a' },
};
