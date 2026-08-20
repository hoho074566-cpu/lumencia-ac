// LUMENSIA MOBILE V1.5.2 quality orchestrator
// External API version: 0.6.0
// Architecture: Canon-aware Simulator -> Writer -> QA -> optional rewrite
// Additional runtime synthesis: NPC inner state, scene continuity, continuation beats, background digest.
// The proven canonical core remains /api/chat and is never mutated here.

const ADAPTER_VERSION = '0.6.0';
const CORE_ROUTE = '/api/chat';
const SUPPORTED_MODES = new Set(['game', 'meta', 'auto', 'continue']);
const TEXT_LIMIT = 5000;

const AUTO_DIRECTIVE = String.raw`[LUMENSIA V1.5.2 AUTO FLOW]
이 요청은 PC의 행동/대사/생각/감정/결정이 아니다. PC는 새 행동을 하지 않았다.
현재 같은 장면에서 PC 개입이 필요 없는 흐름만 진행한다. 이미 시작된 NPC의 말, NPC끼리의 상호작용, 이미 예정되어 진행 중인 절차만 허용한다.
PC가 대답/판단/행동해야 하는 첫 지점에서 즉시 멈춘다. AUTO를 핑계로 새 사건·새 인물·새 장소를 억지로 삽입하지 않는다.`;

const CONTINUE_DIRECTIVE = String.raw`[LUMENSIA V1.5.2 CONTINUE]
이 요청은 PC 행동이 아니다. 직전 GM 응답의 같은 순간/같은 장면을 문학적으로 조금 더 이어 쓴다.
시간·위치·관계·기억·성장·일정·훅·보상·감정 저장상태를 변경하지 않는다. 직전 state_delta를 절대 다시 적용하지 않는다.
PC의 행동·대사·감정·생각·수락·거절을 새로 만들지 않는다.`;

const QUALITY_GUARDRAILS = String.raw`[V1.5.2 NATURAL NPC / WRITER GUARDRAILS]
- NPC 대사는 설정집 낭독이 아니라 직전 말/행동에 대한 실제 반응이어야 한다.
- 매 대사를 완벽한 2문장 설명형으로 정리하지 않는다. 캐릭터에 맞게 짧은 단문, 끊김, 침묵, 반문, 말끝 흐림, 작은 몸짓을 섞는다.
- 말투 CANON은 유지하되 말버릇을 기계적으로 반복하지 않는다.
- NPC는 자기 목표·현재 기분·PC에 대한 기존 평가·미해결 문제를 가진 사람처럼 말한다.
- 관계가 좋다고 자동 친절/동의하지 않고, 관계가 나쁘다고 모든 문장을 적대적으로 만들지 않는다.
- 한 장면의 모든 NPC가 PC에게 차례대로 설명하거나 한마디씩 하는 구조를 피한다. NPC-NPC 반응과 침묵도 허용한다.
- 감정을 설명문으로 먼저 선언하지 말고 시선, 거리, 손동작, 말의 속도와 어휘로 먼저 보여준다.
- 같은 정보/감정을 narration과 dialogue에서 중복 설명하지 않는다.
- '그렇군/흥미롭군/이해했다 → 설명 → 질문' 같은 정형화된 AI 대화 패턴을 연속 사용하지 않는다.
- NPC가 눈앞에서 이미 보고 있는 사실을 굳이 말로 재설명하지 않는다. 필요하면 시선·한마디·행동으로 처리한다.`;

const WRITER_NATURAL_SHORT = String.raw`[V1.5.2 NPC 자연스러움]
직전 말/행동에 먼저 반응한다. 설정 설명용 대사를 줄이고, 캐릭터에 맞는 단문·끊김·침묵·반문·몸짓을 허용한다.
NPC는 현재 목표/기분/PC 평가가 이어지는 사람처럼 말한다. 모두가 똑같이 정돈된 문장으로 말하거나 PC에게 차례로 설명하지 않는다.
감정은 해설보다 시선·거리·말끝·행동으로 먼저 보여주고 narration과 dialogue의 중복을 줄인다.
'그렇군/흥미롭네 → 설명 → 되묻기' 같은 정형화된 AI 대화 루프와 매번 질문으로 끝내는 습관을 피한다.`;

