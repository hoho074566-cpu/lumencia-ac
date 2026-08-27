// P2-PR06 Character-driven NPC Behavior.
// Read-only semantic context over existing memories/relationships/goals/emotions.

export const NPC_CHARACTER_BEHAVIOR_VERSION = '1.0';

const MEMORY_TYPES = new Set(['observer', 'belief', 'relationship', 'fact', 'knowledge']);

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value, max = 160) {
  const out = String(value ?? '').trim();
  return out.length > max ? `${out.slice(0, Math.max(0, max - 1))}…` : out;
}
function unique(values, limit = 4) { return [...new Set(array(values).map(String).filter(Boolean))].slice(0, limit); }
function normalized(value) { return String(value ?? '').trim().toLowerCase(); }

function memoryType(row = {}) { return normalized(row.type || row.knowledge_type || 'fact'); }
function isPcMemory(row = {}, pcName = '') {
  const kind = memoryType(row);
  if (!MEMORY_TYPES.has(kind)) return false;
  const subject = normalized(row.subject);
  const name = normalized(pcName);
  if (subject === 'pc' || subject === 'player' || (name && subject === name)) return true;
  const bag = normalized(`${row.fact || ''} ${row.source || ''}`);
  return Boolean(name && bag.includes(name));
}

function compactMemoryRows(rows = [], pcName = '', limit = 3) {
  const source = array(rows);
  const direct = source.filter((row) => isPcMemory(row, pcName));
  const selected = direct.slice(-Math.max(0, limit));
  return selected.map((row) => ({
    type: memoryType(row),
    fact: text(row.fact, 150),
    turn: Math.max(0, Number(row.turn || 0)),
    confidence: row.confidence == null ? null : Math.max(0, Math.min(1, Number(row.confidence || 0))),
    source: text(row.source, 90) || null,
  })).filter((row) => row.fact);
}

function compactGoal(inner = {}) {
  const goal = object(inner.active_goal);
  if (!goal.desire) return null;
  return {
    desire: text(goal.desire, 140),
    state: text(goal.state || 'active', 24),
    progress: Math.max(0, Math.min(100, Number(goal.progress || 0))),
    next: text(array(goal.next_actions)[0] || inner.short_term_plan, 120) || null,
  };
}

function compactRelationship(row = {}) {
  const relation = object(row);
  if (!Object.keys(relation).length) return null;
  return {
    affinity: Math.max(-100, Math.min(100, Number(relation.affinity || 0))),
    trust: Math.max(-100, Math.min(100, Number(relation.trust || 0))),
    status: text(relation.status || '중립', 60),
    stage: text(relation.stage || '', 32) || null,
    recent: text(array(relation.history).slice(-1)[0], 140) || null,
  };
}

function compactProfile(key, name, saveState, memoryLimit) {
  const inner = object(saveState?.npcInnerStates?.[key]);
  const emotion = object(saveState?.emotionStates?.[key]);
  return {
    key,
    name: text(name || key, 60),
    goal: compactGoal(inner),
    relationship: compactRelationship(saveState?.relationships?.[key]),
    prior_judgment: text(inner.opinion_of_pc, 150) || null,
    social_stance: text(inner.social_stance, 70) || null,
    wants_from_pc: text(inner.wants_from_pc, 110) || null,
    concern: text(inner.concern || inner.unresolved_issue, 110) || null,
    internal_emotion: Object.keys(emotion).length ? {
      state: text(emotion.current || 'default', 32),
      intensity: Math.max(0, Math.min(1, Number(emotion.intensity || 0))),
      reason: text(emotion.reason, 110) || null,
    } : null,
    pc_evidence: compactMemoryRows(saveState?.memories?.npc?.[key], saveState?.pc?.name, memoryLimit),
  };
}

export function compactNpcCharacterBehavior({
  saveState = {}, candidateKeys = [], registry = {}, mode = 'game', significanceBoundary = null,
  maxNpcs = 4, memoryLimit = 3,
} = {}) {
  const boundary = object(significanceBoundary);
  const frozen = mode === 'meta' || mode === 'continue' || boundary.mode === 'freeze';
  const allowed = unique(boundary.eligible_keys?.length ? boundary.eligible_keys : candidateKeys, maxNpcs)
    .filter((key) => Object.prototype.hasOwnProperty.call(object(registry), key));
  const profiles = frozen ? [] : allowed.map((key) => compactProfile(key, registry[key], saveState, memoryLimit));
  return {
    version: NPC_CHARACTER_BEHAVIOR_VERSION,
    mode: frozen ? 'freeze' : profiles.length ? 'semantic' : 'none',
    source: 'existing-npc-state',
    npc_keys: profiles.map((row) => row.key),
    profiles,
    evidence_count: profiles.reduce((sum, row) => sum + row.pc_evidence.length, 0),
  };
}

function rules() {
  return `현재 행동을 각 NPC의 기억·기존 판단·목표·관계·지식과 의미로 비교한다: 얼마나 이례적/위험한가, 예상했는가, 기존 판단과 모순되는가, 자기 목표와 관계에 무엇이 달라지는가.
같은 유형의 수행은 횟수만 세지 말고 증거의 독립성·질·모순을 판단한다. 첫 관찰은 우연 가능성을 남기고, 두 번째 독립 관찰은 시험/의심의 근거가 되며, 세 번째로 충분히 일관된 증거가 쌓이면 기존 판단을 수정한다. 이미 수정한 기준에는 매번 똑같이 놀라거나 같은 칭찬을 반복하지 않는다.
내부 감정을 대사로 그대로 읽지 않는다. 행동·호칭·거리·공격 방식·질문·선제 접근·도움·정보 공유/보류로 드러낸다. 관계 상태는 이런 행동의 문턱과 선택을 바꾸지만 자동 동의·성공·관계 수치 변화·새 지식을 지급하지 않는다.
NPC 판단이 실제로 바뀐 경우에만 기존 state_delta.memories_add에 owner=npc:<key>, type=belief, subject=pc, 구체적 근거/source/confidence를 기록한다. 같은 판단을 표현만 바꿔 중복 저장하지 않는다. 새 social graph, emotion engine, relationship lifecycle, Shared History를 만들지 않는다.`;
}

export function buildNpcCharacterBehaviorDirective({ context = null, maxChars = 2800 } = {}) {
  const source = object(context);
  if (source.mode !== 'semantic' || !array(source.profiles).length) return '';
  const profiles = source.profiles.map((row) => ({ ...row, pc_evidence: array(row.pc_evidence).map((entry) => ({ ...entry })) }));
  const render = () => `[P2-PR06 CHARACTER-DRIVEN NPC BEHAVIOR V${NPC_CHARACTER_BEHAVIOR_VERSION}]\nNPC_CONTEXT=${JSON.stringify(profiles)}\n${rules()}`;
  let out = render();
  while (out.length > maxChars && profiles.some((row) => row.pc_evidence.length > 1)) {
    const target = profiles.slice().sort((a, b) => b.pc_evidence.length - a.pc_evidence.length)[0];
    target.pc_evidence.shift();
    out = render();
  }
  while (out.length > maxChars && profiles.length > 1) {
    profiles.pop();
    out = render();
  }
  if (out.length <= maxChars) return out;
  const minimal = profiles.map(({ key, name, goal, relationship, prior_judgment }) => ({ key, name, goal, relationship, prior_judgment }));
  return `[P2-PR06 CHARACTER-DRIVEN NPC BEHAVIOR V${NPC_CHARACTER_BEHAVIOR_VERSION}]\nNPC_CONTEXT=${JSON.stringify(minimal)}\n${rules()}`;
}
