import { buildFateBackgroundState, normalizeFateBackgroundState } from './fate-background.js';
import { buildFatePersonalStoryState, normalizeFatePersonalStoryState } from './fate-personal-story.js';

export const FATE_START_GENDERS = Object.freeze({
  male: '남성',
  female: '여성',
});

export const FATE_START_SOCIAL_CLASSES = Object.freeze({
  commoner: '평민',
  fallen_noble: '몰락귀족',
});

export const FATE_START_DEPARTMENTS = Object.freeze([
  '기사과 1학년',
  '마법과 1학년',
  '신학부 1학년',
  '일반학부 1학년',
]);

const REGION_PROFILES = Object.freeze({
  north: Object.freeze({
    label: '제국 북부',
    commonerOccupations: Object.freeze([
      ['mine_helper','탄광 광부의 조수','채굴 도구 사용'],
      ['logger','벌목꾼','벌목 도구 사용'],
      ['hunter','사냥꾼의 견습','야외 추적'],
      ['border_runner','변경 마을의 심부름꾼','야전 생존'],
    ]),
    commonerIncidents: Object.freeze(['겨울 갱도 붕괴에서 이웃들을 대피시켰다','마물에게 끊긴 산길을 우회해 약품을 전했다','폭설 속에서 실종된 사냥꾼을 찾아냈다']),
    nobleIncidents: Object.freeze(['국경전쟁으로 영지와 저택을 잃었다','귀족 간 영지 분쟁에서 패해 작위만 남았다','광산 붕괴와 연이은 흉작으로 영지 경영이 무너졌다']),
    mentors: Object.freeze(['은퇴한 변경 수비대원 로데릭','산촌의 약초사 마르타','북부 순회 교사 오스윈']),
    connections: Object.freeze(['광산 조합의 오래된 지인','변경 수비대의 하급 서기관','산촌 사냥꾼 모임']),
  }),
  south: Object.freeze({
    label: '제국 남부',
    commonerOccupations: Object.freeze([
      ['trade_clerk','소상단의 장부 보조','거래 감각'],
      ['dockhand','항구 하역 견습','항만 작업'],
      ['caravan_guide','상단 마차의 길잡이','길 찾기'],
      ['deckhand','연안 선박의 갑판 견습','선박 작업'],
    ]),
    commonerIncidents: Object.freeze(['폭풍 뒤 표류한 화물을 회수해 마을의 손실을 줄였다','사라진 상단 장부의 오류를 찾아 누명을 벗겼다','해적 경보 속에서 피난선을 안전한 부두로 유도했다']),
    nobleIncidents: Object.freeze(['무역선단의 연쇄 침몰로 가문이 파산했다','보증을 선 상단이 도산해 영지와 작위를 잃었다','항구 이권을 둘러싼 귀족 분쟁에서 밀려났다']),
    mentors: Object.freeze(['노련한 항해사 베른','은퇴한 상단 회계사 헤스티아','남부 항구의 치안관 코렌']),
    connections: Object.freeze(['연안 선원 조합의 연락책','남부 상단의 말단 점원','항구 구호소의 봉사자들']),
  }),
  east: Object.freeze({
    label: '제국 동부',
    commonerOccupations: Object.freeze([
      ['farmhand','농가의 일꾼','농경 지식'],
      ['herder','목동','가축 돌보기'],
      ['herbalist','약초꾼의 견습','약초 식별'],
      ['village_aide','마을 공동창고의 관리 보조','생활 기술'],
    ]),
    commonerIncidents: Object.freeze(['병든 가축의 원인을 찾아 마을의 피해를 막았다','홍수로 무너진 둑을 밤새 보수하는 데 앞장섰다','독초가 섞인 공동 약재를 골라내 환자를 지켰다']),
    nobleIncidents: Object.freeze(['연이은 흉작과 세금 체납으로 영지를 잃었다','관개 사업의 실패가 정치적 실책으로 번져 가문이 몰락했다','경계 토지 소송에서 패해 가문의 기반이 사라졌다']),
    mentors: Object.freeze(['동부 촌락의 약사 에드나','퇴역 기병 로웰','마을 서당의 교사 토먼']),
    connections: Object.freeze(['동부 농민 협동회의 지인','목축 마을의 운송업자','순회 약재상의 연락처']),
  }),
});

