export const WORLD_RESULT_SURFACING_VERSION = '1';

const MAX_ATTEMPTS = 2;
const MAX_RECENT_CHECKPOINTS = 6;
const COMPLETION_RE = /(?:종료(?:됐|된|했|한|되었|되었다|됐음|가\s*(?:확인|공개|확정|공지)|를\s*(?:확인|공개|확정|공지)|\s*(?:확정|공지|소식))|끝났|끝난|마쳤|마치고|마무리(?:됐|된)|해산(?:했|한|됐|된)|완료(?:됐|된|했|한|되었|되었다|됐음|가\s*(?:확인|공개|확정|공지)|를\s*(?:확인|공개|확정|공지)|\s*(?:확정|공지|소식)))/i;
const NEGATED_COMPLETION_RE = /(?:종료|완료)(?:되|하)?지\s*않|끝나지\s*않|마치지\s*못|아직\s*(?:종료|완료|끝|마치)/i;
const RETURN_RE = /(?:돌아왔|돌아온|복귀했|복귀한|귀환했|귀환한)/i;
const PUBLIC_CHANNEL_RE = /(?:공지|게시|벽보|소문|전해|알려|방송|호외)/i;
const GENERIC_TITLE_TERMS = new Set(['일정', '행사', '공개', '정규', '오전', '오후', '오늘', '이번']);

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clampText(value, max = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}
function safeNpcKey(value) {
  const key = String(value || '').trim();
  return /^[a-z0-9_-]{1,80}$/i.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key) ? key : '';
}
function hash32(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
function validDateTime(date, time) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!dateMatch || !timeMatch) return false;
  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return false;
  const stamp = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return stamp.getUTCFullYear() === year && stamp.getUTCMonth() === month - 1 && stamp.getUTCDate() === day
    && stamp.getUTCHours() === hour && stamp.getUTCMinutes() === minute;
}
function dateTimeMinutes(date, time) {
  if (!validDateTime(date, time)) return null;
  const [year, month, day] = String(date).split('-').map(Number);
  const [hour, minute] = String(time).split(':').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute) / 60000);
}
function titleTerms(title) {
  return [...new Set(String(title || '').toLowerCase().split(/[^\p{L}\p{N}_-]+/u)
    .map((term) => term.trim()).filter((term) => term.length >= 2 && !GENERIC_TITLE_TERMS.has(term)))].slice(0, 8);
}
function titleMatches(text, title) {
  const normalized = String(text || '').toLowerCase();
  const terms = titleTerms(title);
  if (!terms.length) return false;
  const matched = terms.filter((term) => normalized.includes(term)).length;
  return matched >= Math.min(2, terms.length);
}
function checkpoint(value = {}) {
  const row = object(value);
  const fingerprint = clampText(row.fingerprint || row.world_result_fingerprint || '', 24).toLowerCase();
  if (!/^[a-f0-9]{8}$/.test(fingerprint)) return null;
  return {
    version: WORLD_RESULT_SURFACING_VERSION,
    fingerprint,
    world_result_id: clampText(row.world_result_id || '', 100) || null,
    source_at: clampText(row.source_at || '', 24),
    title: clampText(row.title || '', 120),
    fact: clampText(row.fact || '', 160),
    npc_keys: [...new Set(array(row.npc_keys).map(safeNpcKey).filter(Boolean))].slice(0, 2),
    npc_names: [...new Set(array(row.npc_names).map((name) => clampText(name, 60)).filter(Boolean))].slice(0, 2),
    selected_turn: Math.max(0, Math.trunc(Number(row.selected_turn || 0))),
    attempts: Math.max(1, Math.min(MAX_ATTEMPTS, Math.trunc(Number(row.attempts || row.attempt || 1)))),
    manifested: Boolean(row.manifested),
    channel: clampText(row.channel || '', 40) || null,
  };
}
function recentCheckpoints(value = {}) {
  const source = object(value);
  const seen = new Set();
  const rows = [];
  for (const candidate of [source, ...array(source.recent)]) {
    const row = checkpoint(candidate);
    if (!row || seen.has(row.fingerprint)) continue;
    seen.add(row.fingerprint);
    rows.push(row);
  }
  return rows.sort((left, right) => right.selected_turn - left.selected_turn).slice(0, MAX_RECENT_CHECKPOINTS);
}