function clampText(value, max = 1200) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clone(value) { try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value ?? null)); } }

function emptyStateDelta() {
  return {
    advance_minutes: 0, new_location: null, pc_status: null, fatigue_delta: 0, gold_delta: 0,
    relationship_changes: [], intimacy_changes: [], stat_progress: [], skill_experience: [],
    items_add: [], items_remove: [], active_events_add: [], active_events_remove: [], completed_events_add: [],
    pc_knowledge_add: [], scheduled_events_add: [], scheduled_events_complete: [], hooks_add: [], hooks_update: [],
    memories_add: [], npc_state_updates: [],
  };
}

function buildCoreUrl(req) {
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.headers?.host || process.env.VERCEL_URL;
  if (!host) throw new Error('Vercel host를 확인할 수 없습니다.');
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (String(host).includes('localhost') ? 'http' : 'https');
  return `${proto}://${String(host).replace(/^https?:\/\//i, '')}${CORE_ROUTE}`;
}

async function readJsonResponse(response) {
  const raw = await response.text();
  try { return { data: raw ? JSON.parse(raw) : {}, raw }; }
  catch {
    const preview = String(raw || '').replace(/\s+/g, ' ').slice(0, 260);
    const error = new Error(`코어 API가 JSON이 아닌 응답을 보냈습니다. (HTTP ${response.status})${preview ? `\n${preview}` : ''}`);
    error.code = 'CORE_NON_JSON_RESPONSE';
    throw error;
  }
}

async function callCore(req, body, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildCoreUrl(req), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lumensia-Token': String(req.headers?.['x-lumensia-token'] || ''),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const { data } = await readJsonResponse(response);
    if (!response.ok) {
      const error = new Error(data?.error || `Core HTTP ${response.status}`);
      error.status = response.status;
      error.code = data?.code || 'CORE_HTTP_ERROR';
      error.payload = data;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const e = new Error(`V1.5.2 내부 단계가 ${Math.round(timeoutMs/1000)}초를 넘어 중단되었습니다.`);
      e.code = 'PIPELINE_STAGE_TIMEOUT';
      throw e;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

function collectMetaText(data) {
  return array(data?.turn?.scene).map(x => String(x?.text || '')).filter(Boolean).join('\n').trim();
}

function runtimeContext(saveState = {}) {
  return {
    npcInnerStates: object(saveState.npcInnerStates),
    sceneRuntime: object(saveState.sceneRuntime),
    backgroundDigest: String(saveState.backgroundDigest || '').slice(-1800),
  };
}

function compactRuntimeContext(incoming = {}) {
  const saveState = incoming.saveState || {};
  const scene = object(saveState.sceneRuntime);
  const keys = new Set(array(scene.participants).map(String).filter(Boolean));
  for (const turn of array(incoming.recentTurns).slice(-2)) {
    for (const item of array(turn?.scene)) if (item?.speaker_key) keys.add(String(item.speaker_key));
  }
  const inner = object(saveState.npcInnerStates);
  const picked = {};
  for (const key of [...keys].slice(0,6)) if (inner[key]) picked[key] = inner[key];
  return { npcInnerStates:picked, sceneRuntime:scene, backgroundDigest:String(saveState.backgroundDigest || '').slice(-650) };
}

function isCombatLike(action = '') {
  return /(전투|공격|베어|찌르|쏘|회피|막아|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|죽이|살해)/i.test(String(action));
}

function plannerPrompt(incoming, mode) {
  const action = clampText(mode === 'auto' ? AUTO_DIRECTIVE : String(incoming.action || ''), 2800);
  const runtime = runtimeContext(incoming.saveState || {});
  const combat = isCombatLike(action);
  return clampText(String.raw`[LUMENSIA V1.5.2 INTERNAL SIMULATOR — META ONLY]
실제 플레이 장면을 출력하거나 게임 상태를 변경하지 말고, 다음 Writer가 사용할 내부 판정 메모를 작성하라.

실제 사용자 선언:
${action}

런타임 속상태(메타 내부용, NPC가 자동으로 아는 정보가 아님):
${clampText(runtime, 6500)}

반드시 다음 항목을 짧고 구체적으로 작성:
1) FACT LOCK: 지금 절대 바뀌면 안 되는 시간/장소/인물/물건/직전 행위.
2) KNOWLEDGE LOCK: 각 등장 NPC가 실제로 알고/모르는 핵심.
3) NPC INTENT: 등장 가능 NPC마다 현재 목표, 기분, PC에 대한 태도, 이번에 원하는 것. 사람처럼 상충하는 감정도 허용.
4) ACTION VERDICT: 사용자가 선언한 행동이 무엇을 실제로 시도하는지와 결과 판정 근거.
${combat ? `5) COMBAT ENGINE: 경지·신체·마나·스킬·실전경험·거리·선수권·장비·피로·부상·정보·지형·상성을 비교해 성공/부분성공/실패와 이유를 먼저 확정. 강약을 억지 평준화하지 말 것.` : `5) SOCIAL/SCENE ENGINE: 누가 먼저 반응하는지, 누가 침묵하는지, 말의 목적과 관계 비용을 판단.`}
6) NATURAL DIALOGUE: 각 NPC가 '설명'이 아니라 어떤 반응을 보여야 캐릭터다운지. 문장 길이/끊김/몸짓도 포함.
7) SCENE BEATS: 이번 응답에서 2~5개 비트만. PC의 다음 행동은 포함 금지.
8) EXPECTED DELTA: 실제로 발생해야 하는 상태 변화만. 없는 변화는 없음이라고 명시.
9) CONTINUE BEATS: 본 응답 뒤 같은 장면에서 추가로 이어 쓸 만한 미처리 비트가 있다면 최대 3개. PC 판단이 먼저 필요하면 NONE.

${QUALITY_GUARDRAILS}`, 4900);
}