const FALLEN_NOBLE_OCCUPATIONS = Object.freeze([
  ['estate_clerk','남은 가문 장부의 정리 보조','문서 정리'],
  ['library_keeper','팔려 나가기 전 가문 서고의 관리인','고문서 독해'],
  ['retainer_trainee','옛 가신에게 배운 호위 견습','기초 호위술'],
  ['debt_envoy','채권자와 영지민 사이의 연락역','교섭 예절'],
]);

const FAMILY_STATES = Object.freeze({
  commoner: Object.freeze(['부모와 두 동생이 고향에 남아 있다','한부모 가정의 생계를 함께 책임졌다','친척들과 작은 공동가구를 이루어 살았다','가족 없이 마을 공동체의 보살핌을 받았다']),
  fallen_noble: Object.freeze(['가족은 빚을 갚기 위해 흩어졌고 이름만 남았다','부모가 가문의 명예 회복을 포기하고 은거했다','어린 형제자매와 함께 마지막 별채에서 지냈다','가문의 직계는 끊기고 먼 친족의 보호만 남았다']),
});

const DEPARTMENT_SKILLS = Object.freeze({
  '기사과 1학년': Object.freeze(['기초 검술','기초 창술','방패 운용']),
  '마법과 1학년': Object.freeze(['마나 감지','기초 마법 이론','마력 제어']),
  '신학부 1학년': Object.freeze(['기초 신학','응급 처치','정화 의식 기초']),
  '일반학부 1학년': Object.freeze(['기초 체술','문서 실무','학업 기초']),
});

const APPEARANCES = Object.freeze([
  '또래와 비슷한 체격에 오래 손질해 입은 수수한 옷차림이다.',
  '눈에 띄지 않는 키와 체격이며, 이동에 편한 단정한 복장을 골랐다.',
  '평범한 인상과 차분한 눈매를 지녔고 장식 없는 외투를 입는다.',
  '약간 마른 체격이지만 건강해 보이며, 실용적인 낡은 가방을 멘다.',
  '햇볕에 그을린 피부와 평범한 체격, 여러 번 기운 옷소매가 특징이다.',
  '단정히 정리한 머리와 무난한 인상으로 군중 속에서는 쉽게 눈에 띄지 않는다.',
]);

const GIVEN_NAMES = Object.freeze({
  male: Object.freeze(['카엘','도리안','테오','에런','로한','니콜','마틴','제런']),
  female: Object.freeze(['마렌','엘라','노엘라','벨라','로미','테사','니아','헤일라']),
});
const FALLEN_HOUSES = Object.freeze(['베일','로웬','에버른','테르반','하르트','모렌']);

