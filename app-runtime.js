// LUMENSIA MOBILE V1.5.4 stable runtime
// V1.5.4 stable-path migration base head: hoho074566-cpu/lumencia-ac @ a9170d6dca82c613436dcc5b3bc6ba86b9f86ba4
// Proven app.js blob remains SHA 39187078f0965cec067cc8dad2b38dd95351ef7b
// Why loader: preserve the large proven V1.4.8 app.js byte-for-byte in GitHub while applying
// a stable-path V1.5.4 delta at boot. If required source markers disappear, boot stops visibly.

const PATCH_VERSION = '1.5.4';
const BASE_APP_SHA = '39187078f0965cec067cc8dad2b38dd95351ef7b';
const LIVE_BASE_HEAD = 'a9170d6dca82c613436dcc5b3bc6ba86b9f86ba4';
const AUTO_GESTURE_PX = 84;

const FLOW_AUTO_ACTION = '[AUTO FLOW: PC 새 행동 없음]';
const FLOW_CONTINUE_ACTION = '[CONTINUE: 직전 GM 응답 이어쓰기]';

function portraitCandidatesStable(key, expression = 'default') {
  const char = ASSETS.characters[key];
  if (!char) return [];

  const requested = String(expression || 'default').toLowerCase();
  const order = EXPRESSION_FALLBACKS[requested] || [requested, 'default'];
  const seen = new Set();
  const rows = [];

  for (const state of order) {
    const url = state === 'default' ? char.default : char.expressions?.[state];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    rows.push({ state, url });
  }

  // V1.5.4: portrait/default까지 실패했을 때만 전신 DEFAULT를 마지막 안전망으로 사용.
  if (char.fullbody && !seen.has(char.fullbody)) {
    rows.push({ state: 'fullbody', url: char.fullbody });
  }
  return rows;
}

function latestWorldRecordStable() {
  return [...(save.renderedTurns || [])].reverse().find((record) => record?.turn && !record?.meta) || null;
}

function canAutoFlowStable() {
  const latest = latestWorldRecordStable();
  if (!latest || busy || metaModeOnce) return false;
  if (String(actionInput.value || '').trim()) return false;
  if ((latest.turn?.choices || []).length) return false;
  if (String(save?.sceneRuntime?.unresolved_question || '').trim()) return false;
  return true;
}

function canContinueStable() {
  const latest = latestWorldRecordStable();
  return Boolean(latest && !busy && !metaModeOnce);
}

function renderFlowControlsStable() {
  let wrap = $('flowControlsStable');
  const latest = latestWorldRecordStable();

  if (!wrap) {
    wrap = document.createElement('section');
    wrap.id = 'flowControlsStable';
    wrap.className = 'flow-controls-stable';

    const auto = document.createElement('button');
    auto.id = 'autoFlowBtnStable';
    auto.type = 'button';
    auto.className = 'flow-btn-stable auto';
    auto.textContent = '▶ 자동 진행';
    auto.addEventListener('click', () => sendAction('', 'auto'));

    const cont = document.createElement('button');
    cont.id = 'continueBtnStable';
    cont.type = 'button';
    cont.className = 'flow-btn-stable continue';
    cont.textContent = '✦ 이어서 생성';
    cont.addEventListener('click', () => sendAction('', 'continue'));

    wrap.append(auto, cont);
  }

  story.append(wrap);
  wrap.classList.toggle('hidden', !latest);

  const auto = $('autoFlowBtnStable');
  const cont = $('continueBtnStable');
  if (auto) {
    auto.disabled = !canAutoFlowStable();
    const latestHasChoices = Boolean((latest?.turn?.choices || []).length);
    const unresolved = String(save?.sceneRuntime?.unresolved_question || '').trim();
    auto.title = latestHasChoices
      ? '선택지가 있어 PC 판단이 필요한 지점입니다.'
      : unresolved
        ? `PC 응답이 필요한 장면입니다: ${unresolved.slice(0,120)}`
        : String(actionInput.value || '').trim()
          ? '입력창에 작성 중인 내용이 있어 자동 진행이 잠겼습니다.'
          : 'PC 새 행동 없이 현재 장면의 비상호작용 구간만 진행합니다.';
  }
  if (cont) {
    cont.disabled = !canContinueStable();
    const beats = Array.isArray(save?.sceneRuntime?.remaining_beats) ? save.sceneRuntime.remaining_beats.length : 0;
    cont.textContent = beats ? `✦ 이어서 생성 · ${beats}` : '✦ 이어서 생성';
    cont.title = beats
      ? `같은 장면에 미처리 beat ${beats}개가 있습니다. 상태 변화 없이 다음 beat를 이어 씁니다.`
      : '직전 GM 응답의 같은 장면만 더 이어 씁니다. 게임 상태는 진행하지 않습니다.';
  }
}