export function parsePublicWorldResults(backgroundDigest = '', { knownNpcKeys = [] } = {}) {
  const known = new Set(array(knownNpcKeys).map(safeNpcKey).filter(Boolean));
  if (!known.size) return [];
  const rows = [];
  const seen = new Set();
  const pattern = /^\[OFFSCREEN (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\] ([a-z0-9_-]{1,80}(?:,\s*[a-z0-9_-]{1,80})*): (.+?) 종료 확정$/i;
  for (const rawLine of String(backgroundDigest || '').slice(-1800).split(/\r?\n/)) {
    const match = pattern.exec(rawLine.trim());
    if (!match || !validDateTime(match[1], match[2])) continue;
    const rawNpcKeys = match[3].split(',').map((key) => key.trim());
    const safeNpcKeys = rawNpcKeys.map(safeNpcKey);
    const npcKeys = [...new Set(safeNpcKeys)];
    if (safeNpcKeys.some((key) => !key) || !npcKeys.length || npcKeys.length > 2 || npcKeys.some((key) => !known.has(key))) continue;
    const title = clampText(match[4], 120);
    if (!title || !/^[\p{L}\p{N}\s·()'’".,:_-]{1,120}$/u.test(title)) continue;
    const identity = `${match[1]}|${match[2]}|${npcKeys.join(',')}|${title.toLowerCase()}`;
    const fingerprint = hash32(identity).toString(16).padStart(8, '0');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    rows.push({
      version: WORLD_RESULT_SURFACING_VERSION,
      fingerprint,
      world_result_id: `world-result:${match[1]}t${match[2].replace(':', '')}:${fingerprint}`.toLowerCase(),
      source_at: `${match[1]} ${match[2]}`,
      npc_keys: npcKeys,
      title,
      fact: clampText(`${title} 일정 종료가 공개적으로 확인됨`, 160),
    });
  }
  return rows.slice(-8);
}

export function selectWorldResultForSurfacing({ saveState = {}, knownNpcKeys = [], enabled = true } = {}) {
  if (!enabled) return { selected: null, reason: 'disabled' };
  const rows = parsePublicWorldResults(saveState?.backgroundDigest, { knownNpcKeys });
  if (!rows.length) return { selected: null, reason: 'no-public-result' };
  const selected = rows.at(-1);
  const now = dateTimeMinutes(saveState?.world?.date, saveState?.world?.time);
  const [sourceDate, sourceTime] = String(selected.source_at || '').split(' ');
  const source = dateTimeMinutes(sourceDate, sourceTime);
  if (now == null || source == null) return { selected: null, reason: 'invalid-clock', fingerprint: selected.fingerprint };
  if (source > now) return { selected: null, reason: 'future-result', fingerprint: selected.fingerprint };
  const previous = recentCheckpoints(saveState?.sceneRuntime?.world_result_surface)
    .find((row) => row.fingerprint === selected.fingerprint);
  if (previous?.manifested) return { selected: null, reason: 'already-surfaced', fingerprint: selected.fingerprint };
  if (Number(previous?.attempts || 0) >= MAX_ATTEMPTS) return { selected: null, reason: 'retry-exhausted', fingerprint: selected.fingerprint };
  return { selected: { ...selected, attempt: Number(previous?.attempts || 0) + 1 }, reason: previous ? 'retry' : 'new-result' };
}

export function buildWorldResultSurfacingDirective(result = {}, registry = {}) {
  const row = object(result);
  const npcKeys = array(row.npc_keys).map(safeNpcKey).filter(Boolean).slice(0, 2);
  const npcNames = npcKeys.map((key) => clampText(registry?.[key] || key, 60));
  return [
    '[EVENT DIRECTOR V3 — PUBLIC WORLD RESULT SURFACING]',
    'MODE=world-result',
    'RESULT=WORLD_RESULT_SURFACE',
    'ORDER=USER_ACTION_FIRST',
    'GUARDS=ONE_TRACE|NO_OUTCOME_INVENTION|NO_META_LOG|NO_TELEPORT|NO_PC_KNOWLEDGE|NO_PC_CONTROL',
    `PUBLIC_FACT=${clampText(row.fact || '', 160)}`,
    `WORLD_RESULT_ID=${clampText(row.world_result_id || '', 100)}`,
    `SOURCE_AT=${clampText(row.source_at || '', 24)}`,
    `NPC_KEYS=${npcKeys.join('|') || '-'}`,
    `NPC_NAMES=${npcNames.join('|') || '-'}`,
    `ATTEMPT=${Math.max(1, Math.min(MAX_ATTEMPTS, Number(row.attempt || 1)))}/${MAX_ATTEMPTS}`,
    '- USER ACTION을 의미 목표까지 먼저 완료한 뒤, 물리적·인과적으로 이어질 때만 이 공개 결과의 흔적을 정확히 한 번 전달한다.',
    '- 전달 경로는 돌아온 NPC, 공개 공지, 출처가 드러난 소문, 직접 관찰 가능한 여파 중 하나만 사용한다.',
    '- 확인된 사실은 PUBLIC_FACT뿐이다. 성공/실패의 세부 결과, 보상, 부상, 비밀 원인, 관계 변화, PC의 사전 지식을 발명하지 마라.',
    '- [OFFSCREEN] 로그나 내부 메타데이터를 서술에 노출하지 말고, 실제 장면에서 전달되기 전에는 PC가 이미 안다고 쓰지 마라.',
    '- 위치·일정상 자연스럽지 않으면 NPC를 순간이동시키거나 억지 소문을 만들지 말고 이 비트를 생략한다.',
    '- PC의 행동·대사·감정·중요 선택을 대신 결정하지 말고, 첫 실제 판단점에서 멈춘다.',
  ].join('\n');
}

export function worldResultSurfaceEvidence(turn = {}, result = {}) {
  const row = object(result);
  const npcKeys = new Set(array(row.npc_keys).map(safeNpcKey).filter(Boolean));
  const npcNames = array(row.npc_names).map((name) => clampText(name, 60).toLowerCase()).filter(Boolean);
  const segments = [
    { kind: 'scene-title', text: turn?.scene_title },
    ...array(turn?.scene).map((item) => ({ kind: 'scene', text: item?.text, speaker_key: safeNpcKey(item?.speaker_key || item?.speakerKey) })),
    ...array(turn?.state_delta?.pc_knowledge_add).map((text) => ({ kind: 'knowledge', text })),
    ...array(turn?.state_delta?.memories_add).map((item) => ({ kind: 'memory', text: item?.fact })),
  ];
  for (const segment of segments) {
    const text = clampText(segment.text || '', 500);
    if (!text || !titleMatches(text, row.title)) continue;
    if (NEGATED_COMPLETION_RE.test(text)) continue;
    const selectedSpeaker = Boolean(segment.speaker_key && npcKeys.has(segment.speaker_key));
    const completed = COMPLETION_RE.test(text);
    const selectedNameVisible = npcNames.some((name) => text.toLowerCase().includes(name));
    const returned = RETURN_RE.test(text) && (selectedSpeaker || selectedNameVisible);
    if (!completed && !returned) continue;
    const channel = selectedSpeaker
      ? 'npc-report'
      : PUBLIC_CHANNEL_RE.test(text)
        ? 'public-trace'
        : RETURN_RE.test(text)
          ? 'returning-npc'
          : ['knowledge', 'memory'].includes(segment.kind)
            ? 'recorded-knowledge'
            : 'visible-aftermath';
    return { manifested: true, channel };
  }
  return { manifested: false, channel: null };
}

export function deriveWorldResultSurfaceState({ previousRuntime = {}, directorTelemetry = null, turn = {}, turnNumber = 0 } = {}) {
  const previous = object(previousRuntime?.world_result_surface);
  const telemetry = object(directorTelemetry);
  if (String(telemetry.result || '') !== 'WORLD_RESULT_SURFACE') return Object.keys(previous).length ? previous : null;
  const fingerprint = clampText(telemetry.world_result_fingerprint || '', 24).toLowerCase();
  if (!/^[a-f0-9]{8}$/.test(fingerprint)) return Object.keys(previous).length ? previous : null;
  const npcKeys = array(telemetry.world_result_npc_keys).map(safeNpcKey).filter(Boolean).slice(0, 2);
  const result = {
    fingerprint,
    title: clampText(telemetry.world_result_title || '', 120),
    npc_keys: npcKeys,
    npc_names: array(telemetry.world_result_npc_names).map((name) => clampText(name, 60)).filter(Boolean).slice(0, 2),
  };
  const evidence = worldResultSurfaceEvidence(turn, result);
  const priorSame = recentCheckpoints(previous).find((row) => row.fingerprint === fingerprint);
  const current = checkpoint({
    fingerprint,
    world_result_id: telemetry.world_result_id,
    source_at: telemetry.world_result_source_at,
    title: result.title,
    fact: telemetry.world_result_fact,
    npc_keys: npcKeys,
    npc_names: result.npc_names,
    selected_turn: Math.max(0, Math.trunc(Number(turnNumber || 0))),
    attempts: Math.min(MAX_ATTEMPTS, Number(priorSame?.attempts || 0) + 1),
    manifested: evidence.manifested,
    channel: evidence.channel,
  });
  if (!current) return Object.keys(previous).length ? previous : null;
  const recent = [current, ...recentCheckpoints(previous).filter((row) => row.fingerprint !== fingerprint)].slice(0, MAX_RECENT_CHECKPOINTS);
  return { ...current, recent };
}
