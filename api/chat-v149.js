// LUMENSIA MOBILE V1.4.9 API adapter
// External API version: 0.5.7
// Reuses the current /api/chat canonical core and adds AUTO / CONTINUE guards
// plus display-only extended portrait expression classification.

const ADAPTER_VERSION = '0.5.7';
const CORE_ROUTE = '/api/chat';
const SUPPORTED_MODES = new Set(['game', 'meta', 'auto', 'continue']);

const AUTO_DIRECTIVE = String.raw`[LUMENSIA V1.4.9 AUTO FLOW — GM CONTROL DIRECTIVE]
이 문장은 PC의 행동/대사/생각/감정/의사결정이 아니다. PC는 새 행동을 전혀 하지 않았다.
현재 진행 중인 같은 장면에서 PC 개입이 필요 없는 구간만 자연스럽게 진행하라.
예: 연설/출석/수업의 비상호작용 구간, 이미 시작된 NPC의 말, NPC끼리의 대화, 이미 예정된 현재 일정의 흐름.
AUTO를 이유로 무관한 새 사건/새 인물/새 장소를 억지로 삽입하지 마라.
PC가 실제 판단·대답·행동·반응을 해야 하는 첫 지점에서 즉시 멈추고, 필요하면 choices만 제시하라.
PC의 대사·행동·내적 반응·수락·거절을 대신 쓰지 마라.`;

const CONTINUE_DIRECTIVE = String.raw`[LUMENSIA V1.4.9 CONTINUE — GM CONTROL DIRECTIVE]
이 문장은 PC의 행동이 아니다. 직전 GM 응답의 바로 다음 문장/같은 순간/같은 장면만 자연스럽게 이어 써라.
새 사건, 새 장소, 새 일정, 시간 점프, 관계 변화, 기억 추가, 훅 변화, 성장, 보상, 감독 이벤트 개입을 만들지 마라.
직전 state_delta를 반복 적용하지 마라. PC의 행동·대사·감정·생각·수락·거절을 대신 만들지 마라.
직전 답변이 중간에서 끊긴 부분, 진행 중이던 NPC의 말/묘사만 보충하고 PC의 판단 지점에서는 멈춰라.`;

function emptyStateDelta() {
  return {
    advance_minutes: 0,
    new_location: null,
    pc_status: null,
    fatigue_delta: 0,
    gold_delta: 0,
    relationship_changes: [],
    intimacy_changes: [],
    stat_progress: [],
    skill_experience: [],
    items_add: [],
    items_remove: [],
    active_events_add: [],
    active_events_remove: [],
    completed_events_add: [],
    pc_knowledge_add: [],
    scheduled_events_add: [],
    scheduled_events_complete: [],
    hooks_add: [],
    hooks_update: [],
    memories_add: [],
    npc_state_updates: [],
  };
}

