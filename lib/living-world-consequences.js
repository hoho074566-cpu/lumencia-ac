// P2-PR07 Living World + Consequences.
// Read-only semantic orchestration over existing world, NPC, thread, memory, and consequence roots.

import { normalizeEventConsequenceHook } from './event-consequence.js';

export const LIVING_WORLD_CONSEQUENCES_VERSION = '1.0';

const TERMINAL = new Set(['completed', 'cancelled', 'resolved', 'expired', 'declined', 'failed', 'abandoned']);
const SETUP_TYPES = new Set(['fact', 'observer', 'rumor', 'promise', 'event', 'obligation', 'relationship', 'deferred_hook']);

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function clean(value, max = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
function key(value) {
  const out = String(value || '').trim();
  return /^[a-z0-9_-]{1,80}$/i.test(out) && !['__proto__', 'prototype', 'constructor'].includes(out) ? out : '';
}
function bounded(value, min, max, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function unique(values, limit = 8) { return [...new Set(array(values).map(key).filter(Boolean))].slice(0, limit); }
function terminal(value) { return TERMINAL.has(String(value || '').toLowerCase()); }

function compactGoal(raw = {}) {
  const goal = object(raw);
  if (!goal.desire || terminal(goal.state)) return null;
  return {
    desire: clean(goal.desire, 130),
    state: clean(goal.state || 'active', 24),
    target_type: clean(goal.target_type, 24) || null,
    target_key: clean(goal.target_key, 70) || null,
    priority: Math.trunc(bounded(goal.priority, 0, 10)),
    urgency: Math.trunc(bounded(goal.urgency, 0, 10)),
    obstacle: clean(goal.obstacle, 100) || null,
    next: clean(array(goal.next_actions)[0], 110) || null,
  };
}

function mentions(text, npcKey, name) {
  const source = String(text || '').toLowerCase();
  return source.includes(String(npcKey).toLowerCase()) || (name && source.includes(String(name).toLowerCase()));
}

function factionWitnessKeys(saveState = {}) {
  const rows = Object.values(object(saveState?.sceneRuntime?.faction_social?.reputations));
  return new Set(rows.flatMap((row) => array(row?.history).slice(-2).flatMap((entry) => array(entry?.observer_npc_keys))).map(key).filter(Boolean));
}

function eventParticipantKeys(saveState = {}) {
  return new Set([
    ...array(saveState?.scheduleContext?.due),
    ...array(saveState?.scheduleContext?.upcoming).slice(0, 4),
  ].flatMap((row) => array(row?.participants)).map(key).filter(Boolean));
}

function rankNpcKeys({ saveState, candidateKeys, registry, activeThreads, present }) {
  const candidates = new Set(unique(candidateKeys, 12));
  const eventParticipants = eventParticipantKeys(saveState);
  const factionWitnesses = factionWitnessKeys(saveState);
  const threadText = array(activeThreads).map((row) => `${row?.id || ''} ${row?.title || ''}`).join(' ');
  return Object.keys(object(registry)).map((npcKey) => {
    const reasons = [];
    let score = 0;
    if (present.has(npcKey)) { score += 120; reasons.push('present'); }
    if (array(activeThreads).some((thread) => mentions(`${thread?.id || ''} ${thread?.title || ''}`, npcKey, registry[npcKey]))) { score += 90; reasons.push('active-thread'); }
    if (eventParticipants.has(npcKey)) { score += 75; reasons.push('current-event'); }
    if (factionWitnesses.has(npcKey)) { score += 60; reasons.push('faction-witness'); }
    const goal = compactGoal(saveState?.npcInnerStates?.[npcKey]?.active_goal);
    if (goal) { score += 35 + goal.priority + goal.urgency; reasons.push('active-goal'); }
    const relationship = object(saveState?.relationships?.[npcKey]);
    const relationWeight = Math.abs(Number(relationship.affinity || 0)) + Math.abs(Number(relationship.trust || 0));
    if (relationWeight >= 20) { score += 30 + Math.min(20, relationWeight / 5); reasons.push('major-pc-relation'); }
    if (candidates.has(npcKey)) { score += 25; reasons.push('routed-relevance'); }
    if (!score && mentions(threadText, npcKey, registry[npcKey])) { score += 20; reasons.push('thread-mention'); }
    return { key:npcKey, score, reasons:[...new Set(reasons)], goal };
  }).filter((row) => row.score > 0).sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
}

function compactDirectionalLink(saveState, source, target) {
  const row = object(saveState?.npcInnerStates?.[source]?.npc_relationships?.[target]);
  if (!Object.keys(row).length) return null;
  return {
    affinity: Math.trunc(bounded(row.affinity, -100, 100)),
    trust: Math.trunc(bounded(row.trust, -100, 100)),
    status: clean(row.status || '중립', 50),
    reason: clean(row.reason, 100) || null,
  };
}

function presentPairs(saveState, presentKeys) {
  const rows = [];
  for (let left = 0; left < presentKeys.length; left += 1) {
    for (let right = left + 1; right < presentKeys.length; right += 1) {
      const a = presentKeys[left], b = presentKeys[right];
      rows.push({ a, b, a_to_b:compactDirectionalLink(saveState, a, b), b_to_a:compactDirectionalLink(saveState, b, a) });
    }
  }
  return rows.slice(0, 6);
}

function setupAnchors(saveState = {}, limit = 5, allowSecrets = false) {
  const rows = [];
  for (const hook of array(saveState?.hooks)) {
    if (!hook?.id || terminal(hook.status) || normalizeEventConsequenceHook(hook)) continue;
    const title = clean(hook.title || hook.note, 130);
    if (!title) continue;
    rows.push({
      id:clean(hook.id, 80), kind:'hook', status:clean(hook.status || 'open', 24),
      fact:title, importance:Math.trunc(bounded(hook.importance, 1, 5, 2)), turn:Math.max(0, Math.trunc(Number(hook.createdTurn || 0))),
    });
  }
  for (const memory of array(saveState?.memories?.global)) {
    const type = String(memory?.type || 'fact').toLowerCase();
    const fact = clean(memory?.fact, 150);
    if (!fact || !SETUP_TYPES.has(type) || terminal(memory.status) || (!allowSecrets && Number(memory?.secret_level || 0) >= 3)) continue;
    rows.push({
      id:clean(memory.id, 80) || null, kind:type, status:clean(memory.status || 'active', 24), fact,
      importance:Math.trunc(bounded(memory.importance, 1, 5, 1)), turn:Math.max(0, Math.trunc(Number(memory.turn || 0))),
      source:clean(memory.source, 90) || null,
    });
  }
  return rows.sort((left, right) => right.importance - left.importance || right.turn - left.turn || left.fact.localeCompare(right.fact)).slice(0, Math.max(1, Math.min(6, limit)));
}

function compactFactionRows(saveState = {}) {
  return Object.entries(object(saveState?.sceneRuntime?.faction_social?.reputations)).map(([factionKey, raw]) => {
    const row = object(raw), latest = array(row.history).at(-1);
    return {
      key:clean(factionKey, 60), reputation:Math.trunc(bounded(row.reputation, -100, 100)), stance:clean(row.stance || '중립', 60),
      updated_turn:Math.max(0, Math.trunc(Number(row.updated_turn || 0))), latest_cause:clean(latest?.reason || row.reason, 120) || null,
    };
  }).sort((left, right) => right.updated_turn - left.updated_turn || Math.abs(right.reputation) - Math.abs(left.reputation) || left.key.localeCompare(right.key)).slice(0, 3);
}

function compactConsequences(saveState = {}) {
  return array(saveState?.hooks).map(normalizeEventConsequenceHook).filter((row) => row && !terminal(row.status)).sort((left, right) => String(left.due_at).localeCompare(String(right.due_at))).slice(0, 3).map((row) => ({
    id:row.id, event:clean(row.event_name, 120), status:row.status, due_at:row.due_at, expires_at:row.expires_at,
    target:clean(row.target_bucket, 50), visibility:Number(row.secret_level || 0) >= 3 ? 'hidden-cause' : 'observable-cause',
  }));
}

export function compactLivingWorldContext({
  saveState = {}, candidateKeys = [], registry = {}, activeThreads = [], mode = 'game', maxNpcs = 4, allowSecrets = false,
} = {}) {
  const frozen = mode === 'meta' || mode === 'continue';
  if (frozen) return {
    version:LIVING_WORLD_CONSEQUENCES_VERSION, mode:'freeze', present_npcs:[], interaction_pairs:[], goal_rows:[], offscreen_priority:[], setup_anchors:[], factions:[], pending_consequences:[], active_threads:[],
  };
  const registered = object(registry);
  const present = new Set(unique(saveState?.sceneRuntime?.participants, 8).filter((npcKey) => Object.hasOwn(registered, npcKey)));
  const ranked = rankNpcKeys({ saveState, candidateKeys, registry:registered, activeThreads, present });
  const cap = Math.max(1, Math.min(6, Math.trunc(Number(maxNpcs) || 4)));
  const presentKeys = [...present].slice(0, cap);
  const relevant = ranked.slice(0, Math.max(cap, 6));
  const goalRows = relevant.filter((row) => row.goal).slice(0, 5).map((row) => ({ npc_key:row.key, present:present.has(row.key), goal:row.goal }));
  const offscreen = relevant.filter((row) => !present.has(row.key)).slice(0, cap).map((row) => ({
    npc_key:row.key, name:clean(registered[row.key], 60), reasons:row.reasons,
    last_known:Object.keys(object(saveState?.npcStates?.[row.key])).length ? {
      location:clean(saveState.npcStates[row.key].location, 90) || null,
      status:clean(saveState.npcStates[row.key].status, 110) || null,
    } : null,
    goal:row.goal,
  }));
  const threads = array(activeThreads).slice(0, 6).map((row) => ({ id:clean(row.id, 80), kind:clean(row.kind, 40), status:clean(row.status, 30), title:clean(row.title, 110), background:Boolean(row.background) }));
  const context = {
    version:LIVING_WORLD_CONSEQUENCES_VERSION,
    mode:'semantic',
    present_npcs:presentKeys.map((npcKey) => ({ npc_key:npcKey, name:clean(registered[npcKey], 60) })),
    interaction_pairs:presentPairs(saveState, presentKeys),
    goal_rows:goalRows,
    offscreen_priority:offscreen,
    setup_anchors:setupAnchors(saveState, 5, allowSecrets),
    factions:compactFactionRows(saveState),
    pending_consequences:compactConsequences(saveState),
    active_threads:threads,
    public_world_trace:clean(String(saveState?.backgroundDigest || '').slice(-260), 260) || null,
  };
  const meaningful = context.present_npcs.length >= 2 || context.goal_rows.length > 0 || context.offscreen_priority.length > 0
    || context.setup_anchors.length > 0 || context.factions.length > 0 || context.pending_consequences.length > 0 || Boolean(context.public_world_trace);
  if (!meaningful) context.mode = 'guard-only';
  return context;
}

function rules() {
  return `SCENE PRESENCE: present_npcs의 NPC는 명시적 퇴장·권위 있는 위치 변경 전까지 장면에 남는다. 같은 장면에서는 NPC↔PC뿐 아니라 NPC↔NPC의 말·행동·침묵·갈등도 허용한다. 단순 동석만으로 관계나 기억을 바꾸지 않는다.
GOAL CONFLICT: goal_rows의 의미·목표·대상·장애가 실제로 충돌하는지는 AI가 판단한다. 가능성만으로 사건을 확정하지 말고, 현재 장면에서 충돌이 구체화되거나 인과적인 미래 압력이 생겼을 때만 기존 active_events_add/hooks_add/delayed_consequences_add 중 필요한 하나를 최대 한 건 사용한다.
OFF-SCREEN: offscreen_priority만 우선 검토하고 기존 일정·Active Thread·공개 world trace로 확인되는 변화만 이어간다. 모든 NPC를 전면 시뮬레이션하거나 결과·비밀·순간이동·전지적 지식을 발명하지 않는다. 돌아온 NPC의 변화는 기존 npcStates/backgroundDigest/기억과 모순되지 않는 행동으로 보여준다.
CONSEQUENCE: 공개적이고 큰 행동은 Action→실제 Witness/공식 기록→개별 Reaction→출처 있는 Rumor→등록 Faction의 서로 다른 해석→Reputation→필요한 Future Event 순으로만 전파한다. severity·visibility·duration·decay·affected NPC/faction 범위를 의미적으로 먼저 판단하고, 실제 변화만 기존 memories_add/faction_reputation_changes/delayed_consequences_add에 기록한다. 목격자 없는 사적 행동을 퍼뜨리거나 개인 관계를 자동 연동하지 않는다.
SETUP/PAYOFF: setup_anchors는 읽기 전용 과거 사실·말·약속·물건·장소·관계·선택이다. 현재 사건과 실제 인과가 있을 때 최대 하나를 자연스럽게 재사용하되, 목록에 있다는 이유만으로 hook을 해결·삭제·보상하지 않는다. PR #66의 별도 lifecycle을 재현하지 않는다.
FAIL FORWARD: 실패는 같은 입력 재시도 요구로 되돌리지 말고 부상·노출·비용·관계 변화·새 단서·미해결 압력 중 근거 있는 새 Story State로 연결한다. 성공·관계·평판·보상을 자동 지급하지 않는다.
새 save root, 모든 NPC full simulation, generic quest lifecycle, universal event sourcing engine, 추가 model call을 만들지 않는다.`;
}

export function buildLivingWorldDirective({ context = null, maxChars = 3600 } = {}) {
  const source = object(context);
  if (source.mode !== 'semantic') return '';
  const compact = JSON.parse(JSON.stringify(source));
  const render = () => `[P2-PR07 LIVING WORLD + CONSEQUENCES V${LIVING_WORLD_CONSEQUENCES_VERSION}]\nWORLD_CONTEXT=${JSON.stringify(compact)}\n${rules()}`;
  let out = render();
  const shrink = ['setup_anchors', 'offscreen_priority', 'goal_rows', 'interaction_pairs', 'active_threads', 'factions', 'pending_consequences'];
  while (out.length > maxChars && shrink.some((field) => array(compact[field]).length > 1)) {
    const field = shrink.slice().sort((left, right) => array(compact[right]).length - array(compact[left]).length)[0];
    if (array(compact[field]).length > 1) compact[field].pop();
    out = render();
  }
  if (out.length <= maxChars) return out;
  const minimal = {
    version:compact.version, mode:compact.mode, present_npcs:array(compact.present_npcs), goal_rows:array(compact.goal_rows).slice(0, 2),
    offscreen_priority:array(compact.offscreen_priority).slice(0, 2), setup_anchors:array(compact.setup_anchors).slice(0, 2),
    factions:array(compact.factions).slice(0, 2), pending_consequences:array(compact.pending_consequences).slice(0, 2),
  };
  return `[P2-PR07 LIVING WORLD + CONSEQUENCES V${LIVING_WORLD_CONSEQUENCES_VERSION}]\nWORLD_CONTEXT=${JSON.stringify(minimal)}\n${rules()}`;
}