function installAutoFlowGestureStable() {
  if (!$('stableFlowStyle')) {
    const style = document.createElement('style');
    style.id = 'stableFlowStyle';
    style.textContent = `
      .flow-controls-stable{display:flex;gap:8px;padding:8px 12px 14px;align-items:center;justify-content:flex-end}
      .flow-controls-stable.hidden{display:none}
      .flow-btn-stable{appearance:none;border:1px solid rgba(148,163,184,.26);border-radius:999px;background:rgba(30,41,59,.82);color:#e5e7eb;padding:9px 13px;font-size:12px;font-weight:800;letter-spacing:-.01em}
      .flow-btn-stable.continue{border-color:rgba(217,184,108,.38);color:#f4d995}
      .flow-btn-stable:disabled{opacity:.34;filter:saturate(.4)}
      #autoPullHintStable{position:fixed;z-index:98;left:50%;bottom:104px;transform:translate(-50%,18px);opacity:0;pointer-events:none;padding:7px 11px;border-radius:999px;background:rgba(15,23,42,.94);border:1px solid rgba(148,163,184,.24);font-size:11px;font-weight:800;color:#dbeafe;transition:opacity .12s ease,transform .12s ease}
      #autoPullHintStable.show{opacity:1;transform:translate(-50%,0)}
      #autoPullHintStable.ready{color:#fde68a;border-color:rgba(245,158,11,.5)}
    `;
    document.head.append(style);
  }

  let hint = $('autoPullHintStable');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'autoPullHintStable';
    document.body.append(hint);
  }

  actionInput.addEventListener('input', renderFlowControlsStable);
  choicesEl.addEventListener('click', () => setTimeout(renderFlowControlsStable, 0));

  let eligible = false;
  let startY = 0;
  let startX = 0;
  let pull = 0;

  const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 12;
  const reset = () => {
    eligible = false;
    pull = 0;
    hint.classList.remove('show', 'ready');
    hint.textContent = '';
  };

  window.addEventListener('touchstart', (event) => {
    const touch = event.touches?.[0];
    if (!touch || !atBottom() || !canAutoFlowStable()) return reset();
    eligible = true;
    startY = touch.clientY;
    startX = touch.clientX;
    pull = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    if (!eligible) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const dy = startY - touch.clientY;
    const dx = Math.abs(startX - touch.clientX);
    if (dx > Math.abs(dy) * 0.8) return reset();
    pull = Math.max(0, dy);
    if (pull < 20) return;
    hint.textContent = pull >= AUTO_GESTURE_PX
      ? '놓으면 자동 진행'
      : `자동 진행까지 ${Math.max(0, AUTO_GESTURE_PX - Math.round(pull))}px`;
    hint.classList.add('show');
    hint.classList.toggle('ready', pull >= AUTO_GESTURE_PX);
  }, { passive: true });

  window.addEventListener('touchend', () => {
    const fire = eligible && pull >= AUTO_GESTURE_PX && canAutoFlowStable();
    reset();
    if (fire) sendAction('', 'auto');
  }, { passive: true });

  window.addEventListener('touchcancel', reset, { passive: true });
  renderFlowControlsStable();
}

