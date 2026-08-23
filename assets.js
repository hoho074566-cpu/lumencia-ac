// LUMENSIA MOBILE V1.4.9 — characters-v2 live manifest router
// PNG legacy assets are intentionally not used.

const CHARACTER_V2_BASE =
  'https://raw.githubusercontent.com/dudghl/test/main/assets/characters-v2';

export const ASSET_MANIFEST_VERSION = 'characters-v2-availability-2026-08-23';

export const CANONICAL_PORTRAIT_EXPRESSIONS = Object.freeze([
  'default',
  'smile',
  'blush',
  'serious',
  'angry',
  'sad',
  'shock',
  'smug',
  'annoyed',
  'worried',
  'confused',
  'laugh',
  'flustered',
]);

const NON_DEFAULT_EXPRESSIONS = CANONICAL_PORTRAIT_EXPRESSIONS.filter(
  (expression) => expression !== 'default'
);

// 2026-08-23 asset refresh: every characters-v2 folder except Anastasia now has
// portrait/default.webp plus all 12 non-default portrait expressions.
const FULL_V2_CHARACTERS = [
  'aria',
  'arien',
  'aris',
  'artemis',
  'asmo',
  'beelzebub',
  'bellian',
  'carne',
  'chloe',
  'delpirem',
  'elena',
  'elise',
  'emily',
  'etera',
  'fria',
  'isabel',
  'kartia',
  'laris',
  'lena',
  'levian',
  'lillia',
  'lily_lumina',
  'lucia',
  'mirabelle',
  'nemesis',
  'sera',
  'serena',
  'seriel',
  'sia',
  'sloth',
  'veradin',
];

// Anastasia intentionally has no portrait/default.webp, but all 12 expression
// portraits and fullbody/default.webp are present.
const V2_AVAILABILITY = Object.freeze({
  ...Object.fromEntries(FULL_V2_CHARACTERS.map((key) => [key, CANONICAL_PORTRAIT_EXPRESSIONS])),
  anastasia: NON_DEFAULT_EXPRESSIONS,
});

function portraitUrl(folder, expression = 'default') {
  return `${CHARACTER_V2_BASE}/${folder}/portrait/${expression}.webp`;
}

function fullbodyUrl(folder) {
  return `${CHARACTER_V2_BASE}/${folder}/fullbody/default.webp`;
}

function character(name, folder) {
  const portraits = V2_AVAILABILITY[folder] || [];
  const available = portraits.length > 0;
  const hasDefault = portraits.includes('default');
  return {
    name,
    folder,
    available,
    default: hasDefault ? portraitUrl(folder, 'default') : null,
    portraitDefault: hasDefault ? portraitUrl(folder, 'default') : null,
    fullbody: available ? fullbodyUrl(folder) : null,
    expressions: Object.fromEntries(
      portraits
        .filter((expression) => expression !== 'default')
        .map((expression) => [expression, portraitUrl(folder, expression)])
    ),
  };
}

export const ASSETS = {
  version: ASSET_MANIFEST_VERSION,
  base: CHARACTER_V2_BASE,
  liveFolders: Object.keys(V2_AVAILABILITY),
  portraitExpressions: [...CANONICAL_PORTRAIT_EXPRESSIONS],

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
    lillia: character('릴리아', 'lillia'),
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

  cg: {},
};
