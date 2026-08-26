// Lumensia Time Plan Parser Phase 1.
// Shadow-only structured parsing: no schedule, consequence, state, narration, or stop mutation.

export const TIME_PLAN_PARSER_VERSION = '1.0-shadow';

const NUMBER_WORDS = Object.freeze({
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9,
  열: 10, 열한: 11, 열두: 12, 스물: 20, 서른: 30, 마흔: 40, 쉰: 50,
});
const NUMBER_PATTERN = String.raw`(?:\d+(?:\.\d+)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열(?:한|두)?|스물|서른|마흔|쉰)`;
const DURATION_PATTERN = new RegExp(`(?<number>${NUMBER_PATTERN})\\s*(?<unit>년|개월|달|주일|주|일|시간|분)`, 'gu');

const ACTION_DEFINITIONS = Object.freeze([
  {
    type: 'travel',
    pattern: /(?<destination>[A-Za-z가-힣0-9]+)(?:으로|로|에)\s*(?:간다|가자|가겠다|갈게|가서|가고|이동한다|이동하자|이동하고|향한다|향하자|향하고|도착한다|도착하고)/gu,
  },
  {
    type: 'training',
    pattern: /(?:훈련|연습|수련|단련)(?:을|를)?\s*(?:한다|하자|하겠다|할게|하고|한\s*(?:뒤|후)|시작한다|계속한다|마친다|했다|할까|할지)/gu,
  },
  {
    type: 'class-attendance',
    pattern: /(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:을|를|에)?\s*(?:듣는다|듣자|듣고|참석한다|참석하자|참석하고|참여한다|참여하자|참여하고|수강한다|수강하자|수강하고|받는다|받자|받고|시작한다|계속한다|마친다|할까|할지)/gu,
  },
  {
    type: 'sleep',
    pattern: /(?:(?:잠|수면)(?:을|를)?\s*)?(?:잔다|자자|자고|자겠다|잘게|잔\s*(?:뒤|후)|수면한다|수면하자|수면하고|잘까|잘지)/gu,
  },
  {
    type: 'meal',
    pattern: /(?:아침|점심|저녁|밥|식사|만찬)(?:을|를)?\s*(?:먹는다|먹자|먹고|먹겠다|먹을게|한다|하자|하고|마친다|할까|할지)/gu,
  },
  {
    type: 'dialogue',
    pattern: /(?:대화|이야기|상담|논의|면담|회의|브리핑|협상)(?:을|를)?\s*(?:한다|하자|하고|하겠다|할게|시작한다|계속한다|마친다|할까|할지)/gu,
  },
  {
    type: 'wait',
    pattern: /(?:기다린다|기다리자|기다리고|기다리겠다|기다릴게|대기한다|대기하자|대기하고|대기하겠다|기다릴까|기다릴지)/gu,
  },
  {
    type: 'rest',
    pattern: /(?:쉰다|쉬자|쉬고|쉬겠다|쉴게|휴식한다|휴식하자|휴식하고|휴식하겠다|쉴까|쉴지)/gu,
  },
]);

const DEFAULT_DURATION = Object.freeze({
  training: [30, 120],
  'class-attendance': [45, 120],
  sleep: [240, 480],
  meal: [20, 45],
  dialogue: [2, 10],
  wait: [10, 60],
  rest: [30, 240],
});

const SUBJECT_STOP_WORDS = new Set([
  '오늘', '내일', '모레', '어제', '그제', '그저께', '지금', '현재', '이번', '다음',
  '시간', '분', '수업', '훈련', '식사', '대화', '잠', '휴식', '대기',
]);

function numberValue(value = '') {
  const text = String(value || '').trim();
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, text)) return NUMBER_WORDS[text];
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function unitMinutes(amount, unit) {
  const multipliers = { 년: 525600, 개월: 43200, 달: 43200, 주일: 10080, 주: 10080, 일: 1440, 시간: 60, 분: 1 };
  return Number.isFinite(amount) && multipliers[unit] ? Math.round(amount * multipliers[unit]) : null;
}

