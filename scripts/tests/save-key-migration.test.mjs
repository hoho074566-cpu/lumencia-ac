#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateLegacyNpcKeys } from '../../save-migrations.js';

function assertNoLegacyIdentity(value, path = 'save') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoLegacyIdentity(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') {
    assert.notEqual(value, 'lilia', `${path} retained legacy NPC value`);
    assert.notEqual(value, 'npc:lilia', `${path} retained legacy memory owner`);
    return;
  }
  assert.ok(!Object.hasOwn(value, 'lilia'), `${path} retained legacy NPC map key`);
  for (const [key, child] of Object.entries(value)) assertNoLegacyIdentity(child, `${path}.${key}`);
}

const legacyOnly = migrateLegacyNpcKeys({
  relationships: { lilia: { affinity: 7, trust: 4, history: ['met'] } },
  intimacyStates: { lilia: { level: 1 } },
  npcStates: { lilia: { location: 'hall' } },
  emotionStates: { lilia: { current: 'smile' } },
  memories: { global: [{ owner: 'npc:lilia', fact: 'promise' }], npc: { lilia: [{ turn: 2, fact: 'second' }] } },
  scheduledEvents: [{ participants: ['artemis', 'lilia'] }],
  scheduleContext: { npc_schedule: { lilia: { commitment: 'orientation' } }, due: [{ participants: ['lilia'] }] },
  director: {
    npcExposure: { lilia: { appearances: 3 } },
    recentSpotlights: [{ turn: 2, keys: ['lilia'] }],
    callbacks: [{ key: 'arc', spotlight_keys: ['lilia'] }],
  },
  recentTurns: [{ scene: [{ speaker_key: 'lilia' }], director: { spotlight_keys: ['lilia'] } }],
  renderedTurns: [{ turn: { scene: [{ speaker_key: 'lilia' }], director: { spotlight_keys: ['lilia'] } } }],
  hooks: [{ source_npc_key: 'lilia', target_npc_keys: ['lilia'] }],
  debug: { lastRelationChanges: [{ npc_key: 'lilia' }] },
});
assert.equal(legacyOnly.relationships.lillia.affinity, 7);
assert.equal(legacyOnly.memories.npc.lillia[0].fact, 'second');
assert.deepEqual(legacyOnly.scheduledEvents[0].participants, ['artemis', 'lillia']);
assert.ok(legacyOnly.scheduleContext.npc_schedule.lillia);
assert.equal(legacyOnly.director.npcExposure.lillia.appearances, 3);
assert.deepEqual(legacyOnly.director.recentSpotlights[0].keys, ['lillia']);
assert.equal(legacyOnly.recentTurns[0].scene[0].speaker_key, 'lillia');
assert.equal(legacyOnly.renderedTurns[0].turn.scene[0].speaker_key, 'lillia');
assertNoLegacyIdentity(legacyOnly);

const mixed = migrateLegacyNpcKeys({
  relationships: {
    lilia: { affinity: 9, trust: 2, history: ['legacy event'], legacyNote: 'retain me' },
    lillia: { affinity: 5, trust: 6, history: ['canonical event'], status: 'friend' },
  },
  memories: { npc: {
    lilia: [{ turn: 3, fact: 'later' }, { turn: 1, fact: 'same' }],
    lillia: [{ turn: 1, fact: 'same' }, { turn: 2, fact: 'middle' }],
  } },
  emotionStates: { lilia: { current: 'sad', reason: 'legacy reason' }, lillia: { current: 'smile' } },
  director: { npcExposure: { lilia: { appearances: 8, firstSeenTurn: 1 }, lillia: { appearances: 5, lastSeenTurn: 9 } } },
  scheduledEvents: [{ participants: ['lilia', 'lillia', 'sera'] }],
});
assert.equal(mixed.relationships.lillia.affinity, 5, 'canonical scalar must win rather than double-count');
assert.equal(mixed.relationships.lillia.trust, 6);
assert.equal(mixed.relationships.lillia.legacyNote, 'retain me');
assert.deepEqual(mixed.relationships.lillia.history, ['legacy event', 'canonical event']);
assert.deepEqual(mixed.memories.npc.lillia.map((row) => row.fact), ['same', 'middle', 'later']);
assert.equal(mixed.emotionStates.lillia.current, 'smile');
assert.equal(mixed.emotionStates.lillia.reason, 'legacy reason');
assert.equal(mixed.director.npcExposure.lillia.appearances, 8, 'exposure must use max, not sum');
assert.equal(mixed.director.npcExposure.lillia.firstSeenTurn, 1);
assert.equal(mixed.director.npcExposure.lillia.lastSeenTurn, 9);
assert.deepEqual(mixed.scheduledEvents[0].participants, ['lillia', 'sera']);
assertNoLegacyIdentity(mixed);

assertNoLegacyIdentity(migrateLegacyNpcKeys({}), 'new save');
const app = readFileSync('app.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
assert.match(app, /function normalizeSave\(raw\)[\s\S]*?migrateLegacyNpcKeys\(raw\)[\s\S]*?next\.relationships/, 'migration must run at the start of save normalization');
assert.match(runtime, /save-migrations\.js\?v=156/, 'blob runtime must rewrite the migration import to a loadable V1.5.6 URL');

console.log('PASS legacy lilia save migration (legacy-only and conservative mixed merge)');