function qaCompactTurn(turn = {}) {
  const delta = object(turn.state_delta);
  return {
    title: clampText(turn.scene_title, 100),
    importance: turn.importance,
    scene: array(turn.scene).slice(0, 14).map(x => ({
      kind: x?.kind, speaker_key: x?.speaker_key || null,
      expression: x?.display_expression || x?.expression || null,
      text: clampText(x?.text, 260),
    })),
    choices: array(turn.choices).slice(0,3).map(x => clampText(x,160)),
    delta: {
      advance_minutes: delta.advance_minutes || 0,
      new_location: delta.new_location || null,
      relationship_changes: array(delta.relationship_changes).slice(0,5),
      intimacy_changes: array(delta.intimacy_changes).slice(0,4),
      stat_progress: array(delta.stat_progress).slice(0,4),
      skill_experience: array(delta.skill_experience).slice(0,5),
      memories_add: array(delta.memories_add).slice(0,5),
      npc_state_updates: array(delta.npc_state_updates).slice(0,5),
      scheduled_events_add: array(delta.scheduled_events_add).slice(0,3),
      hooks_add: array(delta.hooks_add).slice(0,3),
    },
    summary: clampText(turn.scene_summary, 420),
  };
}

function qaPrompt(incoming, plannerText, draftTurn) {
  return clampText(String.raw`[LUMENSIA V1.5.2 QA EDITOR — META ONLY]
아래 DRAFT를 검수한다. 첫 줄은 반드시 RESULT=PASS 또는 RESULT=REWRITE 중 하나.
REWRITE면 그 아래 CORRECTIONS: 로 최대 5개만 구체적으로 적어라.

검사:
- PC가 말하지 않은 행동/대사/감정/수락/거절을 대신 만들었는가
- CANON/현재 위치/시간/물건/상태/직전 장면과 충돌하는가
- NPC가 알면 안 되는 L4/L5/비밀을 알고 행동하는가
- NPC 말투가 캐릭터 이름만 바꾼 설명문처럼 딱딱하거나, 모두 같은 문장 구조인가
- 직전 말에 반응하지 않고 설정 설명만 하는가
- 관계 수치와 실제 행동/태도가 모순인가
- 전투 결과가 경지/기술/상성/정보 근거와 모순인가
- 본문과 state_delta가 서로 다른 사건을 기록하는가
- 같은 정보/감정을 반복하는가

SIMULATOR 요약:
${clampText(plannerText, 1400)}

DRAFT:
${clampText(qaCompactTurn(draftTurn), 3000)}`, 4900);
}