function clockValue(value = '') {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

function quoteRanges(text = '') {
  const source = String(text || ''), ranges = [];
  for (const pattern of [/"[^"\n]*"/gu, /“[^”\n]*”/gu, /'[^'\n]*'/gu, /‘[^’\n]*’/gu]) {
    for (const match of source.matchAll(pattern)) ranges.push([match.index ?? -1, (match.index ?? -1) + match[0].length]);
  }
  return ranges;
}

function actionMatches(text = '') {
  const source = String(text || ''), matches = [];
  ACTION_DEFINITIONS.forEach((definition, priority) => {
    const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);
    for (const match of source.matchAll(pattern)) {
      matches.push({
        type: definition.type,
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        text: match[0],
        destination: match.groups?.destination || null,
        priority,
      });
    }
  });
  matches.sort((left, right) => left.index - right.index || left.priority - right.priority || right.end - left.end);
  const selected = [];
  for (const candidate of matches) {
    const overlap = selected.findIndex((row) => candidate.index < row.end && candidate.end > row.index);
    if (overlap < 0) selected.push(candidate);
    else if (candidate.priority < selected[overlap].priority) selected[overlap] = candidate;
  }
  return selected.sort((left, right) => left.index - right.index);
}

function splitClauses(text = '') {
  const source = String(text || ''), anchors = actionMatches(source);
  if (!anchors.length) return [{ source: source.trim(), start: 0, end: source.length, anchor: null }];
  const clauses = [];
  let cursor = 0;
  anchors.forEach((anchor, index) => {
    const end = index === anchors.length - 1 ? source.length : anchor.end;
    clauses.push({ source: source.slice(cursor, end).trim(), start: cursor, end, anchor });
    cursor = anchor.end;
  });
  return clauses.filter((clause) => clause.source);
}

