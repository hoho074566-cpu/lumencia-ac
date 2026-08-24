// Lumensia V1.5.6 Deterministic Scene Novelty V1
// Bounded visible-term repetition tracking and change-first prompt guidance. No model calls.

import { classifySceneIntent } from './scene-momentum.js';

export const SCENE_NOVELTY_VERSION = '1.0';

const CONTINUE_ACTION_RE = /^\[LUMENSIA V1\.5\.6 CONTINUE\]/i;
const RECAP_REQUEST_RE = /(?:(?:다시|재차|한\s*번\s*더).{0,16}(?:말|설명|읽|보여|알려|정리|요약)|(?:되짚|복습|재설명|요약해|repeat|recap|explain\s+again))/iu;
const TERM_RE = /[\p{L}\p{N}_-]{2,28}/gu;
const LONG_PARTICLE_RE = /(?:에게서는|으로부터|에서는|으로는|로는|에게|한테|께서|에는|에서|으로)$/u;
const SHORT_PARTICLE_RE = /(?:은|는|이|가|을|를|로|와|과|도|만|의)$/u;
const ALLOWED_AXES = new Set([
  'location','time','npc-enter','npc-leave','npc-state','information','event','relationship',
  'objective','resource','growth','schedule','world-thread','danger','environment',
]);
const STOP_TERMS = new Set([
  '그리고','하지만','그러나','그래서','그대로','여전히','다시','조금','잠시','천천히','바로','현재','지금',
  '그곳','그녀','그는','그가','그를','그의','자신','모습','시선','사람','학생','있었다','있다','했다','한다',
  '되었다','된다','보였다','보인다','이었다','아니었다','않았다','없었다','the','and','that','with','from','this',
]);
const FLAG_AXES = Object.freeze({
  locationChanged:'location',timeAdvanced:'time',npcEntered:'npc-enter',npcLeft:'npc-leave',npcStateChanged:'npc-state',
  newInformation:'information',eventProgress:'event',relationshipChanged:'relationship',objectiveChanged:'objective',
  resourceChanged:'resource',growthChanged:'growth',scheduleChanged:'schedule',worldThreadChanged:'world-thread',
  dangerChanged:'danger',environmentChanged:'environment',
});

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function boundedTurn(value) {
  const number=Math.floor(Number(value||0));
  return Number.isFinite(number)?Math.min(1_000_000_000,Math.max(0,number)):0;
}
function clampText(value,max=120) { return String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max); }
function unique(values,limit=16) { return [...new Set(array(values).map((value)=>clampText(value,28)).filter(Boolean))].slice(-limit); }
function normalizeTerm(value='') {
  let term=String(value||'').trim().toLowerCase();
  const longStripped=term.replace(LONG_PARTICLE_RE,'');
  if(longStripped!==term&&longStripped.length>=2)term=longStripped;
  else if([...term].length<=3){const shortStripped=term.replace(SHORT_PARTICLE_RE,'');if(shortStripped.length>=2)term=shortStripped;}
  return term;
}
function visibleText(turn={}) {
  const row=object(turn);
  return [row.scene_title,row.scene_summary,...array(row.scene).map((item)=>item?.text)].filter(Boolean).join(' ');
}
function fingerprint(terms=[]) {
  const text=[...array(terms)].sort().join('|');
  if(!text)return'';
  let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16).padStart(8,'0');
}
function overlap(left=[],right=[]) {
  const a=new Set(array(left)),b=new Set(array(right));
  if(a.size<3||b.size<3)return{score:0,terms:[]};
  const terms=[...a].filter((term)=>b.has(term));
  return{score:terms.length/Math.min(a.size,b.size),terms};
}
function axesFromDelta(sceneDelta={}) {
  const flags=object(sceneDelta?.flags),axes=[];
  for(const [flag,axis] of Object.entries(FLAG_AXES))if(flags[flag])axes.push(axis);
  return axes;
}
function requestedRecap(action='') { return RECAP_REQUEST_RE.test(String(action||'').trim()); }

export function extractSceneNoveltyTerms(turn={}) {
  const ranked=new Map();
  for(const raw of visibleText(turn).match(TERM_RE)||[]){
    const term=normalizeTerm(raw);
    if(term.length<2||STOP_TERMS.has(term)||/^\d+$/.test(term))continue;
    const previous=ranked.get(term);
    ranked.set(term,previous?{...previous,count:previous.count+1}:{term,count:1,first:ranked.size});
  }
  return [...ranked.values()].sort((left,right)=>right.count-left.count||left.first-right.first).slice(0,16).map((row)=>row.term);
}

export function normalizeSceneNovelty(value={}) {
  const row=object(value),recentAxes=unique(row.recent_axes,6).filter((axis)=>ALLOWED_AXES.has(axis));
  return{
    version:SCENE_NOVELTY_VERSION,
    repetition_streak:Math.min(6,Math.max(0,Math.floor(Number(row.repetition_streak||0)))),
    last_fingerprint:clampText(row.last_fingerprint,16),
    recent_terms:unique(row.recent_terms,16),
    repeated_terms:unique(row.repeated_terms,8),
    recent_axes:recentAxes,
    last_similarity:Math.min(1,Math.max(0,Number(row.last_similarity||0))),
    last_turn:boundedTurn(row.last_turn),
  };
}