function runtimePrompt(incoming, plannerText, finalTurn) {
  const runtime = runtimeContext(incoming.saveState || {});
  return clampText(String.raw`[LUMENSIA V1.5.2 RUNTIME STATE SYNTHESIZER — META ONLY]
설명문 없이 JSON 객체 하나만 출력하라. 코드펜스 금지.
새 비밀/CANON/과거사를 창작하지 말고, 이번 장면에서 관찰 가능하거나 기존 런타임 상태에서 자연스럽게 이어지는 것만 갱신한다.

이전 런타임:
${clampText(runtime, 2200)}

SIMULATOR:
${clampText(plannerText, 900)}

FINAL TURN:
${clampText(qaCompactTurn(finalTurn), 2200)}

JSON 형식:
{"npc_updates":{"speaker_key":{"mood":"","social_stance":"","opinion_of_pc":"","short_term_plan":"","concern":"","wants_from_pc":"","unresolved_issue":""}},"scene_runtime":{"scene_key":"","participants":[],"objects":[],"positions":{},"ongoing_topic":"","unresolved_question":"","immediate_pressure":"","tone":"","remaining_beats":[]}}

규칙:
- npc_updates는 이번 장면의 주요 NPC 최대 3명. 각 문자열 값은 한 짧은 구/문장(권장 60자 이하).
- opinion_of_pc는 객관 사실이 아니라 해당 NPC의 현재 주관적 평가.
- remaining_beats는 같은 장면에서 PC의 새 행동 없이 이어질 수 있는 비트 최대 3개. PC 답변/판단이 먼저 필요하면 빈 배열.
- objects/positions는 이번 장면에서 실제 언급된 중요한 것만.`, 4900);
}

function backgroundPrompt(incoming, finalTurn) {
  const save = incoming.saveState || {};
  return clampText(String.raw`[LUMENSIA V1.5.2 BACKGROUND SIMULATOR — META ONLY]
PC가 보지 않는 곳의 세계를 아주 작게 굴린다. 새 대형 사건/새 비밀/새 능력/새 관계를 창작하지 않는다.
기존 scheduledEvents, scheduleContext, hooks, npcStates, npcInnerStates, activeEvents의 명시적 근거가 있는 NPC만 1~3명 선택한다.
이번 플레이 장면에 직접 등장한 NPC는 제외 가능하면 제외한다.
결과는 다음 턴 내부 참고용이며 PC 지식으로 자동 공개하지 않는다.

현재 시간: ${clampText(save.world, 300)}
예약/일정: ${clampText(save.scheduleContext, 1100)}
활성 훅: ${clampText(array(save.hooks).filter(x=>!['resolved','expired'].includes(x?.status)).slice(-8), 900)}
기존 오프스크린 digest: ${clampText(save.backgroundDigest || '', 700)}
이번 장면 요약: ${clampText(finalTurn?.scene_summary || '', 500)}

출력은 BACKGROUND: 로 시작하는 1~4문장. 누가 무엇을 하고/준비하고/미뤘는지만. PC에게 즉시 알릴 필요가 없는 것은 그대로 비공개로 둔다.`, 4200);
}

function writerContextSummary(incoming, plannerText) {
  const runtime = compactRuntimeContext(incoming);
  const historyTail = String(incoming.rollingSummary || '').slice(-3300);
  return clampText(String.raw`[LUMENSIA V1.5.2 INTERNAL GM CONTEXT — PC KNOWLEDGE 아님]
SIMULATOR: ${clampText(plannerText, 1200)}
RUNTIME: ${clampText(runtime, 650)}
${WRITER_NATURAL_SHORT}

===== ORIGINAL ROLLING SUMMARY TAIL =====
${historyTail}`, 6400);
}