function buildCoreUrl(req) {
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.headers?.host || process.env.VERCEL_URL;
  if (!host) throw new Error('Vercel host를 확인할 수 없습니다.');
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (String(host).includes('localhost') ? 'http' : 'https');
  const normalizedHost = String(host).replace(/^https?:\/\//i, '');
  return `${proto}://${normalizedHost}${CORE_ROUTE}`;
}

function textBag(item) {
  return [
    item?.text,
    item?.emotion_reason,
    item?.emotion_transition,
  ].filter(Boolean).join(' ');
}

function classifyExtendedExpression(item) {
  if (!item || item.kind !== 'dialogue') return null;
  const base = String(item.display_expression || item.detected_expression || item.expression || 'default').toLowerCase();
  const bag = textBag(item);

  const has = (re) => re.test(bag);
  const strongAngry = base === 'angry' && has(/격노|분노|노기|고함|으르렁|죽여|닥쳐|이를\s*악물/i);
  const strongShock = base === 'shock' && has(/경악|충격|소스라|화들짝|눈을\s*크게|믿을\s*수/i);

  if (has(/ㅋㅋ|하하|하핫|후후|후훗|크하|키득|깔깔|풉|푸핫|웃음을?\s*(?:터뜨|참지\s*못)|폭소/i)) return 'laugh';
  if (has(/비웃|우쭐|의기양양|자신만만|능글|얄밉게\s*웃|씨익|씨익\s*웃|깔보|도발적\s*미소|승리감|잘난\s*척/i)) return 'smug';
  if (!strongShock && has(/당황|허둥|어버버|말을\s*더듬|말문이\s*막|얼굴.{0,8}(?:붉|빨개)|귀.{0,8}(?:붉|빨개)|시선을?\s*피하|쩔쩔/i)) return 'flustered';
  if (!strongAngry && has(/짜증|성가|귀찮|신경질|못마땅|질린|진절머리|한숨|귀찮다는|미간을\s*찌푸/i)) return 'annoyed';
  if (has(/걱정|불안|초조|염려|안절부절|조마조마|근심|신경\s*쓰|괜찮(?:아|냐|은지)/i)) return 'worried';
  if (!strongShock && has(/혼란|의아|갸웃|어리둥절|이해(?:가|를)\s*(?:안|못)|무슨\s*뜻|영문을\s*모르|물음표|당혹/i)) return 'confused';

  return base;
}

function applyExtendedExpressions(turn) {
  if (!turn || !Array.isArray(turn.scene)) return turn;
  turn.scene = turn.scene.map((item) => {
    if (item?.kind !== 'dialogue') return item;
    const extended = classifyExtendedExpression(item);
    if (!extended) return item;
    return {
      ...item,
      display_expression: extended,
      v149_extended_expression: extended,
    };
  });
  return turn;
}

function lockContinueTurn(turn) {
  if (!turn || typeof turn !== 'object') return turn;
  turn.state_delta = emptyStateDelta();
  turn.emotion_updates = [];
  turn.cg_id = null;
  turn.director = {
    intervention: 'none',
    beat: 'routine',
    event_kind: 'none',
    spotlight_keys: [],
    callback_key: null,
    callback_phase: 'none',
    callback_note: null,
    reason: 'V1.4.9 CONTINUE hard freeze',
  };
  return turn;
}

function setAdapterRoute(data, mode) {
  data.route = {
    ...(data.route || {}),
    input_mode: mode,
    adapter_version: ADAPTER_VERSION,
    core_server_version: data.server_version || data.route?.server_version || '0.5.6',
  };
  data.server_version = ADAPTER_VERSION;
  return data;
}

async function readJsonResponse(response) {
  const raw = await response.text();
  try {
    return { data: raw ? JSON.parse(raw) : {}, raw };
  } catch {
    const preview = String(raw || '').replace(/\s+/g, ' ').slice(0, 280);
    const error = new Error(`코어 API가 JSON이 아닌 응답을 보냈습니다. (HTTP ${response.status})${preview ? `\n${preview}` : ''}`);
    error.code = 'CORE_NON_JSON_RESPONSE';
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only', server_version: ADAPTER_VERSION });
  }

  try {
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const mode = SUPPORTED_MODES.has(incoming.inputMode) ? incoming.inputMode : 'game';

    const coreBody = {
      ...incoming,
      inputMode: mode === 'meta' ? 'meta' : 'game',
      action:
        mode === 'auto' ? AUTO_DIRECTIVE :
        mode === 'continue' ? CONTINUE_DIRECTIVE :
        String(incoming.action || ''),
    };

    const coreResponse = await fetch(buildCoreUrl(req), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lumensia-Token': String(req.headers?.['x-lumensia-token'] || ''),
      },
      body: JSON.stringify(coreBody),
    });

    const { data } = await readJsonResponse(coreResponse);

    if (!coreResponse.ok) {
      return res.status(coreResponse.status).json({
        ...data,
        server_version: ADAPTER_VERSION,
        adapter_version: ADAPTER_VERSION,
      });
    }

    if (!data?.turn) {
      return res.status(502).json({
        error: '코어 API 응답에 turn이 없습니다.',
        code: 'CORE_TURN_MISSING',
        server_version: ADAPTER_VERSION,
      });
    }

    if (mode === 'continue') lockContinueTurn(data.turn);
    applyExtendedExpressions(data.turn);
    setAdapterRoute(data, mode);

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error?.message || String(error),
      code: error?.code || 'V149_ADAPTER_ERROR',
      server_version: ADAPTER_VERSION,
    });
  }
}
