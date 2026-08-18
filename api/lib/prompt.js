import { CANON } from './canon-data.js';
import { GM_RULES } from './gm-rules.js';
import { CHARACTER_REGISTRY_TEXT } from './character-registry.js';
import { compactSaveForModel, serializeCompactSaveForPrompt } from './memory.js';

const cut = (value, max = 9000) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}\n...[잘림]` : text;
};

const compactRecentTurns = (recentTurns = []) => recentTurns.slice(-4).map((turn) => ({
  action: cut(turn?.action || '', 700),
  summary: cut(turn?.summary || '', 900),
  scene: (turn?.scene || []).slice(-6).map((item) => ({
    kind: item?.kind,
    text: cut(item?.text || '', 360),
    speaker_key: item?.speaker_key || null,
    expression: item?.display_expression || item?.expression || null,
  })),
}));

function extractNumberedSection(text, number) {
  const re = new RegExp(`(?:^|\\n)=+\\n${number}\\. [^\\n]+\\n=+\\n([\\s\\S]*?)(?=\\n=+\\n${number + 1}\\. |$)`);
  const match = String(text || '').match(re);
  return match ? match[0].trim() : '';
}

const INFO_ACCESS_REFERENCE = extractNumberedSection(CANON.current, 3);
const EVENT_SECTION = extractNumberedSection(CANON.current, 4);
const EVENT_BLOCKS = (() => {
  const blocks = [];
  const re = /\[([A-Z])\.\s*([^\]\n]+)\]\n([\s\S]*?)(?=\n\[[A-Z]\.\s*|$)/g;
  let match;
  while ((match = re.exec(EVENT_SECTION))) {
    const rawTitle = match[2].trim();
    const title = rawTitle.split('—')[0].trim();
    blocks.push({ title, text: `[${match[1]}. ${rawTitle}]\n${match[3].trim()}` });
  }
  return blocks;
})();

const EVENT_KEYWORDS = Object.freeze({
  '입학식/학과 오리엔테이션': ['입학식','오리엔테이션','대강당','학과 좌석'],
  '신입생 기량평가': ['기량평가','기량 평가','분반 평가','교수평가'],
  '회색 늑대의 숲': ['회색 늑대의 숲','트윈헤드 울프','늑대 토벌','토벌 의뢰'],
  '황위 경쟁': ['황위 경쟁','황위 계승','황권','계승 경쟁','황제 계승','파벌 정치'],
});

function eventBlockForName(name) {
  const clean = String(name || '').trim();
  return EVENT_BLOCKS.find((block) => clean.includes(block.title) || block.title.includes(clean)) || null;
}
function eventContext(saveState = {}, action = '', recentTurns = [], rollingSummary = '') {
  const recent = recentTurns.slice(-4).flatMap((turn) => [turn?.action || '', turn?.summary || '']);
  return [action, saveState?.world?.location || '', ...recent].filter(Boolean).join('\n');
}
function eventIsRelevant(name, context) {
  const keywords = EVENT_KEYWORDS[name] || [String(name || '')];
  return keywords.filter(Boolean).some((word) => context.includes(word));
}
function eventReferenceBundle(saveState = {}, { action = '', recentTurns = [], rollingSummary = '' } = {}) {
  const completed = new Set((saveState?.completedEvents || []).map((x) => String(x).trim()));
  const active = (saveState?.activeEvents || []).map((x) => String(x).trim()).filter((x) => x && !completed.has(x));
  const scheduled = (saveState?.scheduledEvents || []).map((x) => String(x).trim()).filter((x) => x && !completed.has(x));
  const worldArcs = (saveState?.worldArcs || []).map((x) => String(x).trim()).filter((x) => x && !completed.has(x));
  const context = eventContext(saveState, action, recentTurns, rollingSummary);
  const dayElapsed = Number(saveState?.world?.dayElapsed || 0);

  const activeBlocks = active.map(eventBlockForName).filter(Boolean);
  const unknownActive = active.filter((name) => !eventBlockForName(name));

  const scheduledRelevant = scheduled.filter((name) => eventIsRelevant(name, context) || (name === '신입생 기량평가' && dayElapsed >= 5));
  const scheduledBlocks = scheduledRelevant.map(eventBlockForName).filter(Boolean);

  // 세계 장기 사건은 단순히 worldArcs에 있다는 이유만으로 전문을 넣지 않는다.
  // 현재 행동/최근 장면/현재 장소에 실제 관련 키워드가 있을 때만 canon 블록을 주입한다.
  const worldRelevant = worldArcs.filter((name) => eventIsRelevant(name, context));
  const worldBlocks = worldRelevant.map(eventBlockForName).filter(Boolean);

  return {
    active: activeBlocks.length ? activeBlocks.map((x) => x.text).join('\n\n') : (unknownActive.length ? unknownActive.join(', ') : '없음'),
    scheduled: scheduledBlocks.length ? scheduledBlocks.map((x) => x.text).join('\n\n') : '없음',
    world: worldBlocks.length ? worldBlocks.map((x) => x.text).join('\n\n') : '없음',
  };
}

function currentPcAbilityReference(saveState = {}) {
  const pc = saveState?.pc || {};
  const skills = Object.entries(pc.skills || {}).map(([name, row]) => `${name} ${row?.grade || row}`).join(' | ');
  const stats = Object.entries(pc.stats || {}).map(([name, row]) => `${name} ${row?.grade || row} [${Number(row?.progress || 0)}/100]`).join(' | ');
  return `스킬: ${skills || '없음'}\n스탯: ${stats || '없음'}\n판정 전 위 능력 중 현재 행동/상황과 실제 관련된 것만 선별해 반영한다. 패시브 스킬은 사용자가 이름을 선언하지 않아도 조건이 맞으면 자동 적용한다.`;
}

function defaultPcProfileReference(saveState = {}) {
  const pc = saveState?.pc || {};
  const matchesDefault = String(pc.name || '') === '카일' && Number(pc.age || 0) === 20 && String(pc.department || '').includes('기사과');
  return matchesDefault ? CANON.pc : '없음 — SAVE_STATE의 PC 정보만 사용';
}

// 고정 prefix에는 시간에 따라 낡는 INITIAL CURRENT STATE와 테스트 PC를 넣지 않는다.
// 정보 공개 규칙처럼 변하지 않는 부분만 남겨 prompt cache와 장기 일관성을 유지한다.
export function buildInstructions() {
  return `${GM_RULES}\n===== CHARACTER REGISTRY =====\n${CHARACTER_REGISTRY_TEXT}\n\n===== WORLD CANON =====\n${CANON.world}\n\n===== NPC CANON =====\n${CANON.npc}\n\n===== NPC SPEECH =====\n${CANON.speech}\n\n===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====\n${CANON.adult}\n이 레이어는 TURN OPTIONS의 ADULT_MODE가 ON이고, PC와 해당 장면 참여자가 모두 성인이며 자유로운 상호 동의와 관계 맥락이 충족될 때만 활성화한다. OFF이면 친밀/성인 수위 규칙을 사용하지 않는다. ON이면 관계단계에 맞춰 성인다운 직접적 플러팅, 욕망 표현, 깊은 키스, 포옹, 밀착, 목/어깨 입맞춤, 비그래픽 손길, 호흡·체온·떨림·옷매무새, 침실/개인실 장면전환과 관계 후 대화를 충분히 활용한다. 구체적인 성행위 단계별 동작, 성기, 삽입, 구강행위 세부, 체액은 묘사하지 않는다.\n\n===== PC SYSTEM =====\n${CANON.pc_system}\n\n===== INFORMATION ACCESS REFERENCE =====\n${INFO_ACCESS_REFERENCE}`;
}

export function buildTurnInput({ action, saveState, recentTurns, rollingSummary, availableCgIds = [], adultMode = false, adultEligible = false, proseLength = 'medium' }) {
  const compactSave = compactSaveForModel(saveState, { action, recentTurns });
  const serializedSave = serializeCompactSaveForPrompt(compactSave, 38000);
  const turns = compactRecentTurns(recentTurns);
  const cgIds = Array.isArray(availableCgIds) ? availableCgIds.slice(0, 100) : [];
  const lengthRule = proseLength === 'short'
    ? '짧고 빠르게. 핵심 장면/대사만.'
    : proseLength === 'long'
      ? '중요 장면은 충분히 묘사하되 반복 금지.'
      : '중간 길이. 몰입감과 진행 속도 균형.';
  const initialSeed = Number(saveState?.turnNumber || 0) === 0 ? CANON.current : '사용하지 않음 — 현재 상태는 SAVE_STATE가 기준';
  const eventReferences = eventReferenceBundle(saveState, { action, recentTurns, rollingSummary });
  const pcReference = defaultPcProfileReference(saveState);
  const abilityReference = currentPcAbilityReference(saveState);

  return `===== PC PROFILE REFERENCE =====\n${pcReference}\n\n===== ACTIVE EVENT CANON =====\n${eventReferences.active}\n\n===== RELEVANT SCHEDULED EVENT CANON =====\n${eventReferences.scheduled}\n\n===== RELEVANT WORLD ARC CANON =====\n${eventReferences.world}\n\n===== INITIAL SCENARIO SEED =====\n${initialSeed}\n\n[현재성 우선순위]\n현재 날짜·시간·장소·PC/NPC 상태·완료 여부는 반드시 AUTHORITATIVE SAVE_STATE가 최우선이다. 위 시나리오/이벤트 참고문에 과거 시점 표현이 남아 있어도 SAVE_STATE와 충돌하면 폐기한다. activeEvents는 현재 PC 주변에서 실제 진행 중인 사건, scheduledEvents는 미래 예정, worldArcs는 세계 배경에서 독립 진행되는 장기 사건이다. RELEVANT WORLD ARC CANON이 '없음'이면 해당 장기 사건을 현재 장면으로 억지로 끌어오지 않는다. INITIAL SCENARIO SEED는 0턴에서만 유효하다.\n\n===== TURN OPTIONS =====\n서술 길이: ${lengthRule}\nADULT_MODE: ${adultMode && adultEligible ? 'ON' : 'OFF'}\n성인 조건 충족: ${adultEligible ? 'YES' : 'NO'}\n\n===== AUTHORITATIVE SAVE_STATE =====\n${serializedSave}\n\n===== ROLLING SUMMARY =====\n${cut(rollingSummary || '아직 없음', 5000)}\n\n===== RECENT TURNS =====\n${cut(turns, 9000)}\n\n===== AVAILABLE_CG_IDS =====\n${cgIds.length ? cgIds.join(', ') : '없음'}\n\n===== CURRENT PC ABILITIES — ACTION RESOLUTION =====\n${abilityReference}\n\n===== USER ACTION =====\n${cut(action, 5000)}\n\nUSER ACTION을 처리하기 직전에 CURRENT PC ABILITIES를 확인하고, 관련 스킬/스탯/패시브가 결과에 미치는 영향을 먼저 반영하라. 스킬명을 사용자가 직접 지정하지 않았다는 이유로 관련 능력을 무시하지 마라. 경험치는 단순 사용 보상이 아니라 실제 학습·훈련·실전 자극이 있을 때만 state_delta에 기록하라. 경험치 reason은 원인이 된 행동/상황을 구체적으로 적어라. 사용자가 선언한 행동과 그 판정·직접 결과, NPC/세계의 자연스러운 연쇄 반응까지 이번 턴에 충분히 진행하라. 이동·수업·훈련 같은 전환 행동은 특별한 방해가 없으면 의미 있는 다음 장면까지 넘겨도 된다. 직전 턴 내용을 불필요하게 반복하지 마라. PC에게 새로운 선택이 필요한 순간에 멈추고 PC의 다음 행동·대사·감정·결정은 대신 정하지 마라. 각 주요 NPC 대사에는 실제 감정 태그/강도/근거를 함께 반환하라.`;
}