function renderChoicesStable(choices) {
  choicesEl.innerHTML = '';
  story.append(choicesEl);

  if (!choices.length) {
    choicesEl.classList.add('hidden');
    renderFlowControlsStable();
    return;
  }

  choices.forEach((choice, idx) => {
    const b = document.createElement('button');
    b.className = 'choice-btn';
    b.textContent = `${idx + 1}. ${choice}`;
    b.addEventListener('click', () => {
      actionInput.value = choice;
      actionInput.focus();
      choicesEl.classList.add('hidden');
      renderFlowControlsStable();
    });
    choicesEl.append(b);
  });

  choicesEl.classList.remove('hidden');
  renderFlowControlsStable();
}

function renderAllStable() {
  const flowControls = $('flowControlsStable');
  story.innerHTML = '';
  if (!save.renderedTurns?.length) appendWelcome();
  else save.renderedTurns.forEach(renderTurnRecord);
  updateStatus();
  renderInfo();
  if (flowControls) story.append(flowControls);
  renderFlowControlsStable();
  scrollBottom(false);
}

function updateStatusStable(route) {
  $('timeStatus').textContent = `D+${save.world.dayElapsed} · ${save.world.date} ${save.world.weekday} ${save.world.time}`;
  $('locationStatus').textContent = save.world.location;
  if (route) {
    const mode = String(route.input_mode || 'game').toUpperCase();
    const modeTag = mode !== 'GAME' ? `${mode} · ` : '';
    const tier = String(route.tier || 'demo').toUpperCase();
    const qualityTag = route.quality_pipeline && route.quality_pipeline !== 'legacy' ? ' · Q3' : '';
    $('routeStatus').textContent = `${modeTag}${tier} · ${route.reasoning_effort || 'none'}${route.reasoning_mode === 'pro' ? ' · PRO' : ''}${qualityTag}`;
  }
  $('costStatus').textContent = `턴 $${Number(save.usage.lastTurnUsd || 0).toFixed(4)} / Σ$${Number(save.usage.estimatedUsd || 0).toFixed(3)}`;
}

function continuationSceneTailStable(scene, limit = 10) {
  return (Array.isArray(scene) ? scene : []).slice(-limit);
}

function mergeContinuationIntoRecentStable(turn) {
  const rows = Array.isArray(save.recentTurns) ? save.recentTurns : [];
  const last = rows[rows.length - 1];
  if (!last || !turn) return;
  const mergedScene = continuationSceneTailStable([
    ...(Array.isArray(last.scene) ? last.scene : []),
    ...(Array.isArray(turn.scene) ? turn.scene : []),
  ], 12);
  const mergedSummary = [last.summary, turn.scene_summary].filter(Boolean).join(' / ').slice(-1800);
  last.scene = mergedScene;
  last.summary = mergedSummary;
  last.continued = true;
}

function accumulateUsageStable(usage) {
  if (!usage) return;
  save.usage.inputTokens += usage.input_tokens || 0;
  save.usage.outputTokens += usage.output_tokens || 0;
  save.usage.reasoningTokens += usage.reasoning_tokens || 0;
  save.usage.cachedTokens += usage.cached_tokens || 0;
  save.usage.cacheWriteTokens += usage.cache_write_tokens || 0;
  save.usage.estimatedUsd += usage.estimated_usd || 0;
  save.usage.lastTurnUsd = usage.estimated_usd || 0;
  save.usage.lastCacheHitRate = usage.cache_hit_rate || 0;
  save.usage.lastInputTokens = usage.input_tokens || 0;
  save.usage.lastOutputTokens = usage.output_tokens || 0;
  save.usage.lastReasoningTokens = usage.reasoning_tokens || 0;
}

function zeroStateDeltaStable() {
  return {
    advance_minutes: 0, new_location: null, pc_status: null, fatigue_delta: 0, gold_delta: 0,
    relationship_changes: [], intimacy_changes: [], stat_progress: [], skill_experience: [],
    items_add: [], items_remove: [], active_events_add: [], active_events_remove: [], completed_events_add: [],
    pc_knowledge_add: [], scheduled_events_add: [], scheduled_events_complete: [], hooks_add: [], hooks_update: [],
    memories_add: [], npc_state_updates: [],
  };
}


