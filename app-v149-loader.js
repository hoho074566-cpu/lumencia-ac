// LUMENSIA MOBILE V1.4.9 runtime patch loader
// Base source: hoho074566-cpu/lumencia-ac main @ 90160e680e062a18fbbf84d6ef77ccbbfc6dbaae
// Why loader: preserve the large proven V1.4.8 app.js byte-for-byte in GitHub while applying
// a small, auditable V1.4.9 delta at boot. If required source markers disappear, boot stops visibly.

const PATCH_VERSION = '1.4.9';
const BASE_COMMIT = '90160e680e062a18fbbf84d6ef77ccbbfc6dbaae';
const AUTO_GESTURE_PX = 84;

const FLOW_AUTO_ACTION = '[AUTO FLOW: PC 새 행동 없음]';
const FLOW_CONTINUE_ACTION = '[CONTINUE: 직전 GM 응답 이어쓰기]';

function portraitCandidatesV149(key, expression = 'default') {
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

  // V1.4.9: portrait/default까지 실패했을 때만 전신 DEFAULT를 마지막 안전망으로 사용.
  if (char.fullbody && !seen.has(char.fullbody)) {
    rows.push({ state: 'fullbody', url: char.fullbody });
  }
  return rows;
}

function latestWorldRecordV149() {
  return [...(save.renderedTurns || [])].reverse().find((record) => record?.turn && !record?.meta) || null;
}

function canAutoFlowV149() {
  const latest = latestWorldRecordV149();
  if (!latest || busy || metaModeOnce) return false;
  if (String(actionInput.value || '').trim()) return false;
  if ((latest.turn?.choices || []).length) return false;
  return true;
}

function canContinueV149() {
  const latest = latestWorldRecordV149();
  return Boolean(latest && !busy && !metaModeOnce);
}

function renderFlowControlsV149() {
  let wrap = $('flowControlsV149');
  const latest = latestWorldRecordV149();

  if (!wrap) {
    wrap = document.createElement('section');
    wrap.id = 'flowControlsV149';
    wrap.className = 'flow-controls-v149';

    const auto = document.createElement('button');
    auto.id = 'autoFlowBtnV149';
    auto.type = 'button';
    auto.className = 'flow-btn-v149 auto';
    auto.textContent = '▶ 자동 진행';
    auto.addEventListener('click', () => sendAction('', 'auto'));

    const cont = document.createElement('button');
    cont.id = 'continueBtnV149';
    cont.type = 'button';
    cont.className = 'flow-btn-v149 continue';
    cont.textContent = '✦ 이어서 생성';
    cont.addEventListener('click', () => sendAction('', 'continue'));

    wrap.append(auto, cont);
  }

  story.append(wrap);
  wrap.classList.toggle('hidden', !latest);

  const auto = $('autoFlowBtnV149');
  const cont = $('continueBtnV149');
  if (auto) {
    auto.disabled = !canAutoFlowV149();
    const latestHasChoices = Boolean((latest?.turn?.choices || []).length);
    auto.title = latestHasChoices
      ? '선택지가 있어 PC 판단이 필요한 지점입니다.'
      : String(actionInput.value || '').trim()
        ? '입력창에 작성 중인 내용이 있어 자동 진행이 잠겼습니다.'
        : 'PC 새 행동 없이 현재 장면의 비상호작용 구간만 진행합니다.';
  }
  if (cont) {
    cont.disabled = !canContinueV149();
    cont.title = '직전 GM 응답의 같은 장면만 더 이어 씁니다. 게임 상태는 진행하지 않습니다.';
  }
}

function installAutoFlowGestureV149() {
  if (!$('v149FlowStyle')) {
    const style = document.createElement('style');
    style.id = 'v149FlowStyle';
    style.textContent = `
      .flow-controls-v149{display:flex;gap:8px;padding:8px 12px 14px;align-items:center;justify-content:flex-end}
      .flow-controls-v149.hidden{display:none}
      .flow-btn-v149{appearance:none;border:1px solid rgba(148,163,184,.26);border-radius:999px;background:rgba(30,41,59,.82);color:#e5e7eb;padding:9px 13px;font-size:12px;font-weight:800;letter-spacing:-.01em}
      .flow-btn-v149.continue{border-color:rgba(217,184,108,.38);color:#f4d995}
      .flow-btn-v149:disabled{opacity:.34;filter:saturate(.4)}
      #autoPullHintV149{position:fixed;z-index:98;left:50%;bottom:104px;transform:translate(-50%,18px);opacity:0;pointer-events:none;padding:7px 11px;border-radius:999px;background:rgba(15,23,42,.94);border:1px solid rgba(148,163,184,.24);font-size:11px;font-weight:800;color:#dbeafe;transition:opacity .12s ease,transform .12s ease}
      #autoPullHintV149.show{opacity:1;transform:translate(-50%,0)}
      #autoPullHintV149.ready{color:#fde68a;border-color:rgba(245,158,11,.5)}
    `;
    document.head.append(style);
  }

  let hint = $('autoPullHintV149');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'autoPullHintV149';
    document.body.append(hint);
  }

  actionInput.addEventListener('input', renderFlowControlsV149);
  choicesEl.addEventListener('click', () => setTimeout(renderFlowControlsV149, 0));

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
    if (!touch || !atBottom() || !canAutoFlowV149()) return reset();
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
    const fire = eligible && pull >= AUTO_GESTURE_PX && canAutoFlowV149();
    reset();
    if (fire) sendAction('', 'auto');
  }, { passive: true });

  window.addEventListener('touchcancel', reset, { passive: true });
  renderFlowControlsV149();
}