function explicitActor(clause = '', actorName = '') {
  const text = String(clause || '');
  const firstPerson = [...text.matchAll(/(?:^|[\s,"'“‘])(?<name>나는|난|내가|PC|Aaa)(?:가|이|은|는)?(?=\s|$)/giu)].at(-1);
  if (firstPerson) return { kind: 'pc', name: String(actorName || 'PC'), explicit: true };
  const canonical = String(actorName || '').trim();
  if (canonical && new RegExp(`(?:^|[\\s,"'“‘])${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:가|이|은|는|께서)(?=\\s|$)`, 'u').test(text)) {
    return { kind: 'pc', name: canonical, explicit: true };
  }
  const subjects = [...text.matchAll(/(?:^|[\s,"'“‘])(?<name>[A-Za-z가-힣0-9_:]{1,32})(?:가|이|은|는|께서)(?=\s|$)/gu)]
    .map((match) => String(match.groups?.name || '').trim())
    .filter((name) => name && !SUBJECT_STOP_WORDS.has(name));
  const name = subjects.at(-1);
  return name ? { kind: 'npc', name, explicit: true } : null;
}

function isHypothetical(text = '') {
  return /(?:만약|가정|하고\s*싶|하려면|한다면|했다면|했으면|할까|할지|해야\s*할지|예정|계획|고민|망설|[?？]\s*$)/u.test(String(text || ''));
}

function durationCandidates(text = '') {
  const source = String(text || ''), rows = [];
  for (const match of source.matchAll(new RegExp(DURATION_PATTERN.source, DURATION_PATTERN.flags))) {
    const amount = numberValue(match.groups?.number), unit = match.groups?.unit, minutes = unitMinutes(amount, unit), index = match.index ?? 0, end = index + match[0].length;
    if (minutes == null) continue;
    const suffix = source.slice(end, end + 12);
    if (/^\s*(?:전(?:에)?|이전|후(?:에)?|뒤(?:에)?|이후(?:에)?|마다|간격(?:으로)?|씩)/u.test(suffix)) continue;
    rows.push({ raw: match[0], index, end, minutes });
  }
  return rows;
}

function travelDuration(destination = '', location = '') {
  const target = String(destination || '').trim(), from = String(location || '').trim();
  if (/(?:왕도|수도|도시|마을|항구|영지|국경|산맥|숲|유적|던전|외곽)/u.test(target)) return { min_minutes: 15, max_minutes: 60, profile: 'regional' };
  if (/(?:기숙사|도서관|학생회관|강의동|기사과|마법과|신학부|연금술과|식당|중앙광장|운동장|정문|교정)/u.test(target)) return { min_minutes: 5, max_minutes: 20, profile: 'campus' };
  const fromAnchor = from.match(/(?:[A-Za-z가-힣0-9]+동|기숙사|도서관|학생회관|강의동)/u)?.[0];
  if (fromAnchor && /^(?:방|개인실|복도|계단|로비|홀|교실|강의실|사무실|학생회실|창고|지하)$/u.test(target)) return { min_minutes: 2, max_minutes: 8, profile: 'within-building' };
  return { min_minutes: 3, max_minutes: 30, profile: 'local' };
}

function parseDuration(text = '', actionType = 'unknown', destination = '', location = '') {
  const source = String(text || ''), candidates = durationCandidates(source);
  if (candidates.length >= 2) {
    const first = candidates.at(-2), second = candidates.at(-1), connector = source.slice(first.end, second.index);
    if (/(?:에서|부터|~|〜|내지|또는|혹은)/u.test(connector)) {
      return { min_minutes: Math.min(first.minutes, second.minutes), max_minutes: Math.max(first.minutes, second.minutes), explicit: true, source: source.slice(first.index, second.end) };
    }
  }
  const selected = candidates.at(-1);
  if (selected) {
    const prefix = source.slice(Math.max(0, selected.index - 8), selected.index), suffix = source.slice(selected.end, selected.end + 8);
    if (/최대\s*$/u.test(prefix) || /^\s*(?:이내|이하)/u.test(suffix)) return { min_minutes: 0, max_minutes: selected.minutes, explicit: true, source: selected.raw };
    if (/^\s*미만/u.test(suffix)) return { min_minutes: 0, max_minutes: Math.max(0, selected.minutes - 1), explicit: true, source: selected.raw };
    return { min_minutes: selected.minutes, max_minutes: selected.minutes, explicit: true, source: selected.raw };
  }
  if (actionType === 'travel') return { ...travelDuration(destination, location), explicit: false, source: null };
  const defaults = DEFAULT_DURATION[actionType];
  return defaults ? { min_minutes: defaults[0], max_minutes: defaults[1], explicit: false, source: null } : { min_minutes: null, max_minutes: null, explicit: false, source: null };
}

function clockExpression(text = '') {
  const source = String(text || ''), rows = [];
  for (const match of source.matchAll(/(?:(?<period>오전|오후|저녁|밤|새벽)\s*)?(?<hour>\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\s*시(?!간)(?:\s*(?<minute>\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\s*분)?|(?<colon>\d{1,2}:\d{2})|(?<named>정오|자정)/gu)) {
    let minutes = match.groups?.colon ? clockValue(match.groups.colon) : match.groups?.named === '정오' ? 720 : match.groups?.named === '자정' ? 0 : null;
    if (minutes == null && match.groups?.hour) {
      let hour = numberValue(match.groups.hour), minute = numberValue(match.groups.minute || '0') || 0;
      if (hour != null) {
        if (match.groups.period === '오후' || match.groups.period === '저녁' || match.groups.period === '밤') hour = hour % 12 + 12;
        else if (match.groups.period === '오전' && hour === 12) hour = 0;
        minutes = hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
      }
    }
    if (minutes != null) rows.push({ raw: match[0], minutes, index: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return rows.at(-1) || null;
}

function dateExpression(text = '') {
  const source = String(text || ''), named = [
    ['그저께', -2], ['그제', -2], ['어제', -1], ['지난주', -7], ['지난달', -30], ['지난해', -365],
    ['오늘', 0], ['내일', 1], ['다음날', 1], ['익일', 1], ['모레', 2], ['다음주', 7], ['차주', 7],
  ];
  let selected = null;
  for (const [raw, offset] of named) {
    const index = source.lastIndexOf(raw);
    if (index >= 0 && (!selected || index > selected.index)) selected = { raw, kind: 'relative-date', date_offset_days: offset, index, end: index + raw.length };
  }
  const relativePattern = new RegExp(`(?<number>${NUMBER_PATTERN})\\s*(?<unit>년|개월|달|주일|주|일)\\s*(?:후|뒤|이후)(?:에)?`, 'gu');
  for (const match of source.matchAll(relativePattern)) {
    const amount = numberValue(match.groups?.number), unit = match.groups?.unit, multiplier = unit === '년' ? 365 : unit === '개월' || unit === '달' ? 30 : unit === '주' || unit === '주일' ? 7 : 1;
    const row = { raw: match[0], kind: 'relative-date', date_offset_days: amount == null ? null : Math.round(amount * multiplier), index: match.index ?? 0, end: (match.index ?? 0) + match[0].length };
    if (row.date_offset_days != null && (!selected || row.index > selected.index)) selected = row;
  }
  const absolute = [...source.matchAll(/(?:(?<year>\d{1,4})[-/.년]\s*)?(?<month>\d{1,2})\s*(?:[-/.]|월)\s*(?<day>\d{1,2})\s*(?:일)?/gu)].at(-1);
  if (absolute && (!selected || (absolute.index ?? 0) > selected.index)) {
    selected = { raw: absolute[0], kind: 'absolute-date', date_offset_days: null, year: absolute.groups?.year ? Number(absolute.groups.year) : null, month: Number(absolute.groups?.month), day: Number(absolute.groups?.day), index: absolute.index ?? 0, end: (absolute.index ?? 0) + absolute[0].length };
  }
  return selected;
}

function parseDeadline(text = '') {
  const source = String(text || ''), until = source.lastIndexOf('까지');
  if (until < 0) return null;
  const prefix = source.slice(Math.max(0, until - 80), until), date = dateExpression(prefix), clock = clockExpression(prefix);
  if (!date && !clock) return null;
  const start = Math.min(date?.index ?? prefix.length, clock?.index ?? prefix.length);
  return {
    raw: `${prefix.slice(start).trim()}까지`,
    date_offset_days: date?.date_offset_days ?? null,
    absolute_date: date?.kind === 'absolute-date' ? { year: date.year, month: date.month, day: date.day } : null,
    clock_minutes: clock?.minutes ?? null,
  };
}

function parseStart(text = '', context = {}, sequenceRelation = 'root', deadline = null) {
  const source = String(text || ''), date = dateExpression(source), clock = clockExpression(source), currentClock = clockValue(context.currentTime);
  const clockIsDeadline = Boolean(clock && /까지/u.test(source.slice(clock.end, clock.end + 8)));
  const dateIsDeadline = Boolean(deadline && date && deadline.raw.includes(date.raw));
  const effectiveDate = dateIsDeadline ? null : date;
  const effectiveClock = clockIsDeadline ? null : clock;
  if (!effectiveDate && !effectiveClock) {
    return sequenceRelation === 'root'
      ? { relation: 'immediate', raw: null, date_offset_days: null, clock_minutes: null, offset_minutes: 0, elapsed: false }
      : { relation: sequenceRelation, raw: null, date_offset_days: null, clock_minutes: null, offset_minutes: null, elapsed: false };
  }
  const dateOffset = effectiveDate?.date_offset_days ?? null;
  let offset = dateOffset == null ? null : dateOffset * 1440;
  if (effectiveClock && currentClock != null) offset = (offset ?? 0) + effectiveClock.minutes - currentClock;
  const elapsed = offset != null && offset < 0;
  return {
    relation: elapsed ? 'elapsed' : effectiveDate && effectiveClock ? 'date-and-clock' : effectiveDate ? effectiveDate.kind : 'clock',
    raw: [effectiveDate?.raw, effectiveClock?.raw].filter(Boolean).join(' ') || null,
    date_offset_days: dateOffset,
    absolute_date: effectiveDate?.kind === 'absolute-date' ? { year: effectiveDate.year, month: effectiveDate.month, day: effectiveDate.day } : null,
    clock_minutes: effectiveClock?.minutes ?? null,
    offset_minutes: offset,
    elapsed,
  };
}

function cleanDestination(value = '') {
  return String(value || '').trim().replace(/^(?:그리고|그다음|이어서)\s+/u, '').replace(/(?:으로|로|에)$/u, '') || null;
}

export function parseTimePlan(action = '', context = {}) {
  const rawSource = String(action || '').trim(), source = rawSource.slice(0, 2000), ranges = quoteRanges(source), clauses = splitClauses(source), parsed = [];
  if (!source) return { version: TIME_PLAN_PARSER_VERSION, mode: 'shadow', clauses: [], diagnostics: [] };
  let inheritedActor = null;
  clauses.forEach((clause, index) => {
    const quoted = Boolean(clause.anchor && ranges.some(([start, end]) => clause.anchor.index >= start && clause.anchor.index < end)), localAnchor = clause.anchor ? clause.source.indexOf(clause.anchor.text) : -1, actorScope = localAnchor >= 0 ? clause.source.slice(0, localAnchor) : clause.source;
    const explicit = explicitActor(actorScope, context.actorName), actor = explicit || (quoted ? { kind: 'unknown', name: null, explicit: false } : inheritedActor) || { kind: 'pc', name: String(context.actorName || 'PC'), explicit: false };
    if (explicit && !quoted) inheritedActor = explicit;
    else if (!quoted && !inheritedActor) inheritedActor = actor;
    const actionType = clause.anchor?.type || 'unknown', destination = cleanDestination(clause.anchor?.destination), hypothetical = isHypothetical(clause.source), thirdParty = actor.kind === 'npc', committed = actionType !== 'unknown' && actor.kind === 'pc' && !quoted && !hypothetical;
    const sequenceRelation = index === 0 ? 'root' : `after_action_${index}`;
    const deadline = parseDeadline(clause.source), start = parseStart(clause.source, context, sequenceRelation, deadline), duration = parseDuration(clause.source, actionType, destination, context.location);
    parsed.push({
      index: index + 1,
      actor: { kind: actor.kind, name: actor.name, explicit: Boolean(actor.explicit) },
      action_type: actionType,
      start,
      duration,
      destination,
      explicit_deadline: deadline,
      sequence_relation: sequenceRelation,
      committed,
      completion_required: committed,
      hypothetical,
      quoted,
      third_party: thirdParty,
    });
  });
  return {
    version: TIME_PLAN_PARSER_VERSION,
    mode: 'shadow',
    clauses: parsed,
    diagnostics: [rawSource.length > source.length ? 'input-truncated' : null, parsed.some((clause) => clause.action_type === 'unknown') ? 'unclassified-clause' : null].filter(Boolean),
  };
}

export function summarizeTimePlan(plan = {}, legacyIntent = {}) {
  const clauses = Array.isArray(plan.clauses) ? plan.clauses : [], committedPc = clauses.filter((clause) => clause.committed && !clause.third_party), terminal = committedPc.at(-1) || null;
  const legacy = String(legacyIntent?.kind || 'unknown'), terminalType = String(terminal?.action_type || 'none'), comparableType = terminalType === 'sleep' || terminalType === 'rest' ? 'downtime' : terminalType;
  return {
    version: String(plan.version || TIME_PLAN_PARSER_VERSION),
    mode: 'shadow',
    clause_count: clauses.length,
    committed_pc_clause_count: committedPc.length,
    action_types: clauses.map((clause) => String(clause.action_type || 'unknown')).slice(0, 8),
    terminal_action_type: terminalType,
    legacy_intent: legacy,
    terminal_agreement: terminal ? comparableType === legacy : legacy === 'decision-sensitive' || legacy === 'generic',
    diagnostic_count: Array.isArray(plan.diagnostics) ? plan.diagnostics.length : 0,
  };
}