function compactStateStable() {
  return {
    id: save.id || '',
    version: save.version, turnNumber: save.turnNumber, world: save.world, pc: save.pc,
    relationships: save.relationships, intimacyStates: save.intimacyStates, npcStates: save.npcStates,
    emotionStates: save.emotionStates, activeEvents: save.activeEvents, completedEvents: save.completedEvents,
    pcKnowledge: save.pcKnowledge, memories: save.memories, hooks: save.hooks,
    scheduledEvents: save.scheduledEvents, scheduleContext: save.scheduleContext,
    director: save.director, flags: save.flags,
    npcInnerStates: save.npcInnerStates || {},
    sceneRuntime: save.sceneRuntime || {},
    backgroundDigest: save.backgroundDigest || '',
    qualityTelemetry: save.qualityTelemetry || {},
    routerFeedback: {
      routerVersion: save.qualityTelemetry?.context_router?.routerVersion || '',
      profile: save.qualityTelemetry?.context_router?.profile || '',
      lastInputTokens: Number(save.usage?.lastInputTokens || 0),
    },
  };
}

function applyRuntimeStateStable(data, isContinue = false) {
  const runtime = data?.runtime_state || {};
  save.npcInnerStates = save.npcInnerStates || {};
  for (const [key, row] of Object.entries(runtime.npc_updates || {})) {
    const old = save.npcInnerStates[key] || {};
    save.npcInnerStates[key] = {
      ...old,
      ...row,
      lastUpdatedTurn: save.turnNumber + (isContinue ? 0 : 1),
    };
  }
  if (runtime.scene_runtime && typeof runtime.scene_runtime === 'object') {
    save.sceneRuntime = { ...(save.sceneRuntime || {}), ...runtime.scene_runtime };
  }
  if (typeof data?.background_digest === 'string') {
    save.backgroundDigest = data.background_digest.slice(-2400);
  }
  if (data?.pipeline) {
    save.qualityTelemetry = { ...data.pipeline, at: new Date().toISOString() };
    save.debug = save.debug || {};
    save.debug.lastPipeline = save.qualityTelemetry;
  }
}