function renderChoicesV149(choices) {
  choicesEl.innerHTML = '';
  story.append(choicesEl);

  if (!choices.length) {
    choicesEl.classList.add('hidden');
    renderFlowControlsV149();
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
      renderFlowControlsV149();
    });
    choicesEl.append(b);
  });

  choicesEl.classList.remove('hidden');
  renderFlowControlsV149();
}

function updateStatusV149(route) {
  $('timeStatus').textContent = `D+${save.world.dayElapsed} · ${save.world.date} ${save.world.weekday} ${save.world.time}`;
  $('locationStatus').textContent = save.world.location;
  if (route) {
    const mode = String(route.input_mode || 'game').toUpperCase();
    const modeTag = mode !== 'GAME' ? `${mode} · ` : '';
    const tier = String(route.tier || 'demo').toUpperCase();
    $('routeStatus').textContent = `${modeTag}${tier} · ${route.reasoning_effort || 'none'}${route.reasoning_mode === 'pro' ? ' · PRO' : ''}`;
  }
  $('costStatus').textContent = `턴 $${Number(save.usage.lastTurnUsd || 0).toFixed(4)} / Σ$${Number(save.usage.estimatedUsd || 0).toFixed(3)}`;
}

function mergeContinuationIntoRecentV149(turn) {
  const rows = save.recentTurns || [];
  const last = rows[rows.length - 1];
  if (!last || !turn) return;
  const mergedScene = [...(last.scene || []), ...(turn.scene || [])].slice(-12);
  const mergedSummary = [last.summary, turn.scene_summary].filter(Boolean).join(' / ').slice(-1800);
  last.scene = mergedScene;
  last.summary = mergedSummary;
  last.continued = true;
}

function accumulateUsageV149(usage) {
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

function zeroStateDeltaV149() {
  return {
    advance_minutes: 0, new_location: null, pc_status: null, fatigue_delta: 0, gold_delta: 0,
    relationship_changes: [], intimacy_changes: [], stat_progress: [], skill_experience: [],
    items_add: [], items_remove: [], active_events_add: [], active_events_remove: [], completed_events_add: [],
    pc_knowledge_add: [], scheduled_events_add: [], scheduled_events_complete: [], hooks_add: [], hooks_update: [],
    memories_add: [], npc_state_updates: [],
  };
}

async function sendActionV149(action, requestedMode = null) {
  action = String(action || '').trim();
  const requested = ['auto', 'continue'].includes(requestedMode) ? requestedMode : null;
  if (busy) return;
  if (requested === 'auto' && !canAutoFlowV149()) {
    renderFlowControlsV149();
    return;
  }
  if (requested === 'continue' && !canContinueV149()) {
    renderFlowControlsV149();
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
      ? FLOW_AUTO_ACTION_V149
      : isContinue
        ? FLOW_CONTINUE_ACTION_V149
        : action;

  busy = true;
  sendBtn.disabled = true;
  actionInput.disabled = true;
  choicesEl.classList.add('hidden');
  renderFlowControlsV149();

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
      data.route = { ...(data.route || {}), input_mode: inputMode, adapter_version: 'demo-v149' };
      if (isContinue && data.turn) {
        data.turn.state_delta = zeroStateDeltaV149();
        data.turn.emotion_updates = [];
        data.turn.director = { intervention:'none', beat:'routine', event_kind:'none', spotlight_keys:[], callback_key:null, callback_phase:'none', callback_note:null, reason:'demo continue freeze' };
        data.turn.cg_id = null;
      }
    } else {
      const payloadText = JSON.stringify(payload);
      const requestBytes = new Blob([payloadText]).size;
      if (save?.debug) save.debug.lastRequestBytes = requestBytes;

      const res = await fetch('/api/chat-v149', {
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
        action: isAuto ? FLOW_AUTO_ACTION_V149 : apiAction,
        summary: data.turn.scene_summary,
        importance: data.turn.importance || 'routine',
        scene: (data.turn.scene || []).slice(0, 10),
      });
      save.recentTurns = save.recentTurns.slice(-12);
    } else if (isContinue) {
      mergeContinuationIntoRecentV149(data.turn);
    }

    save.renderedTurns.push(record);
    save.renderedTurns = save.renderedTurns.slice(-80);
    accumulateUsageV149(data.usage);

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
    renderFlowControlsV149();
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
    renderFlowControlsV149();
  }
}

