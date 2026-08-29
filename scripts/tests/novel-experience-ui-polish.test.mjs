import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOVEL_PRESENTATION_VERSION,
  createNovelPresentationState,
  novelSceneTitle,
  resetNovelPresentationState,
  shouldShowNovelPortrait,
} from '../../lib/novel-presentation.js';

const context = readFileSync('api/lib/context-router.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
const styles = readFileSync('styles.css', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const health = readFileSync('api/health.js', 'utf8');

assert.equal(NOVEL_PRESENTATION_VERSION, '1.0');

const canonKernel = context.match(/const CANON_KERNEL = String\.raw`([\s\S]*?)`;/)?.[1] || '';
const novelContract = context.match(/const MINIMAL_WRITER_CONTRACT = String\.raw`([\s\S]*?)`;/)?.[1] || '';
assert.match(novelContract, /MINIMAL WRITER CONTRACT/);
assert.match(novelContract, /next scene of a serialized fantasy novel/);
assert.match(novelContract, /Compress routine process/);
assert.match(novelContract, /never invent a new player intention, dialogue, emotion, or decision/);
assert.match(canonKernel, /player owns every new PC intention/);
assert.match(canonKernel, /routine mechanics inside its semantic scope/);
assert.match(canonKernel, /never establishes paragraph order, actor order, a completion recipe/);
assert.ok(canonKernel.length + novelContract.length <= 1900, 'P3-PR01R production narrative contract must stay thin');
assert.doesNotMatch(context, /generic prose scoring|sentence rhythm validator|sensory-detail quota|subtext parser/i);

const presentation = createNovelPresentationState();
assert.equal(novelSceneTitle(presentation, { turn:{ scene_title:'AUTO · 기숙사 복도', importance:'routine', choices:[], state_delta:{} } }), '기숙사 복도');
assert.equal(novelSceneTitle(presentation, { turn:{ scene_title:'복도 끝의 작은 발소리', importance:'routine', choices:[], state_delta:{} } }), '기숙사 복도', 'a routine micro-action must retain the scene title');
assert.equal(novelSceneTitle(presentation, { turn:{ scene_title:'문 안쪽의 충돌', importance:'important', choices:[], state_delta:{} } }), '문 안쪽의 충돌', 'an important beat may update the title');
assert.equal(novelSceneTitle(presentation, { meta:true, turn:{ scene_title:'META 점검', importance:'routine', choices:[], state_delta:{} } }), 'META 점검');
assert.equal(novelSceneTitle(presentation, { turn:{ scene_title:'다시 복도', importance:'routine', choices:[], state_delta:{} } }), '문 안쪽의 충돌', 'META presentation must not replace the game scene title');
assert.equal(novelSceneTitle(presentation, { turn:{ scene_title:'기사과 연무장', importance:'routine', choices:[], state_delta:{ new_location:'기사과 연무장' } } }), '기사과 연무장', 'a real location transition must update the title');

assert.equal(shouldShowNovelPortrait(presentation, { speakerKey:'artemis', expression:'serious', turnIndex:1 }), true);
assert.equal(shouldShowNovelPortrait(presentation, { speakerKey:'artemis', expression:'serious', turnIndex:2 }), false, 'same NPC and expression must not repeat a large portrait every turn');
assert.equal(shouldShowNovelPortrait(presentation, { speakerKey:'artemis', expression:'smile', emotionTransition:'accepted', turnIndex:2 }), true, 'an accepted Emotion State change must use the new expression asset');
assert.equal(shouldShowNovelPortrait(presentation, { speakerKey:'artemis', expression:'smile', turnIndex:3 }), false);
assert.equal(shouldShowNovelPortrait(presentation, { speakerKey:'artemis', expression:'smile', turnIndex:5 }), true, 'a long enough absence may refresh the portrait');
resetNovelPresentationState(presentation);
assert.equal(shouldShowNovelPortrait(presentation, { speakerKey:'artemis', expression:'smile', turnIndex:0 }), true);

assert.match(app, /settings\.developerMode \? `<span>/);
assert.match(app, /settings\.developerMode && record\.usage\?\.cold_cache/);
assert.match(app, /routeStatus'\)\?\.classList\.toggle\('hidden', !settings\.developerMode\)/);
assert.match(app, /costStatus'\)\?\.classList\.toggle\('hidden', !settings\.developerMode\)/);
assert.match(app, /Suggested Actions · 직접 입력 가능/);
assert.match(runtime, /Suggested Actions · 직접 입력 가능/);
assert.doesNotMatch(runtime, /data\.turn\.scene_title = `AUTO ·/);
assert.doesNotMatch(runtime, /data\.turn\.scene_title = `CONTINUE ·/);
assert.match(styles, /\.suggested-actions-label/);
assert.match(sw, /\/lib\/novel-presentation\.js/);
assert.match(health, /novelExperience:/);
assert.doesNotMatch(readFileSync('lib/novel-presentation.js', 'utf8'), /responses\.create|save root|lifecycle|parser/i);

console.log('PASS P2-PR09 consolidated AI-first Novel Narrative Contract and presentation-only UI polish');