async function sendActionStable(action, requestedMode = null) {
  action = String(action || '').trim();
  const requested = ['auto', 'continue'].includes(requestedMode) ? requestedMode : null;
  if (busy) return;
  if (requested === 'auto' && !canAutoFlowStable()) {
    renderFlowControlsStable();
    return;
  }
  if (requested === 'continue' && !canContinueStable()) {
    renderFlowControlsStable();
    return;
  }
  if (!requested && !action) return;

  const inputMode = requested || detectInputMode(action);
  const isMeta = inputMode === 'meta';
  const isAuto = inputMode === 'auto';
  const isContinue = inputMode === 'continue';
  const displayAction = (isAuto || isContinue) ? '' : action;
  const apiAction = isMeta
    ? (stripMetaPrefix(action) || '현재 게임 상태와 규칙을 점검해줘.')
    : isAuto
      ? FLOW_AUTO_ACTION_Stable
      : isContinue
        ? FLOW_CONTINUE_ACTION_Stable
        : action;

  busy = true;
  sendBtn.disabled = true;
  actionInput.disabled = true;
  choicesEl.classList.add('hidden');
  renderFlowControlsStable();

  const loader = document.createElement('div');
  loader.className = isMeta ? 'turn-card meta-turn' : 'turn-card';
  loader.innerHTML = '<div class="loading-dots"><i></i><i></i><i></i></div>';
  story.append(loader);
  scrollBottom();

  try {
    refreshScheduleContext();
    const { accessToken, ...apiSettings } = settings;
    const payload = {
      action: apiAction,
      inputMode,
      saveState: compactState(),
      recentTurns: save.recentTurns,
      rollingSummary: save.rollingSummary,
      availableCgIds: Object.keys(ASSETS.cg || {}),
      forceTerra: forceTerraOnce,
      ...apiSettings,
    };

    let data;
    if (settings.demoMode) {
      data = demoResponse(apiAction, isMeta ? 'meta' : 'game');
      data.route = { ...(data.route || {}), input_mode: inputMode, adapter_version: 'demo-stable-v154' };
      if (isContinue && data.turn) {
        data.turn.state_delta = zeroStateDeltaStable();
        data.turn.emotion_updates = [];
        data.turn.director = { intervention:'none', beat:'routine', event_kind:'none', spotlight_keys:[], callback_key:null, callback_phase:'none', callback_note:null, reason:'demo continue freeze' };
        data.turn.cg_id = null;
      }
    } else {
      const payloadText = JSON.stringify(payload);
      const requestBytes = new Blob([payloadText]).size;
      if (save?.debug) save.debug.lastRequestBytes = requestBytes;

      const res = await fetch('/api/chat-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lumensia-Token': accessToken || '' },
        body: payloadText,
      });

      const raw = await res.text();
      const vercelId = res.headers.get('x-vercel-id') || '';
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        const preview = String(raw || '').replace(/\s+/g, ' ').slice(0, 280);
        const err = new Error(
          `서버가 JSON이 아닌 응답을 보냈습니다. (HTTP ${res.status})` +
          `${preview ? `\n${preview}` : ''}` +
          `${vercelId ? `\nVercel ID: ${vercelId}` : ''}`
        );
        err.code = 'NON_JSON_SERVER_RESPONSE';
        throw err;
      }

      if (!res.ok) {
        throw new Error(
          `${data.error || `API 오류 (HTTP ${res.status})`}` +
          `${data.code ? `\nCode: ${data.code}` : ''}` +
          `${data.request_id ? `\nRequest ID: ${data.request_id}` : ''}` +
          `${vercelId ? `\nVercel ID: ${vercelId}` : ''}`
        );
      }
    }

    loader.remove();
    if (!data?.turn) throw new Error('API 응답에 turn이 없습니다.');
    if (isAuto && !String(data.turn.scene_title || '').startsWith('AUTO · ')) {
      data.turn.scene_title = `AUTO · ${data.turn.scene_title || '자동 진행'}`;
    }
    if (isContinue && !String(data.turn.scene_title || '').startsWith('CONTINUE · ')) {
      data.turn.scene_title = `CONTINUE · ${data.turn.scene_title || '이어서 생성'}`;
    }

    let notices = [];
    if (!isMeta && !isContinue) {
      notices = applyDelta(data.turn.state_delta);
      applyEmotionUpdates(data.turn.emotion_updates || []);
      updateDirectorState(data.turn);
      addTimeline(data.turn);
      rebuildRollingSummary();
    }

    const record = {
      action: displayAction,
      turn: data.turn,
      route: data.route,
      usage: data.usage,
      notices,
      meta: isMeta,
      auto: isAuto,
      continuation: isContinue,
      at: new Date().toISOString(),
    };

    if (!isMeta && !isContinue) {
      save.turnNumber += 1;
      save.recentTurns.push({
        action: isAuto ? FLOW_AUTO_ACTION_Stable : apiAction,
        summary: data.turn.scene_summary,
        importance: data.turn.importance || 'routine',
        scene: continuationSceneTailStable(data.turn.scene, 10),
      });
      save.recentTurns = save.recentTurns.slice(-12);
    } else if (isContinue) {
      mergeContinuationIntoRecentStable(data.turn);
    }

    if (!isMeta) applyRuntimeStateStable(data, isContinue);

    save.renderedTurns.push(record);
    save.renderedTurns = save.renderedTurns.slice(-80);
    accumulateUsageStable(data.usage);

    forceTerraOnce = false;
    updateForceTerraButton();
    metaModeOnce = false;
    updateMetaButton();

    if (!isMeta && !isContinue) {
      save.flags.forceTerraNextTurn = false;
      save.flags.majorScene = data.turn.importance === 'critical';
      refreshScheduleContext();
    }

    save.debug.lastRoute = data.route || null;
    save.debug.lastUsage = data.usage || null;
    save.debug.lastSchedule = save.scheduleContext;
    persist();

    const rendered = renderTurnRecord(record);
    updateStatus(data.route);
    renderInfo();
    if (!isContinue) actionInput.value = '';
    renderFlowControlsStable();
    scrollToTurnStart(rendered?.card || rendered?.user);
  } catch (err) {
    loader.remove();
    const e = document.createElement('div');
    e.className = 'error-card';
    e.textContent = err.message || String(err);
    story.append(e);

    if (!isMeta && save?.renderedTurns?.length) {
      const lastGame = [...save.renderedTurns].reverse().find((x) => !x?.meta);
      const lastChoices = lastGame?.turn?.choices || [];
      if (lastChoices.length) renderChoices(lastChoices);
    }
    metaModeOnce = false;
    updateMetaButton();
    scrollBottom();
  } finally {
    busy = false;
    sendBtn.disabled = false;
    actionInput.disabled = false;
    actionInput.focus();
    renderFlowControlsStable();
  }
}