export function deriveSceneNovelty({ previousRuntime = {}, turn = {}, sceneDelta = {}, action = '', turnNumber = 0, mode = 'game' } = {}) {
  const previous=normalizeSceneNovelty(previousRuntime?.novelty);
  if(mode==='continue'||mode==='meta'||CONTINUE_ACTION_RE.test(String(action||'').trim()))return previous;
  const terms=extractSceneNoveltyTerms(turn),comparison=overlap(terms,previous.recent_terms),flags=object(sceneDelta?.flags);
  const structural=Math.max(0,Number(sceneDelta?.structuralScore||0));
  const sceneBoundary=Boolean(flags.locationChanged||flags.npcEntered||flags.npcLeft||flags.eventProgress);
  const repeated=!requestedRecap(action)&&!sceneBoundary&&structural===0&&comparison.terms.length>=3&&comparison.score>=0.65;
  const repetitionStreak=repeated?Math.min(6,previous.repetition_streak+1):0;
  const currentAxes=axesFromDelta(sceneDelta);
  const recentAxes=sceneBoundary?currentAxes:unique([...previous.recent_axes,...currentAxes],6);
  return normalizeSceneNovelty({
    repetition_streak:repetitionStreak,
    last_fingerprint:fingerprint(terms),
    recent_terms:terms.length?terms:previous.recent_terms,
    repeated_terms:repeated?comparison.terms:[],
    recent_axes:recentAxes,
    last_similarity:Number(comparison.score.toFixed(3)),
    last_turn:turnNumber,
  });
}

export function buildSceneNoveltyDirective({ action = '', saveState = {}, recentTurns = [] } = {}) {
  const rawAction=String(action||'').trim();
  if(CONTINUE_ACTION_RE.test(rawAction))return [
    '[DETERMINISTIC SCENE NOVELTY V1 — CONTINUE PRESERVE]',
    '- 같은 순간을 확장하는 CONTINUE에서는 novelty 상태를 진행하거나 반복 해소용 사건을 만들지 않는다.',
    '- 직전 응답의 대사·목록·정보를 다시 출력하지 말고 이미 발생한 표현만 보강한다.',
  ].join('\n');
  if(requestedRecap(rawAction))return [
    '[DETERMINISTIC SCENE NOVELTY V1 — REQUESTED RECAP]',
    '- 사용자가 명시적으로 재설명/요약을 요청했다. 요청한 범위만 정확히 다시 제시하고, 반복 회피를 이유로 새 사건이나 상태 변화를 날조하지 않는다.',
  ].join('\n');
  const novelty=normalizeSceneNovelty(saveState?.sceneRuntime?.novelty),lastTurn=array(recentTurns).slice(-1)[0];
  const recentTerms=novelty.recent_terms.length?novelty.recent_terms:extractSceneNoveltyTerms(lastTurn||{});
  const intent=classifySceneIntent(rawAction,{location:saveState?.world?.location||''}),decisionSensitive=intent.kind==='decision-sensitive';
  if(!recentTerms.length&&novelty.repetition_streak===0)return'';
  const lines=[
    '[DETERMINISTIC SCENE NOVELTY V1 — CHANGE-FIRST]',
    `REPETITION_STREAK=${novelty.repetition_streak}`,
    ...(recentTerms.length?[`RECENT_VISIBLE_TERMS=${recentTerms.slice(0,8).join(',')}`]:[]),
    '- RECENT_VISIBLE_TERMS는 다시 출력할 체크리스트가 아니다. 사용자가 요구하지 않았고 실제 변화도 없다면 그 장소·공지·목록·사실을 재열거하지 않는다.',
    '- scene_title이나 문장 표현만 바꾼 것은 새 정보/새 장면으로 취급하지 않는다. 직전 이후 달라진 결과를 먼저 쓴다.',
  ];
  if(decisionSensitive)lines.push('- QUESTION BOUNDARY: 질문·고민에는 현재 정보로 직접 답하되, 반복을 피한다는 이유로 시간·위치·사건을 강제 진행하거나 플레이어 선택을 대신하지 않는다.');
  else lines.push('- 현재 USER ACTION과 고정 일정/진행 사건을 우선 완료한다. 그 뒤에도 중요한 선택점이 아니라면 기존 NPC 목표·일정·공개 세계 상태에 근거한 작은 실제 변화로 다음 방향을 만든다.');
  if(novelty.repetition_streak>=1)lines.push(`REPEAT_GUARD=required\n- 반복 감지 요소(${novelty.repeated_terms.slice(0,5).join(',')||'최근 장면 요소'})를 같은 상태로 다시 나열해 끝내지 않는다. 대형 사건 대신 허용된 작은 변화나 새 관련 정보로 진행한다.`);
  return lines.join('\n');
}
