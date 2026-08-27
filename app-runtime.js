// LUMENSIA MOBILE V1.5.6 stable runtime
// V1.5.6 Scene Momentum Recovery HF1 + NPC Goal V2 + Relationship Reason V1 on the proven V1.4.8 base app.
// Stable-path migration base head: hoho074566-cpu/lumencia-ac @ a9170d6dca82c613436dcc5b3bc6ba86b9f86ba4
// Reviewed app.js blob includes the canonical characters-v2 integration.
// Why loader: preserve the large proven V1.4.8 app.js byte-for-byte in GitHub while applying
// a stable-path V1.5.6 delta at boot. If required source markers disappear, boot stops visibly.

const PATCH_VERSION = '1.5.6';
const BASE_APP_SHA = 'b5ca1de1996361638b9e4f5d49a73101302a0a68';
const LIVE_BASE_HEAD = 'a9170d6dca82c613436dcc5b3bc6ba86b9f86ba4';
const AUTO_GESTURE_PX = 84;

const FLOW_AUTO_ACTION = '[AUTO FLOW: PC 새 행동 없음]';
const FLOW_CONTINUE_ACTION = '[CONTINUE: 직전 GM 응답 이어쓰기]';

function portraitCandidatesStable(key, expression = 'default') {
  const char = ASSETS.characters[key];
  if (!char) return [];

  const normalized = String(expression || 'default').toLowerCase();
  const requested = ASSETS.portraitExpressions.includes(normalized) ? normalized : 'default';
  const order = EXPRESSION_FALLBACKS[requested];
  const seen = new Set();
  const rows = [];

  for (const state of order) {
    const url = state === 'default' ? char.default : char.expressions?.[state];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    rows.push({ state, url });
  }

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

function suppressDuplicateFlowControlsStable() {
  for (const button of story.querySelectorAll('button')) {
    if (button.closest('#flowControlsStable')) continue;
    const label = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    if (!/^(?:▶\s*)?자동 진행(?:\s*·.*)?$|^(?:✦\s*)?이어서 생성(?:\s*·.*)?$/.test(label)) continue;
    button.disabled = true;
    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
  }
}

function renderFlowControlsStable() {
  suppressDuplicateFlowControlsStable();
  const existing = [...story.querySelectorAll('#flowControlsStable')];
  let wrap = existing.shift() || null;
  existing.forEach((duplicate) => duplicate.remove());
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
    auto.hidden = false;
    auto.removeAttribute('aria-hidden');
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
  suppressDuplicateFlowControlsStable();
  if (cont) {
    cont.hidden = false;
    cont.removeAttribute('aria-hidden');
    cont.disabled = !canContinueStable();
    cont.textContent = '✦ 이어서 생성';
    cont.title = '직전 GM 응답의 같은 순간만 정적으로 보강합니다. 게임 상태는 진행하지 않습니다.';
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
    relationship_changes: [], npc_relationship_changes: [], faction_reputation_changes: [], intimacy_changes: [], stat_progress: [], skill_experience: [], skill_learning: [], awakening_progress: [], talent_evolution: [],
    items_add: [], items_remove: [], active_events_add: [], active_events_remove: [], completed_events_add: [],
    pc_knowledge_add: [], scheduled_events_add: [], scheduled_events_complete: [], hooks_add: [], hooks_update: [],
    memories_add: [], npc_state_updates: [],
  };
}

function compactStateStable() {
  return {
    id: save.id || '',
    version: save.version, turnNumber: save.turnNumber, world: save.world, creation: save.creation, pc: save.pc,
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

function applySkillLearningRuntimeStable(runtime = {}) {
  const packet = runtime?.skill_learning;
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return [];
  const notices = [];
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const candidates = {};
  for (const [rawName, raw] of Object.entries(packet.candidates && typeof packet.candidates === 'object' && !Array.isArray(packet.candidates) ? packet.candidates : {}).slice(0, 8)) {
    const name = clean(rawName, 48);
    if (name.length < 2 || forbidden.has(name) || /[{}<>\r\n]/.test(name) || save.pc.skills?.[name]) continue;
    const progress = Math.trunc(clamp(raw?.progress, 0, 99));
    if (progress <= 0) continue;
    candidates[name] = {
      progress,
      basis: clean(raw?.basis, 120) || null,
      reason: clean(raw?.reason, 280) || null,
      updated_turn: Math.max(0, Math.trunc(Number(raw?.updated_turn || 0))),
      history: (Array.isArray(raw?.history) ? raw.history : []).slice(-6).map((row) => ({
        turn: Math.max(0, Math.trunc(Number(row?.turn || 0))),
        amount: Math.trunc(clamp(row?.amount, 1, 15)),
        basis: clean(row?.basis, 120),
        reason: clean(row?.reason, 280),
      })).filter((row) => row.basis && row.reason),
    };
  }
  save.pc.skillCandidates = candidates;
  for (const raw of (Array.isArray(packet.unlocked_skills) ? packet.unlocked_skills : []).slice(0, 2)) {
    const name = clean(raw?.skill, 48);
    if (name.length < 2 || forbidden.has(name) || /[{}<>\r\n]/.test(name) || save.pc.skills?.[name]) continue;
    save.pc.skills[name] = { grade: 'F', hiddenXp: 0 };
    delete save.pc.skillCandidates[name];
    notices.push(`새 스킬 습득: ${name} F`);
  }
  return notices;
}

function applyAwakeningTalentRuntimeStable(runtime = {}) {
  const packet = runtime?.awakening_talent;
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return [];
  const notices = [];
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const identity = (value) => clean(value, 80).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
  const validName = (value) => value.length >= 2 && !forbidden.has(value) && !/[{}<>\r\n]/.test(value);
  const validLimitation = (value) => Boolean(value) && !/^(?:(?:제한|한계|대가|조건)\s*(?:이|가|은|는|:)?\s*(?:없(?:음|다|는)?|무(?:제약|조건)?|존재하지)|무제한|무조건\s*성공|no\s+(?:limit|limitation|cost|condition)|unlimited)(?:$|\s|[.!?])/i.test(value);
  const abilityMap = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
    if (!Array.isArray(value)) return {};
    return Object.fromEntries(value.slice(0, 16).map((row) => {
      const name = clean(typeof row === 'string' ? row : row?.name, 64);
      return [name, typeof row === 'string' ? { description:row } : { ...row }];
    }).filter(([name]) => validName(name)));
  };
  save.pc.traits = abilityMap(save.pc.traits);
  save.pc.authorities = abilityMap(save.pc.authorities);
  const existing = new Set([...Object.keys(save.pc.traits), ...Object.keys(save.pc.authorities)].map(identity).filter(Boolean));
  const sourceCandidates = packet.candidates && typeof packet.candidates === 'object' && !Array.isArray(packet.candidates) ? packet.candidates : {};
  const candidates = { trait:{}, authority:{} };
  for (const kind of ['trait', 'authority']) {
    for (const [rawName, raw] of Object.entries(sourceCandidates[kind] && typeof sourceCandidates[kind] === 'object' && !Array.isArray(sourceCandidates[kind]) ? sourceCandidates[kind] : {}).slice(0, 4)) {
      const name = clean(rawName, 64);
      const key = identity(name);
      const description = clean(raw?.description, 360);
      const limitation = clean(raw?.limitation, 360);
      const reason = clean(raw?.reason, 300);
      if (!validName(name) || !key || existing.has(key) || !description || !validLimitation(limitation) || !reason) continue;
      const opposite = kind === 'trait' ? candidates.authority : candidates.trait;
      if (Object.keys(opposite).some((otherName) => identity(otherName) === key)) continue;
      const progress = Math.trunc(clamp(raw?.progress, 0, 100));
      if (progress <= 0) continue;
      candidates[kind][name] = {
        progress,
        milestones: Math.trunc(clamp(raw?.milestones, 0, 20)),
        description,
        limitation,
        reason,
        updated_turn: Math.max(0, Math.trunc(Number(raw?.updated_turn || 0))),
        milestone_keys: [...new Set((Array.isArray(raw?.milestone_keys) ? raw.milestone_keys : []).map((value) => clean(value, 180)).filter(Boolean))].slice(-8),
        history: (Array.isArray(raw?.history) ? raw.history : []).slice(-8).map((row) => ({
          turn: Math.max(0, Math.trunc(Number(row?.turn || 0))),
          amount: Math.trunc(clamp(row?.amount, 1, 10)),
          milestone: row?.milestone === true,
          reason: clean(row?.reason, 300),
          evidence_key: clean(row?.evidence_key, 180),
        })).filter((row) => row.reason && row.evidence_key),
      };
    }
  }
  save.pc.awakeningCandidates = candidates;

  const installAwakened = (kind, rows) => {
    const target = kind === 'authority' ? save.pc.authorities : save.pc.traits;
    for (const raw of (Array.isArray(rows) ? rows : []).slice(0, 1)) {
      const name = clean(raw?.name, 64);
      const key = identity(name);
      const description = clean(raw?.description, 360);
      const limitation = clean(raw?.limitation, 360);
      const source = clean(raw?.source, 300);
      if (!validName(name) || !key || existing.has(key) || !description || !validLimitation(limitation) || !source) continue;
      target[name] = { description, limitation, awakened_turn:Math.max(0, Math.trunc(Number(raw?.awakened_turn || 0))), source };
      existing.add(key);
      for (const candidateName of Object.keys(save.pc.awakeningCandidates[kind])) if (identity(candidateName) === key) delete save.pc.awakeningCandidates[kind][candidateName];
      notices.push(`${kind === 'authority' ? 'Authority' : 'Trait'} 각성: ${name}`);
    }
  };
  installAwakened('trait', packet.awakened_traits);
  installAwakened('authority', packet.awakened_authorities);

  save.pc.talents = save.pc.talents && typeof save.pc.talents === 'object' && !Array.isArray(save.pc.talents) ? save.pc.talents : {};
  const talentLabels = { magic:'마법', martial:'무', soul:'영혼', knowledge:'지식' };
  for (const raw of (Array.isArray(packet.talent_changes) ? packet.talent_changes : []).slice(0, 1)) {
    const talent = Object.prototype.hasOwnProperty.call(talentLabels, raw?.talent) ? raw.talent : null;
    const before = Math.trunc(Number(raw?.before));
    const after = Math.trunc(Number(raw?.after));
    const current = talent ? Math.trunc(clamp(save.pc.talents[talent], 1, 10)) : 0;
    if (!talent || before < 1 || after !== before + 1 || after > 10) continue;
    if (current === before) {
      save.pc.talents[talent] = after;
      notices.push(`재능 진화: ${talentLabels[talent]} ${before} → ${after}`);
    }
  }
  save.pc.talentEvolutionHistory = (Array.isArray(packet.talent_history) ? packet.talent_history : []).slice(-12).map((row) => ({
    talent: Object.prototype.hasOwnProperty.call(talentLabels, row?.talent) ? row.talent : null,
    before: Math.trunc(Number(row?.before)),
    after: Math.trunc(Number(row?.after)),
    cause: clean(row?.cause, 280),
    reason: clean(row?.reason, 300),
    cause_key: clean(row?.cause_key, 180),
    turn: Math.max(0, Math.trunc(Number(row?.turn || 0))),
  })).filter((row) => row.talent && row.before >= 1 && row.after === row.before + 1 && row.after <= 10 && row.cause && row.reason && row.cause_key);
  return notices;
}

function applyNpcRelationshipDeltaStable(turn, runtime = {}) {
  const serverBacked = new Set(Object.entries(runtime?.npc_updates || {}).filter(([, row]) => row?.npc_relationships && typeof row.npc_relationships === 'object').map(([key]) => key));
  const rows = Array.isArray(turn?.state_delta?.npc_relationship_changes) ? turn.state_delta.npc_relationship_changes.slice(0, 6) : [];
  const turnNo = Math.max(0, Number(save.turnNumber || 0));
  for (const raw of rows) {
    const sourceKey = String(raw?.source_npc_key || '').trim();
    const targetKey = String(raw?.target_npc_key || '').trim();
    const reason = String(raw?.reason || '').trim().slice(0, 300);
    if (!reason || sourceKey === targetKey || serverBacked.has(sourceKey) || !ASSETS.characters?.[sourceKey] || !ASSETS.characters?.[targetKey]) continue;
    const affinityDelta = Math.trunc(clamp(raw?.affinity_delta, -10, 10));
    const trustDelta = Math.trunc(clamp(raw?.trust_delta, -10, 10));
    const status = String(raw?.status || '').trim().slice(0, 80) || null;
    const source = save.npcInnerStates[sourceKey] && typeof save.npcInnerStates[sourceKey] === 'object' ? save.npcInnerStates[sourceKey] : {};
    const links = source.npc_relationships && typeof source.npc_relationships === 'object' ? { ...source.npc_relationships } : {};
    const old = links[targetKey] && typeof links[targetKey] === 'object' ? links[targetKey] : {};
    if (affinityDelta === 0 && trustDelta === 0 && (!status || status === String(old.status || '중립'))) continue;
    const historyRow = { turn:turnNo, affinity_delta:affinityDelta, trust_delta:trustDelta, status, reason, source_event:String(turn?.event_progress?.event_instance_id || turn?.director?.callback_key || turn?.scene_title || '').slice(0, 120) || null };
    links[targetKey] = { affinity:Math.trunc(clamp(Number(old.affinity || 0) + affinityDelta, -100, 100)), trust:Math.trunc(clamp(Number(old.trust || 0) + trustDelta, -100, 100)), status:status || String(old.status || '중립').slice(0, 80), reason, updated_turn:turnNo, history:[...(Array.isArray(old.history) ? old.history : []), historyRow].slice(-8) };
    source.npc_relationships = Object.fromEntries(Object.entries(links).filter(([key]) => key !== sourceKey && ASSETS.characters?.[key]).sort((a, b) => Number(b[1]?.updated_turn || 0) - Number(a[1]?.updated_turn || 0) || (Math.abs(Number(b[1]?.affinity || 0)) + Math.abs(Number(b[1]?.trust || 0))) - (Math.abs(Number(a[1]?.affinity || 0)) + Math.abs(Number(a[1]?.trust || 0))) || a[0].localeCompare(b[0])).slice(0, 16));
    save.npcInnerStates[sourceKey] = source;
  }
}

function applyRuntimeStateStable(data, isContinue = false) {
  const runtime = data?.runtime_state || {};
  const notices = [...applySkillLearningRuntimeStable(runtime), ...applyAwakeningTalentRuntimeStable(runtime)];
  save.npcInnerStates = save.npcInnerStates || {};
  applyNpcRelationshipDeltaStable(data?.turn, runtime);
  for (const [key, row] of Object.entries(runtime.npc_updates || {})) {
    const old = save.npcInnerStates[key] || {};
    save.npcInnerStates[key] = {
      ...old,
      ...row,
      lastUpdatedTurn: save.turnNumber + (isContinue ? 0 : 1),
    };
  }
  save.npcStates = save.npcStates || {};
  for (const row of (Array.isArray(runtime.offscreen_npc_updates) ? runtime.offscreen_npc_updates : []).slice(0, 2)) {
    const key = String(row?.npc_key || '').trim().slice(0, 80);
    if (!/^[a-z0-9_-]+$/i.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    const old = save.npcStates[key] || {};
    save.npcStates[key] = {
      ...old,
      ...(row.location ? { location: String(row.location).slice(0, 100) } : {}),
      ...(row.status ? { status: String(row.status).slice(0, 140) } : {}),
      updatedAtTurn: save.turnNumber,
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
  return notices;
}

function materializeEventConsequencesStable(turn, pipeline = null, action = '') {
  const delta = turn?.state_delta;
  if (!delta || typeof delta !== 'object') return [];
  const sourceEvent = turn?.event_progress?.event_instance_id
    || save?.sceneRuntime?.eventProgress?.eventInstanceId
    || save?.sceneRuntime?.turn_hook?.event_instance_id
    || null;
  const isDueFollowUp = Boolean(pipeline?.event_consequence?.selected_id);
  const additions = materializeDelayedConsequences({
    rows: delta.delayed_consequences_add,
    world: save.world,
    advanceMinutes: delta.advance_minutes,
    turnNumber: save.turnNumber + 1,
    existingHooks: save.hooks,
    sourceEvent,
    maxAdditions: isDueFollowUp ? (pipeline?.event_consequence?.status === 'resolved' ? 1 : 0) : 3,
    minimumDelayMinutes: explicitFutureDelayMinutes(action),
  });
  if (!additions.length) return additions;
  const reserved = additions.slice(0, 8);
  const ordinary = (Array.isArray(delta.hooks_add) ? delta.hooks_add : []).slice(0, Math.max(0, 8 - reserved.length));
  delta.hooks_add = [...ordinary, ...reserved];
  return additions;
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
      data.route = { ...(data.route || {}), input_mode: inputMode, adapter_version: 'demo-stable-v156' };
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
      materializeEventConsequencesStable(data.turn, data.pipeline, action);
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

    if (!isMeta) record.notices.push(...applyRuntimeStateStable(data, isContinue));

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
      ? `API ${h.version || '?'} 연결 준비됨 · ${h.luna} / ${h.terra}${h.qualityPipeline ? ' · Q3' : ''}${h.contextRouter ? ' · CR' : ''}${h.npcMotivation ? ' · MOT2' : ''}${h.sceneMomentum ? ' · MOM' : ''}${h.accessTokenRequired ? ' · 접속 토큰 필요' : ''}`
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
  if (first < 0) throw new Error(`V1.5.6 stable patch marker missing: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`V1.5.6 stable patch marker duplicated: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`V1.5.6 stable regex marker ${label}: expected 1, got ${matches.length}`);
  return source.replace(regex, replacement);
}

function showBootError(error, phase = 'patch') {
  const box = document.createElement('div');
  box.style.cssText = 'margin:16px;padding:14px;border:1px solid #ef4444;border-radius:12px;background:#2a1115;color:#fecaca;white-space:pre-wrap;font:12px/1.5 system-ui,sans-serif';
  box.textContent = `LUMENSIA V1.5.6 ${phase} 실패\n${error?.message || error}\nBase ${BASE_APP_SHA.slice(0, 10)}`;
  document.body.prepend(box);
}

async function boot() {
  let source;
  try {
    const response = await fetch(`/app.js?v=156-${BASE_APP_SHA.slice(0, 10)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`base app.js HTTP ${response.status}`);
    source = await response.text();

    source = replaceOnce(
      source,
      "import { ASSETS } from './assets.js';",
      `import { ASSETS } from '${location.origin}/assets.js?v=156';`,
      'ASSETS import'
    );
    source = replaceOnce(
      source,
      "import { migrateLegacyNpcKeys } from './save-migrations.js';",
      `import { migrateLegacyNpcKeys } from '${location.origin}/save-migrations.js?v=156';\nimport { explicitFutureDelayMinutes, materializeDelayedConsequences } from '${location.origin}/lib/event-consequence.js?v=156';`,
      'save migration import'
    );
    source = replaceOnce(
      source,
      "import { createFreeCharacterCreation, fateStartLabels, generateFateStartingCharacter, normalizeCharacterCreation } from './lib/fate-start.js';",
      `import { createFreeCharacterCreation, fateStartLabels, generateFateStartingCharacter, normalizeCharacterCreation } from '${location.origin}/lib/fate-start.js?v=156';`,
      'fate start import'
    );

    source = replaceRegexOnce(
      source,
      /const APP_VERSION = '1\.4\.(?:7|8)';/,
      "const APP_VERSION = '1.5.6';",
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

    source = replaceOnce(
      source,
      "  const skills = Object.entries(save.pc.skills || {}).map(([k,v]) => `${k} ${v.grade}`).join(' | ') || '-';\n  const stats = Object.entries(save.pc.stats || {}).map(([k,v]) => `- ${k}: ${v.grade} [${v.progress}/100]`).join('\\n');",
      "  const skills = Object.entries(save.pc.skills || {}).map(([k,v]) => `${k} ${v.grade}`).join(' | ') || '-';\n  const learning = Object.entries(save.pc.skillCandidates || {}).map(([k,v]) => `${k} ${Number(v?.progress || 0)}/100`).join(' | ') || '-';\n  const traits = Object.keys(save.pc.traits || {}).join(' | ') || '-';\n  const authorities = Object.keys(save.pc.authorities || {}).join(' | ') || '-';\n  const awakening = ['trait','authority'].flatMap((kind) => Object.entries(save.pc.awakeningCandidates?.[kind] || {}).map(([k,v]) => `${kind === 'authority' ? 'Authority' : 'Trait'} ${k} ${Number(v?.progress || 0)}/100 · M${Number(v?.milestones || 0)}/${kind === 'authority' ? 4 : 3}`)).join(' | ') || '-';\n  const stats = Object.entries(save.pc.stats || {}).map(([k,v]) => `- ${k}: ${v.grade} [${v.progress}/100]`).join('\\n');",
      'renderInfo skill candidates'
    );

    source = replaceOnce(
      source,
      '\\n스킬: ${skills}\\n---------\\n스탯:',
      '\\n스킬: ${skills}\\n학습 중: ${learning}\\nTrait: ${traits}\\nAuthority: ${authorities}\\n각성 중: ${awakening}\\n---------\\n스탯:',
      'renderInfo skill candidate line'
    );

    const helperSource = [
      `const AUTO_GESTURE_PX = ${AUTO_GESTURE_PX};`,
      `const FLOW_AUTO_ACTION_Stable = ${JSON.stringify(FLOW_AUTO_ACTION)};`,
      `const FLOW_CONTINUE_ACTION_Stable = ${JSON.stringify(FLOW_CONTINUE_ACTION)};`,
      latestWorldRecordStable.toString(),
      canAutoFlowStable.toString(),
      canContinueStable.toString(),
      suppressDuplicateFlowControlsStable.toString(),
      renderFlowControlsStable.toString(),
      installAutoFlowGestureStable.toString(),
      continuationSceneTailStable.toString(),
      mergeContinuationIntoRecentStable.toString(),
      accumulateUsageStable.toString(),
      zeroStateDeltaStable.toString(),
      compactStateStable.toString(),
      applySkillLearningRuntimeStable.toString(),
      applyAwakeningTalentRuntimeStable.toString(),
      applyNpcRelationshipDeltaStable.toString(),
      applyRuntimeStateStable.toString(),
      materializeEventConsequencesStable.toString(),
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
        "\\n\\n[QUALITY PIPELINE]\\nmode=${save.qualityTelemetry?.pipeline||'-'} / qa=${save.qualityTelemetry?.qa_result||'-'} / rewrite=${save.qualityTelemetry?.rewrite_applied?'Y':'N'} / bg=${save.qualityTelemetry?.background_sim?'Y':'N'} / goalV2=${save.qualityTelemetry?.npc_goal_v2?'Y':'N'}\\ninnerNPC=${Object.keys(save.npcInnerStates||{}).length} / beats=${(save.sceneRuntime?.remaining_beats||[]).length}\\n\\n[CONTEXT ROUTER]\\nprofile=${save.qualityTelemetry?.context_router?.profile||'-'} / status=${save.qualityTelemetry?.context_router?.budget_status||'-'} / scale=${save.qualityTelemetry?.context_router?.adaptive_scale??'-'}\\ntarget=${save.qualityTelemetry?.context_router?.target_input_tokens??'-'} / softMax=${save.qualityTelemetry?.context_router?.soft_max_tokens??'-'} / actual=${save.qualityTelemetry?.context_router?.actual_input_tokens??'-'}\\nchars=${save.qualityTelemetry?.context_router?.routed_chars??'-'} / original=${save.qualityTelemetry?.context_router?.original_chars??'-'} / cut=${Math.round(Number(save.qualityTelemetry?.context_router?.char_reduction_ratio||0)*100)}%\\nnpcs=${(save.qualityTelemetry?.context_router?.selected_npcs||[]).join(', ')||'-'}\\nworld=${(save.qualityTelemetry?.context_router?.canon_modules?.world||[]).join(' | ')||'-'}\\nnpcCanon=${(save.qualityTelemetry?.context_router?.canon_modules?.npc||[]).join(' | ')||'-'}\\nspeech=${(save.qualityTelemetry?.context_router?.canon_modules?.speech||[]).join(' | ')||'-'}\\n\\n[NPC GOAL V2]\\n${Object.entries(save.npcInnerStates||{}).filter(([k,v])=>v?.active_goal?.desire||save.npcStates?.[k]?.current_goal).slice(-10).map(([k,v])=>{const g=v?.active_goal||{};const delta=Number(g.last_progress_delta||0);return `- ${ASSETS.characters[k]?.name||k}: ${g.desire||save.npcStates?.[k]?.current_goal||'-'} [P${g.priority??'-'} U${g.urgency??'-'} ${g.state||'active'} ${g.progress??0}% Δ${delta>=0?'+':''}${delta}]${g.last_progress_reason?`\\n  reason=${g.last_progress_reason}`:''}${g.obstacle?`\\n  obstacle=${g.obstacle}`:''}${(g.next_actions||[])[0]?`\\n  next=${g.next_actions[0]}`:''}${(v.goal_history||[]).length?`\\n  history=${(v.goal_history||[]).slice(-3).map(h=>`${h.desire||h.id}:${h.final_state||'-'}:${h.final_progress??'-'}%`).join(' | ')}`:''}`;}).join('\\n')||'-'}\\n\\n[RECENT RELATIONSHIP REASONS]\\n${Object.entries(save.npcInnerStates||{}).filter(([,v])=>v?.relationship_reason?.cause||v?.relationship_reason?.followup).slice(-10).map(([k,v])=>{const r=v.relationship_reason||{};return `- ${ASSETS.characters[k]?.name||k} T${r.turn??'-'}: ${r.cause||'-'}${r.expression?`\\n  expression=${r.expression}`:''}${r.followup?`\\n  followup=${r.followup}`:''}`;}).join('\\n')||'-'}\\n\\n[EVENT DIRECTOR V2.1]\\nmode=${save.qualityTelemetry?.event_director_v2?.mode||'-'} / result=${save.qualityTelemetry?.event_director_v2?.result||'-'} / style=${save.qualityTelemetry?.event_director_v2?.event_style||'-'}\\nselected=${save.qualityTelemetry?.event_director_v2?.selected_key||'-'} / seed=${save.qualityTelemetry?.event_director_v2?.seed_tag||'-'} / cooldown=${save.qualityTelemetry?.event_director_v2?.cooldown_turns??'-'}\\nroll=${save.qualityTelemetry?.event_director_v2?.roll??'-'} / noneWeight=${save.qualityTelemetry?.event_director_v2?.none_weight??'-'} / eligible=${(save.qualityTelemetry?.event_director_v2?.eligible_keys||[]).join(', ')||'-'}\\ngoal=${save.qualityTelemetry?.event_director_v2?.selected_goal?.desire||'-'} / goalMul=${save.qualityTelemetry?.event_director_v2?.selected_goal?.multiplier??'-'}\\n\\n[COUNTS]\\ntimeline ${save.timeline.length}"
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