async function checkHealthStable() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const h = await r.json();
    $('apiHealth').textContent = h.apiConfigured
      ? `API ${h.version || '?'} 연결 준비됨 · ${h.luna} / ${h.terra}${h.qualityPipeline ? ' · Q3' : ''}${h.contextRouter ? ' · CR' : ''}${h.accessTokenRequired ? ' · 접속 토큰 필요' : ''}`
      : 'API 키 미설정. Vercel 환경변수 OPENAI_API_KEY를 추가하거나 데모 모드를 켜세요.';
  } catch {
    $('apiHealth').textContent = 'API 상태를 확인할 수 없음.';
  }
}

function renameFunction(fn, fromName, toName) {
  return fn.toString().replace(`function ${fromName}`, `function ${toName}`).replace(`async function ${fromName}`, `async function ${toName}`);
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`V1.5.4 stable patch marker missing: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`V1.5.4 stable patch marker duplicated: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`V1.5.4 stable regex marker ${label}: expected 1, got ${matches.length}`);
  return source.replace(regex, replacement);
}

function showBootError(error, phase = 'patch') {
  const box = document.createElement('div');
  box.style.cssText = 'margin:16px;padding:14px;border:1px solid #ef4444;border-radius:12px;background:#2a1115;color:#fecaca;white-space:pre-wrap;font:12px/1.5 system-ui,sans-serif';
  box.textContent = `LUMENSIA V1.5.4 ${phase} 실패\n${error?.message || error}\nBase ${BASE_APP_SHA.slice(0, 10)}`;
  document.body.prepend(box);
}

