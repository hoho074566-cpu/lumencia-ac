// Lumensia characters-v2 portrait routing
// PNG legacy assets are intentionally not used.

const CHARACTER_V2_BASE =
  'https://raw.githubusercontent.com/dudghl/test/main/assets/characters-v2';

const PORTRAIT_EXPRESSIONS = Object.freeze([
  'default',
  'smile',
  'laugh',
  'smug',
  'blush',
  'flustered',
  'serious',
  'annoyed',
  'angry',
  'worried',
  'sad',
  'confused',
  'shock',
]);

function portraitUrl(folder, expression = 'default') {
  return `${CHARACTER_V2_BASE}/${folder}/portrait/${expression}.webp`;
}

function character(name, folder) {
  return {
    name,
    folder,
    default: portraitUrl(folder, 'default'),
    expressions: Object.fromEntries(
      PORTRAIT_EXPRESSIONS
        .filter((expression) => expression !== 'default')
        .map((expression) => [expression, portraitUrl(folder, expression)])
    ),
  };
}

export const ASSETS = {
  base: CHARACTER_V2_BASE,

  characters: {
    anastasia: character('아나스타샤', 'anastasia'),
    aria: character('아리아', 'aria'),
    arien: character('아리엔', 'arien'),
    aris: character('아리스', 'aris'),
    artemis: character('아르테미스', 'artemis'),
    asmo: character('아스모', 'asmo'),
    beelzebub: character('벨제붑', 'beelzebub'),
    bellian: character('벨리안', 'bellian'),
    carne: character('카르네', 'carne'),
    chloe: character('클로에', 'chloe'),
    delpirem: character('델피렘', 'delpirem'),
    elena: character('엘레나', 'elena'),
    elise: character('엘리제', 'elise'),
    emily: character('에밀리', 'emily'),
    etera: character('에테라', 'etera'),
    fria: character('프리아', 'fria'),
    isabel: character('이사벨', 'isabel'),
    kartia: character('카르티아', 'kartia'),
    laris: character('라리스', 'laris'),
    lena: character('레나', 'lena'),
    levian: character('레비안', 'levian'),
    lilia: character('릴리아', 'lilia'),
    lily_lumina: character('릴리 루미나', 'lily_lumina'),
    lucia: character('루시아', 'lucia'),
    mirabelle: character('미라벨', 'mirabelle'),
    nemesis: character('네메시스', 'nemesis'),
    sera: character('세라', 'sera'),
    serena: character('세레나', 'serena'),
    seriel: character('세리엘', 'seriel'),
    sia: character('시아', 'sia'),
    sloth: character('슬로스', 'sloth'),
    veradin: character('베라딘', 'veradin'),
  },

  // 현재 배포 assets.js의 CG가 비어 있으므로 그대로 유지.
  // 나중에 CG를 추가할 때 이 객체에만 넣으면 된다.
  cg: {},
};