async function checkHealthV149() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const h = await r.json();
    $('apiHealth').textContent = h.apiConfigured
      ? `API ${h.version || '?'} 연결 준비됨 · ${h.luna} / ${h.terra}${h.accessTokenRequired ? ' · 접속 토큰 필요' : ''}`
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
  if (first < 0) throw new Error(`V1.4.9 patch marker missing: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`V1.4.9 patch marker duplicated: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`V1.4.9 regex marker ${label}: expected 1, got ${matches.length}`);
  return source.replace(regex, replacement);
}

function showBootError(error, phase = 'patch') {
  const box = document.createElement('div');
  box.style.cssText = 'margin:16px;padding:14px;border:1px solid #ef4444;border-radius:12px;background:#2a1115;color:#fecaca;white-space:pre-wrap;font:12px/1.5 system-ui,sans-serif';
  box.textContent = `LUMENSIA V1.4.9 ${phase} 실패\n${error?.message || error}\nBase ${BASE_COMMIT.slice(0, 10)}`;
  document.body.prepend(box);
}

async function boot() {
  let source;
  try {
    const response = await fetch(`/app.js?v=149-${BASE_COMMIT.slice(0, 10)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`base app.js HTTP ${response.status}`);
    source = await response.text();

    // Keep static asset import usable from the generated blob module by making it absolute.
    source = replaceOnce(
      source,
      "import { ASSETS } from './assets.js';",
      `import { ASSETS } from '${location.origin}/assets.js?v=149';`,
      'ASSETS import'
    );

    source = replaceRegexOnce(
      source,
      /const APP_VERSION = '1\.4\.(?:7|8)';/,
      "const APP_VERSION = '1.4.9';",
      'APP_VERSION'
    );

    source = replaceRegexOnce(
      source,
      /function portraitCandidates\(key, expression = 'default'\) \{[\s\S]*?\n\}\n\nfunction assetUrl/,
      `${renameFunction(portraitCandidatesV149, 'portraitCandidatesV149', 'portraitCandidates')}\n\nfunction assetUrl`,
      'portraitCandidates'
    );

    source = replaceRegexOnce(
      source,
      /function renderChoices\(choices\) \{[\s\S]*?\n\}\n\nfunction updateStatus/,
      `${renameFunction(renderChoicesV149, 'renderChoicesV149', 'renderChoices')}\n\nfunction updateStatus`,
      'renderChoices'
    );

    source = replaceRegexOnce(
      source,
      /function updateStatus\(route\) \{[\s\S]*?\n\}\n\nfunction renderInfo/,
      `${renameFunction(updateStatusV149, 'updateStatusV149', 'updateStatus')}\n\nfunction renderInfo`,
      'updateStatus'
    );

    const helperSource = [
      `const AUTO_GESTURE_PX = ${AUTO_GESTURE_PX};`,
      `const FLOW_AUTO_ACTION_V149 = ${JSON.stringify(FLOW_AUTO_ACTION)};`,
      `const FLOW_CONTINUE_ACTION_V149 = ${JSON.stringify(FLOW_CONTINUE_ACTION)};`,
      latestWorldRecordV149.toString(),
      canAutoFlowV149.toString(),
      canContinueV149.toString(),
      renderFlowControlsV149.toString(),
      installAutoFlowGestureV149.toString(),
      mergeContinuationIntoRecentV149.toString(),
      accumulateUsageV149.toString(),
      zeroStateDeltaV149.toString(),
    ].join('\n\n');

    source = replaceOnce(source, 'async function sendAction(action) {', `${helperSource}\n\nasync function sendAction(action) {`, 'flow helper insertion');

    source = replaceRegexOnce(
      source,
      /async function sendAction\(action\) \{[\s\S]*?\n\}\n\nfunction demoResponse/,
      `${renameFunction(sendActionV149, 'sendActionV149', 'sendAction')}\n\nfunction demoResponse`,
      'sendAction'
    );

    source = replaceRegexOnce(
      source,
      /async function checkHealth\(\) \{[\s\S]*?\}\n\n\/\/ ===== characters-v2 asset audit: BEGIN =====/,
      `${renameFunction(checkHealthV149, 'checkHealthV149', 'checkHealth')}\n\n// ===== characters-v2 asset audit: BEGIN =====`,
      'checkHealth'
    );

    source = source.replace(/APP V1\.4\.(?:7|8) \/ SAVE/g, 'APP V${APP_VERSION} / SAVE');

    source = replaceOnce(
      source,
      'refreshScheduleContext(); updateForceTerraButton(); checkHealth(); renderAll();',
      'refreshScheduleContext(); updateForceTerraButton(); checkHealth(); installAutoFlowGestureV149(); renderAll(); renderFlowControlsV149();',
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