function cleanText(value,max=320){return String(value||'').trim().slice(0,max);}
function clampInt(value,min,max){return Math.min(max,Math.max(min,Math.trunc(Number(value)||0)));}
function uniqueStrings(value,limit,max=160){return [...new Set((Array.isArray(value)?value:[]).map(item=>cleanText(item,max)).filter(Boolean))].slice(0,limit);}
function hashSeed(value){let hash=2166136261;for(const ch of String(value)){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}
function seededRandom(seed){let state=hashSeed(seed)||0x6d2b79f5;return()=>{state+=0x6d2b79f5;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};}
function randomSeed(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;}
function pick(values,rng){return values[Math.min(values.length-1,Math.floor(rng()*values.length))];}
function rollAxis(rng,minimum=1){return Math.max(minimum,1+Math.floor(rng()*3));}

function normalizeAxes(value){
  const keys=['body','mana','intelligence','divinity'];
  if(!value||keys.some(key=>!Number.isInteger(value[key])||value[key]<1||value[key]>9))return null;
  return Object.fromEntries(keys.map(key=>[key,value[key]]));
}
function normalizeTalents(value){
  const keys=['magic','martial','soul','knowledge'];
  if(!value||keys.some(key=>!Number.isInteger(value[key])||value[key]<1||value[key]>10))return null;
  return Object.fromEntries(keys.map(key=>[key,value[key]]));
}

export function fateOriginLockOptions(socialClass='commoner'){
  const regions=Object.entries(REGION_PROFILES).map(([key,row])=>({key,label:row.label}));
  const occupations=socialClass==='fallen_noble'
    ? FALLEN_NOBLE_OCCUPATIONS.map(([key,label])=>({key,label,regionKey:null}))
    : Object.entries(REGION_PROFILES).flatMap(([regionKey,row])=>row.commonerOccupations.map(([key,label])=>({key,label,regionKey})));
  return{regions,occupations};
}

export function validateFateOriginLocks({socialClass='commoner',region='',occupation=''}={}){
  const regionKey=cleanText(region,40),occupationKey=cleanText(occupation,60),options=fateOriginLockOptions(socialClass);
  if(regionKey&&!options.regions.some((row)=>row.key===regionKey))return false;
  const occupationRow=occupationKey?options.occupations.find((row)=>row.key===occupationKey):null;
  if(occupationKey&&!occupationRow)return false;
  return !(regionKey&&occupationRow?.regionKey&&occupationRow.regionKey!==regionKey);
}

export function normalizeFateOrigin(value){
  if(!value||typeof value!=='object')return null;
  const baseStats=normalizeAxes(value.baseStats),talents=normalizeTalents(value.talents),originStory=uniqueStrings(value.originStory,7,360),skillsLearned=uniqueStrings(value.skillsLearned,6,80),socialConnections=uniqueStrings(value.socialConnections,4,160),backgroundFlags=uniqueStrings(value.backgroundFlags,12,100);
  const required=['seedTag','name','gender','socialClass','department','region','familyState','occupation','pastIncident','mentor','admissionCause','appearance','realm'];
  if(required.some(key=>!cleanText(value[key],360))||!baseStats||!talents||originStory.length<4||skillsLearned.length<2||!socialConnections.length||!backgroundFlags.length)return null;
  if(!Object.hasOwn(FATE_START_GENDERS,value.gender)||!Object.hasOwn(FATE_START_SOCIAL_CLASSES,value.socialClass)||!FATE_START_DEPARTMENTS.includes(value.department))return null;
  return {
    version:1,seedTag:cleanText(value.seedTag,80),name:cleanText(value.name,40),age:clampInt(value.age,17,24),gender:value.gender,socialClass:value.socialClass,department:value.department,
    regionKey:Object.hasOwn(REGION_PROFILES,value.regionKey)?value.regionKey:'',region:cleanText(value.region,80),familyState:cleanText(value.familyState),
    occupationKey:cleanText(value.occupationKey,60),occupation:cleanText(value.occupation),pastIncident:cleanText(value.pastIncident),mentor:cleanText(value.mentor),
    admissionCause:cleanText(value.admissionCause),skillsLearned,socialConnections,backgroundFlags,baseStats,talents,
    appearance:cleanText(value.appearance,800),realm:cleanText(value.realm,100),originStory,
  };
}

export function renderFateOriginStory(origin){
  const value=normalizeFateOrigin({...origin,originStory:['draft-1','draft-2','draft-3','draft-4']});
  if(!value)throw new Error('운명 시작 Origin 구조가 올바르지 않음.');
  const classLabel=FATE_START_SOCIAL_CLASSES[value.socialClass];
  return [
    `${value.name}은(는) ${value.region}에서 ${classLabel}의 삶을 시작했다. ${value.familyState}`,
    `${value.occupation}으로 지내며 화려하지 않은 일상의 기술을 익혔다.`,
    `${value.pastIncident} 이 일은 타고난 영웅의 증명이 아니라, 앞으로 무엇을 배울지 정한 계기가 되었다.`,
    `${value.mentor}에게서 ${value.skillsLearned.join('과 ')}의 기초를 배웠다.`,
    `${value.admissionCause}을(를) 통해 루멘시아 아카데미의 신입생이 되었다.`,
  ];
}

function buildStructuredOrigin({gender,socialClass,department,seed,originLocks={}}){
  if(!validateFateOriginLocks({socialClass,region:originLocks.region,occupation:originLocks.occupation}))throw new Error('선택한 Origin 지역과 직업 lock이 양립하지 않음.');
  const seedTag=cleanText(seed||randomSeed(),80),rng=seededRandom(seedTag),options=fateOriginLockOptions(socialClass);
  const occupationOption=originLocks.occupation?options.occupations.find((row)=>row.key===originLocks.occupation):null;
  const regionKey=cleanText(originLocks.region,40)||occupationOption?.regionKey||pick(Object.keys(REGION_PROFILES),rng),region=REGION_PROFILES[regionKey];
  const occupationPool=socialClass==='commoner'?region.commonerOccupations:FALLEN_NOBLE_OCCUPATIONS;
  const occupationRow=originLocks.occupation?occupationPool.find((row)=>row[0]===originLocks.occupation):pick(occupationPool,rng);
  if(!occupationRow)throw new Error('선택한 Origin 직업 lock이 현재 지역과 양립하지 않음.');
  const mentor=pick(region.mentors,rng),connection=pick(region.connections,rng);
  const given=pick(GIVEN_NAMES[gender],rng),name=socialClass==='fallen_noble'?`${given} ${pick(FALLEN_HOUSES,rng)}`:given;
  const departmentSkill=pick(DEPARTMENT_SKILLS[department],rng),originSkill=occupationRow[2],skillsLearned=[originSkill,departmentSkill];
  const baseStats={body:rollAxis(rng,department==='기사과 1학년'?2:1),mana:rollAxis(rng,department==='마법과 1학년'?2:1),intelligence:rollAxis(rng,['마법과 1학년','일반학부 1학년'].includes(department)?2:1),divinity:rollAxis(rng,department==='신학부 1학년'?2:1)};
  const talents={magic:rollAxis(rng,department==='마법과 1학년'?2:1),martial:rollAxis(rng,department==='기사과 1학년'?2:1),soul:rollAxis(rng,department==='신학부 1학년'?2:1),knowledge:rollAxis(rng,department==='일반학부 1학년'?2:1)};
  const admissions=[`${mentor}의 추천`,`${region.label} 공개 선발 시험 합격`,`${occupationRow[1]} 경험을 인정받은 ${department.replace(' 1학년','')} 실기 전형`,`${connection}의 공동 보증`];
  const structured={
    version:1,seedTag,name,age:17+Math.floor(rng()*5),gender,socialClass,department,regionKey,region:region.label,familyState:pick(FAMILY_STATES[socialClass],rng),
    occupationKey:occupationRow[0],occupation:occupationRow[1],pastIncident:pick(socialClass==='commoner'?region.commonerIncidents:region.nobleIncidents,rng),mentor,
    admissionCause:pick(admissions,rng),skillsLearned,socialConnections:[`${mentor}와의 사제 인연`,connection],
    backgroundFlags:[`class:${socialClass}`,`region:${regionKey}`,`occupation:${occupationRow[0]}`,`department:${FATE_START_DEPARTMENTS.indexOf(department)}`],
    baseStats,talents,appearance:pick(APPEARANCES,rng),realm:department==='마법과 1학년'?'1서클':'비기너',originStory:[],
  };
  structured.originStory=renderFateOriginStory(structured);
  return normalizeFateOrigin(structured);
}

function evaluatedRealm(origin){
  const stats=origin.baseStats,talents=origin.talents;
  if(origin.department==='마법과 1학년'){
    const score=Math.max(stats.mana,talents.magic);
    return `${Math.max(1,Math.min(5,Math.ceil((score-1)/2)))}서클`;
  }
  const score=Math.max(stats.body,talents.martial,stats.divinity,talents.soul);
  if(score>=9)return'마스터';
  if(score>=7)return'익스퍼트 상급';
  if(score>=5)return'익스퍼트 초급';
  return'비기너';
}

function originPcFields(origin,gender,department){
  const grade={1:'F',2:'E',3:'D',4:'C',5:'B',6:'A',7:'S',8:'SS',9:'SSS'},stats=origin.baseStats;
  return {
    name:origin.name,age:origin.age,gender:FATE_START_GENDERS[gender],department,origin:`${origin.region} · ${origin.occupation}`,
    socialStatus:FATE_START_SOCIAL_CLASSES[origin.socialClass],admission:origin.admissionCause,appearance:origin.appearance,characterSetting:origin.originStory.join('\n'),realm:evaluatedRealm(origin),
    talents:{...origin.talents},stats:{'신체':{grade:grade[stats.body],progress:0},'마나':{grade:grade[stats.mana],progress:0},'지능':{grade:grade[stats.intelligence],progress:0},'신성':{grade:grade[stats.divinity],progress:0}},
    skills:Object.fromEntries(origin.skillsLearned.map(name=>[name,{grade:'E',hiddenXp:0}])),
  };
}

export function materializeFateStartingCharacter(originValue){
  const origin=normalizeFateOrigin(originValue);if(!origin)throw new Error('운명 시작 Origin 구조가 올바르지 않음.');
  const background=buildFateBackgroundState(origin);
  return{
    creation:{mode:'fate',fateStart:{version:2,gender:origin.gender,socialClass:origin.socialClass,department:origin.department,origin,background,personalStory:buildFatePersonalStoryState(origin,background)}},
    pc:originPcFields(origin,origin.gender,origin.department),
  };
}

export function createFreeCharacterCreation() {
  return { mode: 'free', fateStart: null };
}

export function createFateCharacterCreation({ gender, socialClass, department } = {}) {
  if (!Object.hasOwn(FATE_START_GENDERS, gender)) throw new Error('운명 시작 성별을 선택해야 함.');
  if (!Object.hasOwn(FATE_START_SOCIAL_CLASSES, socialClass)) throw new Error('운명 시작 신분을 선택해야 함.');
  if (!FATE_START_DEPARTMENTS.includes(department)) throw new Error('운명 시작 학과를 선택해야 함.');
  return {
    mode: 'fate',
    fateStart: {
      version: 1,
      gender,
      socialClass,
      department,
    },
  };
}

export function generateFateStartingCharacter({gender,socialClass,department,seed,originLocks}={}){
  createFateCharacterCreation({gender,socialClass,department});
  return materializeFateStartingCharacter(buildStructuredOrigin({gender,socialClass,department,seed,originLocks}));
}

export function normalizeCharacterCreation(value) {
  if (!value || value.mode !== 'fate') return createFreeCharacterCreation();
  try {
    const base=createFateCharacterCreation(value.fateStart),origin=normalizeFateOrigin(value.fateStart?.origin),consistent=origin&&origin.gender===base.fateStart.gender&&origin.socialClass===base.fateStart.socialClass&&origin.department===base.fateStart.department;
    if(!consistent)return base;
    const background=normalizeFateBackgroundState(value.fateStart?.background,origin);
    return{mode:'fate',fateStart:{...base.fateStart,version:2,origin,background,personalStory:normalizeFatePersonalStoryState(value.fateStart?.personalStory,origin,background)}};
  } catch {
    return createFreeCharacterCreation();
  }
}

export function fateStartLabels(value) {
  const normalized = createFateCharacterCreation(value).fateStart;
  return {
    gender: FATE_START_GENDERS[normalized.gender],
    socialClass: FATE_START_SOCIAL_CLASSES[normalized.socialClass],
    department: normalized.department,
  };
}