async function boot() {
  let source;
  try {
    const response = await fetch(`/app.js?v=152-${BASE_APP_SHA.slice(0, 10)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`base app.js HTTP ${response.status}`);
    source = await response.text();

    // Keep static asset import usable from the generated blob module by making it absolute.
    source = replaceOnce(
      source,
      "import { ASSETS } from './assets.js';",
      `import { ASSETS } from '${location.origin}/assets.js?v=154';`,
      'ASSETS import'
    );

    source = replaceRegexOnce(
      source,
      /const APP_VERSION = '1\.4\.(?:7|8)';/,
      "const APP_VERSION = '1.5.4';",
      'APP_VERSION'
    );

    source = replaceOnce(
      source,
      "  developerMode: false,\n};",
      "  developerMode: false,\n  qualityPipeline: true,\n  qaRewrite: true,\n  backgroundSim: true,\n};",
      'quality settings defaults'
    );

    source = replaceOnce(
      source,
      "for (const key of ['adultMode','proReasoning','demoMode','showEmotionDebug','developerMode'])",
      "for (const key of ['adultMode','proReasoning','demoMode','showEmotionDebug','developerMode','qualityPipeline','qaRewrite','backgroundSim'])",
      'quality settings listeners'
    );

    source = replaceOnce(
      source,
      "  next.usage = { ...base.usage, ...(next.usage || {}) };\n  return next;",
      "  next.usage = { ...base.usage, ...(next.usage || {}) };\n  next.director.rngSeed = String(next.director.rngSeed || next.id || (crypto.randomUUID?.() || Date.now()));\n  next.npcInnerStates = next.npcInnerStates && typeof next.npcInnerStates === 'object' ? next.npcInnerStates : {};\n  next.sceneRuntime = next.sceneRuntime && typeof next.sceneRuntime === 'object' ? next.sceneRuntime : {};\n  next.backgroundDigest = String(next.backgroundDigest || '');\n  next.qualityTelemetry = next.qualityTelemetry && typeof next.qualityTelemetry === 'object' ? next.qualityTelemetry : {};\n  return next;",
      'runtime save fields'
    );


    source = replaceRegexOnce(
      source,
      /function portraitCandidates\(key, expression = 'default'\) \{[\s\S]*?\n\}\n\nfunction assetUrl/,
      `${renameFunction(portraitCandidatesStable, 'portraitCandidatesStable', 'portraitCandidates')}\n\nfunction assetUrl`,
      'portraitCandidates'
    );

    source = replaceRegexOnce(
      source,
      /function compactState\(\) \{[\s\S]*?\n\}\n\nasync function sendAction/,
      `${renameFunction(compactStateStable, 'compactStateStable', 'compactState')}\n\nasync function sendAction`,
      'compactState runtime fields'
    );

    source = replaceRegexOnce(
      source,
      /function renderChoices\(choices\) \{[\s\S]*?\n\}\n\nfunction updateStatus/,
      `${renameFunction(renderChoicesStable, 'renderChoicesStable', 'renderChoices')}\n\nfunction updateStatus`,
      'renderChoices'
    );

    source = replaceRegexOnce(
      source,
      /function renderAll\(\) \{[\s\S]*?\n\}\n\nfunction renderTurnRecord/,
      `${renameFunction(renderAllStable, 'renderAllStable', 'renderAll')}\n\nfunction renderTurnRecord`,
      'renderAll flow controls lifecycle'
    );

    source = replaceRegexOnce(
      source,
      /function updateStatus\(route\) \{[\s\S]*?\n\}\n\nfunction renderInfo/,
      `${renameFunction(updateStatusStable, 'updateStatusStable', 'updateStatus')}\n\nfunction renderInfo`,
      'updateStatus'
    );

    const helperSource = [
      `const AUTO_GESTURE_PX = ${AUTO_GESTURE_PX};`,
      `const FLOW_AUTO_ACTION_Stable = ${JSON.stringify(FLOW_AUTO_ACTION)};`,
      `const FLOW_CONTINUE_ACTION_Stable = ${JSON.stringify(FLOW_CONTINUE_ACTION)};`,
      latestWorldRecordStable.toString(),
      canAutoFlowStable.toString(),
      canContinueStable.toString(),
      renderFlowControlsStable.toString(),
      installAutoFlowGestureStable.toString(),
      continuationSceneTailStable.toString(),
      mergeContinuationIntoRecentStable.toString(),
      accumulateUsageStable.toString(),
      zeroStateDeltaStable.toString(),
      compactStateStable.toString(),
      applyRuntimeStateStable.toString(),
    ].join('\n\n');

    source = replaceOnce(source, 'async function sendAction(action) {', `${helperSource}\n\nasync function sendAction(action) {`, 'flow helper insertion');

    source = replaceRegexOnce(
      source,
      /async function sendAction\(action\) \{[\s\S]*?\n\}\n\nfunction demoResponse/,
      `${renameFunction(sendActionStable, 'sendActionStable', 'sendAction')}\n\nfunction demoResponse`,
      'sendAction'
    );

    source = replaceRegexOnce(
      source,
      /async function checkHealth\(\) \{[\s\S]*?\}\n\n\/\/ ===== characters-v2 asset audit: BEGIN =====/,
      `${renameFunction(checkHealthStable, 'checkHealthStable', 'checkHealth')}\n\n// ===== characters-v2 asset audit: BEGIN =====`,
      'checkHealth'
    );

    source = source.replace(/APP V1\.4\.(?:7|8) \/ SAVE/g, 'APP V${APP_VERSION} / SAVE');

    const debugQualityNeedle = "\\n\\n[COUNTS]\\ntimeline ${save.timeline.length}";
    if (source.includes(debugQualityNeedle)) {
      source = source.replace(
        debugQualityNeedle,
        "\\n\\n[QUALITY PIPELINE]\\nmode=${save.qualityTelemetry?.pipeline||'-'} / qa=${save.qualityTelemetry?.qa_result||'-'} / rewrite=${save.qualityTelemetry?.rewrite_applied?'Y':'N'} / bg=${save.qualityTelemetry?.background_sim?'Y':'N'}\\ninnerNPC=${Object.keys(save.npcInnerStates||{}).length} / beats=${(save.sceneRuntime?.remaining_beats||[]).length}\\n\\n[CONTEXT ROUTER]\\nprofile=${save.qualityTelemetry?.context_router?.profile||'-'} / status=${save.qualityTelemetry?.context_router?.budget_status||'-'} / scale=${save.qualityTelemetry?.context_router?.adaptive_scale??'-'}\\ntarget=${save.qualityTelemetry?.context_router?.target_input_tokens??'-'} / softMax=${save.qualityTelemetry?.context_router?.soft_max_tokens??'-'} / actual=${save.qualityTelemetry?.context_router?.actual_input_tokens??'-'}\\nchars=${save.qualityTelemetry?.context_router?.routed_chars??'-'} / original=${save.qualityTelemetry?.context_router?.original_chars??'-'} / cut=${Math.round(Number(save.qualityTelemetry?.context_router?.char_reduction_ratio||0)*100)}%\\nnpcs=${(save.qualityTelemetry?.context_router?.selected_npcs||[]).join(', ')||'-'}\\nworld=${(save.qualityTelemetry?.context_router?.canon_modules?.world||[]).join(' | ')||'-'}\\nnpcCanon=${(save.qualityTelemetry?.context_router?.canon_modules?.npc||[]).join(' | ')||'-'}\\nspeech=${(save.qualityTelemetry?.context_router?.canon_modules?.speech||[]).join(' | ')||'-'}\\n\\n[EVENT DIRECTOR V2]\\nmode=${save.qualityTelemetry?.event_director_v2?.mode||'-'} / result=${save.qualityTelemetry?.event_director_v2?.result||'-'} / style=${save.qualityTelemetry?.event_director_v2?.event_style||'-'}\\nselected=${save.qualityTelemetry?.event_director_v2?.selected_key||'-'} / seed=${save.qualityTelemetry?.event_director_v2?.seed_tag||'-'} / cooldown=${save.qualityTelemetry?.event_director_v2?.cooldown_turns??'-'}\\nroll=${save.qualityTelemetry?.event_director_v2?.roll??'-'} / noneWeight=${save.qualityTelemetry?.event_director_v2?.none_weight??'-'} / eligible=${(save.qualityTelemetry?.event_director_v2?.eligible_keys||[]).join(', ')||'-'}\\n\\n[COUNTS]\\ntimeline ${save.timeline.length}"
      );
    }


    source = replaceOnce(
      source,
      'refreshScheduleContext(); updateForceTerraButton(); checkHealth(); renderAll();',
      'refreshScheduleContext(); updateForceTerraButton(); checkHealth(); installAutoFlowGestureStable(); renderAll();',
      'boot hook'
    );
  } catch (error) {
    showBootError(error, 'patch 준비');
    // Safe fallback: source was never executed, so the previous app remains usable.
    try { await import(`/app.js?v=fallback-${Date.now()}`); } catch (fallbackError) { showBootError(fallbackError, 'fallback'); }
    return;
  }

  const blob = new Blob([source + `\n//# sourceURL=lumensia-app-v${PATCH_VERSION}.js`], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await import(url);
  } catch (error) {
    showBootError(error, 'patched module 실행');
    throw error;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

boot();
