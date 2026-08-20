// LUMENSIA MOBILE V1.5.2 HF1 — token/latency hotfix
// External API version: 0.6.1
// Strategy: ONE canonical-core model call per normal turn.
// The former Planner / QA / Runtime / Background model calls are folded into the writer
// or synthesized locally, preventing the full CANON/save/history from being re-sent 4~7x.

const ADAPTER_VERSION = '0.6.1';
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

const INLINE_QUALITY = String.raw`[V1.5.2 HF1 — SINGLE-PASS INTERNAL QUALITY]
이 블록은 PC 지식/행동이 아니라 GM 내부 실행 규칙이다.
본문을 쓰기 전에 내부적으로만 다음을 판단하고, 판정 메모 자체는 출력하지 않는다.
- FACT LOCK: 현재 시간/장소/인물/물건/직전 행동을 먼저 고정한다.
- KNOWLEDGE LOCK: NPC는 자신이 실제로 아는 정보만 사용한다. 비밀/메타정보를 자동으로 알지 않는다.
- NPC INTENT: 등장 NPC의 현재 목표·기분·PC 평가·미해결 일을 직전 상태에서 이어받는다.
- ACTION VERDICT: PC가 선언한 시도만 판정하고 PC의 다음 선택·감정·대사를 대신 만들지 않는다.
- SCENE BEATS: 이번 응답에서 필요한 비트만 진행하고 PC 판단 지점에서 멈춘다.

[NATURAL NPC]
- 직전 말/행동에 먼저 반응한다. 설정집 낭독용 대사를 만들지 않는다.
- 모든 NPC가 똑같은 길이의 완벽한 설명문을 말하지 않는다. 단문, 끊김, 침묵, 반문, 말끝 흐림, 시선·손동작을 캐릭터에 맞게 섞는다.
- 관계가 좋다고 자동 동의/친절, 나쁘다고 자동 적대하지 않는다. 목표와 자존심, 이해관계가 함께 작동한다.
- 한 장면의 NPC들이 PC에게 차례대로 한마디씩 설명하는 구조를 피한다. NPC-NPC 반응과 침묵도 허용한다.
- 감정을 먼저 해설하지 말고 행동·거리·어휘·말의 속도로 보여준다.
- narration과 dialogue가 같은 정보/감정을 반복하지 않는다.
- '그렇군/흥미롭군/이해했다 → 설명 → 질문' 같은 정형화된 AI 대화 루프를 반복하지 않는다.
- 매 응답을 질문으로 끝낼 필요가 없다.
- 눈앞에서 이미 본 사실을 굳이 입으로 재설명하지 않는다.`;

const COMBAT_QUALITY = String.raw`[COMBAT VERDICT — INTERNAL]
전투/대련 결과를 서술하기 전에 경지·신체·마나·스킬·실전경험·거리·선수권·장비·피로·부상·정보·지형·상성을 내부적으로 비교한다.
강약을 억지로 평준화하지 않는다. 성공/부분성공/실패의 원인을 결과 묘사와 일치시킨다.`;

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clampText(value, max = 1200) {
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value ?? null); }
  catch { text = String(value ?? ''); }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
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

async function callCore(req, body, timeoutMs = 120000) {
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
      const e = new Error(`V1.5.2 HF1 코어 호출이 ${Math.round(timeoutMs/1000)}초를 넘어 중단되었습니다.`);
      e.code = 'PIPELINE_STAGE_TIMEOUT';
      throw e;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

function isCombatLike(action = '') {
  return /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|죽이|살해)/i.test(String(action));
}