function rewriteContextSummary(incoming, plannerText, qaText, draftTurn) {
  const historyTail = String(incoming.rollingSummary || '').slice(-2200);
  return clampText(String.raw`[LUMENSIA V1.5.2 QA REWRITE INTERNAL CONTEXT — PC KNOWLEDGE 아님]
SIMULATOR: ${clampText(plannerText, 800)}
QA: ${clampText(qaText, 900)}
DRAFT: ${clampText(qaCompactTurn(draftTurn), 1300)}
${WRITER_NATURAL_SHORT}

===== ORIGINAL ROLLING SUMMARY TAIL =====
${historyTail}`, 6400);
}

function continueAction(incoming) {
  const runtime = object(incoming.saveState?.sceneRuntime);
  const nextBeat = array(runtime.remaining_beats)[0] || '';
  return clampText(`${CONTINUE_DIRECTIVE}\n${nextBeat ? `\n미처리 같은-장면 beat(강제가 아니라 문맥 가이드): ${nextBeat}` : ''}\n직전 장면 연속성: ${clampText(runtime, 1000)}`, 3000);
}

function extractJsonObject(text = '') {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function sanitizeNpcUpdates(value) {
  const out = {};
  for (const [key, row] of Object.entries(object(value)).slice(0,4)) {
    if (!key || !row || typeof row !== 'object') continue;
    out[String(key).slice(0,64)] = {
      mood: clampText(row.mood || '', 80),
      social_stance: clampText(row.social_stance || '', 80),
      opinion_of_pc: clampText(row.opinion_of_pc || '', 180),
      short_term_plan: clampText(row.short_term_plan || '', 180),
      concern: clampText(row.concern || '', 180),
      wants_from_pc: clampText(row.wants_from_pc || '', 180),
      unresolved_issue: clampText(row.unresolved_issue || '', 180),
    };
  }
  return out;
}

function fallbackRuntime(incoming, finalTurn) {
  const previous = object(incoming.saveState?.sceneRuntime);
  const participants = [...new Set(array(finalTurn?.scene).map(x=>x?.speaker_key).filter(Boolean))].slice(0,6);
  return {
    npc_updates: {},
    scene_runtime: {
      scene_key: clampText(finalTurn?.scene_title || previous.scene_key || 'scene', 120),
      participants,
      objects: array(previous.objects).slice(0,8),
      positions: object(previous.positions),
      ongoing_topic: clampText(finalTurn?.scene_summary || previous.ongoing_topic || '', 260),
      unresolved_question: array(finalTurn?.choices).length ? clampText(array(finalTurn.choices).join(' / '), 300) : '',
      immediate_pressure: '',
      tone: clampText(previous.tone || finalTurn?.importance || 'routine', 80),
      remaining_beats: [],
    },
  };
}

function sanitizeRuntime(incoming, finalTurn, raw) {
  const base = fallbackRuntime(incoming, finalTurn);
  const src = object(raw);
  const scene = object(src.scene_runtime);
  return {
    npc_updates: sanitizeNpcUpdates(src.npc_updates),
    scene_runtime: {
      scene_key: clampText(scene.scene_key || base.scene_runtime.scene_key, 120),
      participants: [...new Set(array(scene.participants).map(String).filter(Boolean))].slice(0,8),
      objects: array(scene.objects).map(x=>clampText(x,120)).filter(Boolean).slice(0,10),
      positions: Object.fromEntries(Object.entries(object(scene.positions)).slice(0,10).map(([k,v])=>[String(k).slice(0,80), clampText(v,140)])),
      ongoing_topic: clampText(scene.ongoing_topic || base.scene_runtime.ongoing_topic, 280),
      unresolved_question: clampText(scene.unresolved_question || base.scene_runtime.unresolved_question, 300),
      immediate_pressure: clampText(scene.immediate_pressure || '', 240),
      tone: clampText(scene.tone || base.scene_runtime.tone, 80),
      remaining_beats: array(scene.remaining_beats).map(x=>clampText(x,180)).filter(Boolean).slice(0,3),
    },
  };
}

function consumeContinuationRuntime(incoming) {
  const prev = clone(object(incoming.saveState?.sceneRuntime));
  prev.remaining_beats = array(prev.remaining_beats).slice(1);
  return { npc_updates: {}, scene_runtime: prev };
}

function lockContinueTurn(turn) {
  if (!turn || typeof turn !== 'object') return turn;
  turn.state_delta = emptyStateDelta();
  turn.emotion_updates = [];
  turn.cg_id = null;
  turn.director = {
    intervention:'none', beat:'routine', event_kind:'none', spotlight_keys:[],
    callback_key:null, callback_phase:'none', callback_note:null,
    reason:'V1.5.2 CONTINUE hard freeze',
  };
  return turn;
}

function textBag(item, saveState) {
  const inner = object(saveState?.npcInnerStates)?.[item?.speaker_key] || {};
  return [item?.text, item?.emotion_reason, item?.emotion_transition, inner?.mood, inner?.social_stance].filter(Boolean).join(' ');
}
function classifyExtendedExpression(item, saveState) {
  if (!item || item.kind !== 'dialogue') return null;
  const base = String(item.display_expression || item.detected_expression || item.expression || 'default').toLowerCase();
  const bag = textBag(item, saveState);
  const has = re => re.test(bag);
  const strongAngry = base === 'angry' && has(/격노|분노|노기|고함|으르렁|죽여|닥쳐|이를\s*악물/i);
  const strongShock = base === 'shock' && has(/경악|충격|소스라|화들짝|눈을\s*크게|믿을\s*수/i);
  if (has(/ㅋㅋ|하하|하핫|후후|후훗|키득|깔깔|풉|푸핫|웃음을?\s*(?:터뜨|참지\s*못)|폭소/i)) return 'laugh';
  if (has(/비웃|우쭐|의기양양|자신만만|능글|얄밉게\s*웃|씨익|깔보|도발적\s*미소|승리감|잘난\s*척/i)) return 'smug';
  if (!strongShock && has(/당황|허둥|말을\s*더듬|말문이\s*막|얼굴.{0,8}(?:붉|빨개)|귀.{0,8}(?:붉|빨개)|시선을?\s*피하|쩔쩔/i)) return 'flustered';
  if (!strongAngry && has(/짜증|성가|귀찮|신경질|못마땅|질린|진절머리|한숨|미간을\s*찌푸/i)) return 'annoyed';
  if (has(/걱정|불안|초조|염려|안절부절|조마조마|근심|신경\s*쓰|괜찮(?:아|냐|은지)/i)) return 'worried';
  if (!strongShock && has(/혼란|의아|갸웃|어리둥절|이해(?:가|를)\s*(?:안|못)|무슨\s*뜻|영문을\s*모르|당혹/i)) return 'confused';
  return base;
}
function applyExtendedExpressions(turn, saveState) {
  if (!turn || !Array.isArray(turn.scene)) return turn;
  turn.scene = turn.scene.map(item => item?.kind === 'dialogue'
    ? { ...item, display_expression: classifyExtendedExpression(item, saveState), v152_extended_expression:true }
    : item);
  return turn;
}

function usageRows(...datas) { return datas.flat().filter(Boolean).map(x=>x?.usage).filter(Boolean); }
function sumUsage(rows) {
  const out = { input_tokens:0, output_tokens:0, reasoning_tokens:0, cached_tokens:0, cache_write_tokens:0, uncached_input_tokens:0, estimated_usd:0, cold_cache:false };
  for (const u of rows) {
    for (const k of ['input_tokens','output_tokens','reasoning_tokens','cached_tokens','cache_write_tokens','uncached_input_tokens']) out[k] += Number(u?.[k] || 0);
    out.estimated_usd += Number(u?.estimated_usd || 0);
    out.cold_cache ||= Boolean(u?.cold_cache);
  }
  out.estimated_usd = Number(out.estimated_usd.toFixed(6));
  out.cache_hit_rate = out.input_tokens > 0 ? Number((out.cached_tokens / out.input_tokens).toFixed(4)) : 0;
  return out;
}

function shouldRunBackground(incoming, turn) {
  if (incoming.backgroundSim === false) return false;
  const minutes = Number(turn?.state_delta?.advance_minutes || 0);
  const nextTurn = Number(incoming.saveState?.turnNumber || 0) + 1;
  const due = array(incoming.saveState?.scheduleContext?.due).length;
  return minutes >= 5 || due > 0 || nextTurn % 2 === 0;
}

function setAdapterRoute(data, mode, pipeline) {
  data.route = {
    ...(data.route || {}),
    input_mode: mode,
    adapter_version: ADAPTER_VERSION,
    core_server_version: data.server_version || data.route?.server_version || '0.5.6',
    quality_pipeline: pipeline?.pipeline || 'legacy',
    qa_result: pipeline?.qa_result || 'SKIP',
    rewrite_applied: Boolean(pipeline?.rewrite_applied),
  };
  data.server_version = ADAPTER_VERSION;
  return data;
}

function coreBody(incoming, overrides = {}) {
  return {
    ...incoming,
    saveState: incoming.saveState || {},
    recentTurns: array(incoming.recentTurns).slice(-12),
    rollingSummary: String(incoming.rollingSummary || ''),
    availableCgIds: array(incoming.availableCgIds),
    ...overrides,
  };
}

async function runMeta(req, incoming, prompt, overrides = {}) {
  return callCore(req, coreBody(incoming, {
    inputMode:'meta',
    action: clampText(prompt, TEXT_LIMIT),
    proseLength:'short',
    proReasoning:false,
    ...overrides,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error:'POST only', server_version:ADAPTER_VERSION });
  }

  try {
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const mode = SUPPORTED_MODES.has(incoming.inputMode) ? incoming.inputMode : 'game';

    // META stays a single frozen canonical-core call.
    if (mode === 'meta') {
      const data = await callCore(req, coreBody(incoming, { inputMode:'meta', action:String(incoming.action || '') }));
      const pipeline = { pipeline:'meta-freeze', stages:1, qa_result:'SKIP', rewrite_applied:false, background_sim:false };
      data.pipeline = pipeline;
      setAdapterRoute(data, mode, pipeline);
      return res.status(200).json(data);
    }

    // CONTINUE never runs state-changing stages. It follows a prepared same-scene beat if one exists.
    if (mode === 'continue') {
      const data = await callCore(req, coreBody(incoming, { inputMode:'game', action:continueAction(incoming), forceTerra:false }));
      lockContinueTurn(data.turn);
      applyExtendedExpressions(data.turn, incoming.saveState || {});
      data.runtime_state = consumeContinuationRuntime(incoming);
      const pipeline = { pipeline:'continue-freeze', stages:1, qa_result:'SKIP', rewrite_applied:false, background_sim:false, continuation_beat_used:Boolean(array(incoming.saveState?.sceneRuntime?.remaining_beats)[0]) };
      data.pipeline = pipeline;
      setAdapterRoute(data, mode, pipeline);
      return res.status(200).json(data);
    }

    const qualityRequested = incoming.qualityPipeline !== false;
    let qualityOn = qualityRequested;
    let plannerData = null;
    let plannerText = '';
    let plannerError = null;

    if (qualityOn) {
      try {
        plannerData = await runMeta(req, incoming, plannerPrompt(incoming, mode), {
          modelMode: incoming.modelMode || 'auto',
          proseLength:'medium',
          reasoningEffort: isCombatLike(incoming.action) ? 'medium' : 'low',
          forceTerra: Boolean(incoming.forceTerra),
        });
        plannerText = collectMetaText(plannerData);
      } catch (error) {
        plannerError = String(error?.message || error).slice(0,240);
        qualityOn = false;
      }
    }

    const mainAction = mode === 'auto' ? AUTO_DIRECTIVE : String(incoming.action || '');

    let writerData = await callCore(req, coreBody(incoming, {
      inputMode:'game',
      action:mainAction,
      rollingSummary: qualityOn ? writerContextSummary(incoming, plannerText) : String(incoming.rollingSummary || ''),
    }));

    let finalData = writerData;
    let qaData = null;
    let qaText = '';
    let qaResult = qualityOn ? 'UNKNOWN' : 'SKIP';
    let rewriteApplied = false;
    let runtimeData = null;
    let runtimeDraftData = null;
    let backgroundData = null;

    if (qualityOn) {
      const parallel = [
        runMeta(req, incoming, qaPrompt(incoming, plannerText, writerData.turn), { modelMode:'luna', reasoningEffort:'low', forceTerra:false }),
        runMeta(req, incoming, runtimePrompt(incoming, plannerText, writerData.turn), { modelMode:'luna', reasoningEffort:'low', forceTerra:false }),
      ];
      const bgIndex = shouldRunBackground(incoming, writerData.turn) ? parallel.length : -1;
      if (bgIndex >= 0) parallel.push(runMeta(req, incoming, backgroundPrompt(incoming, writerData.turn), { modelMode:'luna', reasoningEffort:'low', forceTerra:false }));

      const results = await Promise.allSettled(parallel);
      if (results[0]?.status === 'fulfilled') qaData = results[0].value;
      if (results[1]?.status === 'fulfilled') runtimeData = results[1].value;
      if (bgIndex >= 0 && results[bgIndex]?.status === 'fulfilled') backgroundData = results[bgIndex].value;

      qaText = qaData ? collectMetaText(qaData) : '';
      const m = qaText.match(/RESULT\s*=\s*(PASS|REWRITE)/i);
      qaResult = qaData ? (m ? m[1].toUpperCase() : 'PASS') : 'UNAVAILABLE';

      if (qaResult === 'REWRITE' && incoming.qaRewrite !== false) {
        try {
          finalData = await callCore(req, coreBody(incoming, {
            inputMode:'game',
            action:mainAction,
            rollingSummary: rewriteContextSummary(incoming, plannerText, qaText, writerData.turn),
          }));
          rewriteApplied = true;
          runtimeDraftData = runtimeData;
          try {
            runtimeData = await runMeta(req, incoming, runtimePrompt(incoming, plannerText, finalData.turn), { modelMode:'luna', reasoningEffort:'low', forceTerra:false });
          } catch {
            runtimeData = null;
          }
        } catch {
          finalData = writerData;
          rewriteApplied = false;
          qaResult = 'REWRITE_FAILED';
        }
      }
    }

    applyExtendedExpressions(finalData.turn, incoming.saveState || {});

    let runtimeState;
    if (qualityOn && runtimeData) {
      runtimeState = sanitizeRuntime(incoming, finalData.turn, extractJsonObject(collectMetaText(runtimeData)));
    } else {
      runtimeState = fallbackRuntime(incoming, finalData.turn);
    }
    finalData.runtime_state = runtimeState;
    finalData.background_digest = backgroundData
      ? clampText(collectMetaText(backgroundData), 1800)
      : String(incoming.saveState?.backgroundDigest || '').slice(-1800);

    const allDatas = [plannerData, writerData, qaData, runtimeDraftData, runtimeData, backgroundData, rewriteApplied ? finalData : null];
    finalData.usage = sumUsage(usageRows(allDatas));
    const completedStages = allDatas.filter(Boolean).length;

    const pipeline = {
      pipeline: qualityOn ? 'simulator-writer-qa-v3' : (qualityRequested ? 'single-writer-fallback' : 'single-writer'),
      stages: completedStages || 1,
      qa_result: qaResult,
      rewrite_applied: rewriteApplied,
      background_sim: Boolean(backgroundData),
      planner_tier: plannerData?.route?.tier || null,
      writer_tier: finalData?.route?.tier || writerData?.route?.tier || null,
      combat_engine: isCombatLike(incoming.action),
      runtime_synthesized: Boolean(runtimeState),
      continuation_beats: array(runtimeState?.scene_runtime?.remaining_beats).length,
      planner_error: plannerError,
    };
    finalData.pipeline = pipeline;
    setAdapterRoute(finalData, mode, pipeline);

    return res.status(200).json(finalData);
  } catch (error) {
    console.error('[V1.5.2]', error);
    return res.status(Number.isInteger(error?.status) ? error.status : 500).json({
      error: error?.message || String(error),
      code: error?.code || 'V152_ORCHESTRATOR_ERROR',
      server_version: ADAPTER_VERSION,
      core_payload: error?.payload || undefined,
    });
  }
}
