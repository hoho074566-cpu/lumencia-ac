#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeRoutedInput } from '../../api/lib/context-router.js';

const optionalContext=`===== AUTHORITATIVE SAVE_STATE (ROUTED) =====\n${'OPTIONAL_CONTEXT_'.repeat(1400)}`;
const authorityTail=[
  '===== GM EVENT DIRECTOR (ROUTED) =====',
  'DIRECTOR_SENTINEL=KEEP',
  '',
  '===== EVENT DIRECTOR V2.1 (ROUTED) =====',
  'DIRECTOR_V2_SENTINEL=KEEP',
  '',
  '===== SCHEDULE ENGINE (ROUTED) =====',
  '{"due":[{"id":"SCHEDULE_SENTINEL","title":"반드시 보존"}]}',
].join('\n');
const actionBlock='===== USER ACTION =====\n돌아다닌다.\n\n의미적 목표를 완료한다.';
const text=composeRoutedInput({optionalContext,authorityTail,actionBlock,inputChars:9000});

assert.ok(text.length<=9000,`routed input must respect routine budget: ${text.length}`);
assert.ok(text.length<optionalContext.length,'oversized optional context must be clipped');
assert.match(text,/===== GM EVENT DIRECTOR \(ROUTED\) =====/);
assert.match(text,/DIRECTOR_SENTINEL=KEEP/);
assert.match(text,/===== EVENT DIRECTOR V2\.1 \(ROUTED\) =====/);
assert.match(text,/DIRECTOR_V2_SENTINEL=KEEP/);
assert.match(text,/===== SCHEDULE ENGINE \(ROUTED\) =====/);
assert.match(text,/SCHEDULE_SENTINEL/,'authoritative schedule payload must survive prefix pressure');
assert.ok(text.endsWith(actionBlock),'USER ACTION must remain the final authoritative turn instruction');

const source=readFileSync('api/lib/context-router.js','utf8');
assert.match(source,/function compactScheduleAuthority\(/,'schedule authority must be structurally compacted before reservation');
assert.match(source,/const authorityTail=`===== GM EVENT DIRECTOR \(ROUTED\) =====/,'buildInput must create a reserved authority tail');
assert.match(source,/composeRoutedInput\(\{optionalContext,authorityTail,actionBlock,inputChars:profile\.inputChars\}\)/,'buildInput must use the reserved-tail composer');
assert.doesNotMatch(source,/clampText\(variableContext,variableBudget\)/,'legacy prefix-only clamp must stay removed');

console.log('PASS Context Router authority-tail reservation (9k budget preserves director + schedule payload)');