function relevantRuntime(incoming = {}) {
  const save = incoming.saveState || {};
  const scene = object(save.sceneRuntime);
  const keys = new Set(array(scene.participants).map(String).filter(Boolean));
  for (const turn of array(incoming.recentTurns).slice(-2)) {
    for (const item of array(turn?.scene)) if (item?.speaker_key) keys.add(String(item.speaker_key));
  }
  const inner = object(save.npcInnerStates);
  const picked = {};
  for (const key of [...keys].slice(0, 6)) if (inner[key]) picked[key] = inner[key];
  return {
    npcInnerStates: picked,
    sceneRuntime: {
      scene_key: scene.scene_key || '',
      participants: array(scene.participants).slice(0, 8),
      objects: array(scene.objects).slice(0, 8),
      positions: Object.fromEntries(Object.entries(object(scene.positions)).slice(0, 8)),
      ongoing_topic: clampText(scene.ongoing_topic || '', 320),
      unresolved_question: clampText(scene.unresolved_question || '', 300),
      immediate_pressure: clampText(scene.immediate_pressure || '', 220),
      tone: clampText(scene.tone || '', 80),
    },
    backgroundDigest: clampText(save.backgroundDigest || '', 600),
  };
}

function buildQualitySummary(incoming, mode) {
  const original = String(incoming.rollingSummary || '');
  if (incoming.qualityPipeline === false) return original;
  const runtime = relevantRuntime(incoming);
  const combat = isCombatLike(incoming.action);
  const addon = String.raw`

===== V1.5.2 HF1 INTERNAL RUNTIME (PC KNOWLEDGE 아님) =====
${clampText(runtime, 2600)}

${INLINE_QUALITY}
${combat ? `\n${COMBAT_QUALITY}` : ''}`;
  // Preserve the existing rolling summary, but cap only the old-history tail.
  // SaveState/memories still travel through the canonical core exactly once.
  return `${original.slice(-5200)}${addon}`.slice(-9800);
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

function continueAction(incoming) {
  const runtime = object(incoming.saveState?.sceneRuntime);
  const nextBeat = array(runtime.remaining_beats)[0] || '';
  return clampText(`${CONTINUE_DIRECTIVE}${nextBeat ? `\n미처리 같은-장면 beat: ${nextBeat}` : ''}\n직전 장면 연속성: ${clampText(runtime, 900)}`, TEXT_LIMIT);
}

function lockContinueTurn(turn) {
  if (!turn || typeof turn !== 'object') return turn;
  turn.state_delta = emptyStateDelta();
  turn.emotion_updates = [];
  turn.cg_id = null;
  turn.director = {
    intervention:'none', beat:'routine', event_kind:'none', spotlight_keys:[],
    callback_key:null, callback_phase:'none', callback_note:null,
    reason:'V1.5.2 HF1 CONTINUE hard freeze',
  };
  return turn;
}

function moodFromExpression(expression = '') {
  const e = String(expression || '').toLowerCase();
  const map = {
    smile:'호의적/가벼운 기분', laugh:'즐거움/웃음', smug:'자신만만/능글맞음',
    blush:'수줍음/호감', flustered:'당황', serious:'진지/집중', annoyed:'짜증/불편',
    angry:'분노', worried:'걱정/불안', sad:'침울/슬픔', confused:'혼란/의아', shock:'놀람/충격',
    default:'중립',
  };
  return map[e] || '';
}

function relationChangeFor(turn, key) {
  return array(turn?.state_delta?.relationship_changes).find(x => String(x?.npc_key || x?.key || '') === key) || null;
}

function npcStateUpdateFor(turn, key) {
  return array(turn?.state_delta?.npc_state_updates).find(x => String(x?.npc_key || x?.key || '') === key) || null;
}

function emotionFor(turn, key) {
  return array(turn?.emotion_updates).find(x => String(x?.npc_key || x?.key || x?.speaker_key || '') === key) || null;
}

function localNpcUpdates(incoming, turn) {
  const previous = object(incoming.saveState?.npcInnerStates);
  const speakerRows = array(turn?.scene).filter(x => x?.speaker_key);
  const keys = [...new Set(speakerRows.map(x => String(x.speaker_key)).filter(Boolean))].slice(0, 4);
  const out = {};

  for (const key of keys) {
    const old = object(previous[key]);
    const lastDialogue = [...speakerRows].reverse().find(x => String(x.speaker_key) === key) || {};
    const em = emotionFor(turn, key) || {};
    const rel = relationChangeFor(turn, key) || {};
    const npc = npcStateUpdateFor(turn, key) || {};
    const expression = em.expression || em.current || lastDialogue.display_expression || lastDialogue.expression || '';
    const cause = clampText(rel.cause || rel.reason || em.reason || '', 150);
    const follow = clampText(rel.followup || npc.current_goal || npc.goal || '', 160);

    out[key] = {
      mood: moodFromExpression(expression) || old.mood || '',
      social_stance: clampText(rel.status || old.social_stance || '', 80),
      opinion_of_pc: cause ? `최근 인상: ${cause}` : clampText(old.opinion_of_pc || '', 180),
      short_term_plan: follow || clampText(old.short_term_plan || '', 180),
      concern: clampText(npc.concern || old.concern || '', 180),
      wants_from_pc: clampText(npc.wants_from_pc || old.wants_from_pc || '', 180),
      unresolved_issue: clampText(old.unresolved_issue || '', 180),
    };
  }
  return out;
}

function localSceneRuntime(incoming, turn) {
  const previous = object(incoming.saveState?.sceneRuntime);
  const participants = [...new Set(array(turn?.scene).map(x => x?.speaker_key).filter(Boolean).map(String))].slice(0, 8);
  const choices = array(turn?.choices).map(x => clampText(x, 140)).filter(Boolean).slice(0, 3);
  const hasPcDecision = choices.length > 0;
  return {
    scene_key: clampText(turn?.scene_title || previous.scene_key || 'scene', 120),
    participants: participants.length ? participants : array(previous.participants).slice(0, 8),
    objects: array(previous.objects).slice(0, 10),
    positions: Object.fromEntries(Object.entries(object(previous.positions)).slice(0, 10)),
    ongoing_topic: clampText(turn?.scene_summary || previous.ongoing_topic || '', 280),
    unresolved_question: hasPcDecision ? clampText(choices.join(' / '), 300) : '',
    immediate_pressure: clampText(previous.immediate_pressure || '', 220),
    tone: clampText(turn?.importance || previous.tone || 'routine', 80),
    // Keep continuation conservative. No fabricated detailed beat is stored locally.
    remaining_beats: hasPcDecision ? [] : array(previous.remaining_beats).slice(0, 1),
  };
}

function consumeContinuationRuntime(incoming) {
  const prev = clone(object(incoming.saveState?.sceneRuntime));
  prev.remaining_beats = array(prev.remaining_beats).slice(1);
  return { npc_updates: {}, scene_runtime: prev };
}

function localBackgroundDigest(incoming, turn, participants) {
  const prior = String(incoming.saveState?.backgroundDigest || '').slice(-1100);
  if (incoming.backgroundSim === false) return prior;
  const turnNo = Number(incoming.saveState?.turnNumber || 0);
  const advance = Number(turn?.state_delta?.advance_minutes || 0);
  // Update only occasionally or after a meaningful time jump. No model call.
  if (turnNo % 4 !== 0 && advance < 30) return prior;

  const schedule = object(incoming.saveState?.scheduleContext?.npc_schedule);
  const present = new Set(array(participants).map(String));
  const rows = [];
  for (const [key, info] of Object.entries(schedule)) {
    if (present.has(key) || !info || typeof info !== 'object') continue;
    const commitment = clampText(info.commitment || info.title || '', 100);
    const area = clampText(info.area || info.location || '', 80);
    if (!commitment && !area) continue;
    rows.push(`${key}: ${commitment}${area ? ` @ ${area}` : ''}`);
    if (rows.length >= 2) break;
  }
  if (!rows.length) return prior;
  const stamp = `${clampText(incoming.saveState?.world?.date || '', 20)} ${clampText(incoming.saveState?.world?.time || '', 10)}`.trim();
  return `${prior}${prior ? '\n' : ''}[${stamp}] ${rows.join(' / ')}`.slice(-1800);
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

function setAdapterRoute(data, mode, pipeline) {
  data.route = {
    ...(data.route || {}),
    input_mode: mode,
    adapter_version: ADAPTER_VERSION,
    core_server_version: data.server_version || data.route?.server_version || '0.5.6',
    quality_pipeline: pipeline?.pipeline || 'legacy',
    qa_result: pipeline?.qa_result || 'SKIP',
    rewrite_applied: false,
  };
  data.server_version = ADAPTER_VERSION;
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error:'POST only', server_version:ADAPTER_VERSION });
  }

  try {
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const mode = SUPPORTED_MODES.has(incoming.inputMode) ? incoming.inputMode : 'game';

    if (mode === 'meta') {
      const data = await callCore(req, coreBody(incoming, {
        inputMode:'meta',
        action:String(incoming.action || ''),
      }));
      const pipeline = { pipeline:'meta-freeze-hf1', stages:1, qa_result:'SKIP', rewrite_applied:false, background_sim:false, token_hotfix:true };
      data.pipeline = pipeline;
      setAdapterRoute(data, mode, pipeline);
      return res.status(200).json(data);
    }

    if (mode === 'continue') {
      const data = await callCore(req, coreBody(incoming, {
        inputMode:'game',
        action:continueAction(incoming),
        forceTerra:false,
        rollingSummary:String(incoming.rollingSummary || '').slice(-5200),
      }));
      lockContinueTurn(data.turn);
      applyExtendedExpressions(data.turn, incoming.saveState || {});
      data.runtime_state = consumeContinuationRuntime(incoming);
      data.background_digest = String(incoming.saveState?.backgroundDigest || '').slice(-1800);
      const pipeline = { pipeline:'continue-freeze-hf1', stages:1, qa_result:'SKIP', rewrite_applied:false, background_sim:false, token_hotfix:true };
      data.pipeline = pipeline;
      setAdapterRoute(data, mode, pipeline);
      return res.status(200).json(data);
    }

    const qualityOn = incoming.qualityPipeline !== false;
    const mainAction = mode === 'auto' ? AUTO_DIRECTIVE : String(incoming.action || '');
    const rollingSummary = qualityOn ? buildQualitySummary(incoming, mode) : String(incoming.rollingSummary || '');

    // HF1 core rule: ONE full canonical call. No Planner/QA/Runtime/Background model re-entry.
    const data = await callCore(req, coreBody(incoming, {
      inputMode:'game',
      action:mainAction,
      rollingSummary,
      reasoningEffort: isCombatLike(mainAction) && incoming.reasoningEffort === 'auto' ? 'medium' : incoming.reasoningEffort,
    }));

    if (!data?.turn) throw new Error('코어 API 응답에 turn이 없습니다.');
    applyExtendedExpressions(data.turn, incoming.saveState || {});

    const sceneRuntime = localSceneRuntime(incoming, data.turn);
    const npcUpdates = qualityOn ? localNpcUpdates(incoming, data.turn) : {};
    data.runtime_state = { npc_updates:npcUpdates, scene_runtime:sceneRuntime };
    data.background_digest = localBackgroundDigest(incoming, data.turn, sceneRuntime.participants);

    const pipeline = {
      pipeline: qualityOn ? 'single-pass-q3-hf1' : 'single-writer-hf1',
      stages:1,
      qa_result: qualityOn ? 'LOCAL_GUARD' : 'SKIP',
      rewrite_applied:false,
      background_sim:false,
      background_local: incoming.backgroundSim !== false,
      combat_engine:isCombatLike(mainAction),
      runtime_synthesized:true,
      continuation_beats:array(sceneRuntime.remaining_beats).length,
      token_hotfix:true,
      note:'HF1 folds Simulator into Writer; QA/runtime/background are local to avoid repeated full-CANON input.',
    };
    data.pipeline = pipeline;
    setAdapterRoute(data, mode, pipeline);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[V1.5.2 HF1]', error);
    return res.status(Number.isInteger(error?.status) ? error.status : 500).json({
      error:error?.message || String(error),
      code:error?.code || 'V152_HF1_ERROR',
      server_version:ADAPTER_VERSION,
      core_payload:error?.payload || undefined,
    });
  }
}
