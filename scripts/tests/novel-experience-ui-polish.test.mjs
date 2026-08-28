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

const routerRules = context.match(/const ROUTER_GM_RULES = String\.raw`([\s\S]*?)`;/)?.[1] || '';
const novelContract = context.match(/const NATURAL_STYLE = String\.raw`([\s\S]*?)`;/)?.[1] || '';
assert.match(novelContract, /CANONICAL NOVEL COMPOSITION CONTRACT/);
assert.match(novelContract, /serialized fantasy novel, not an RPG turn report/);
assert.match(novelContract, /meaningful scene beat reaches a natural stopping point/);
assert.match(novelContract, /Compress routine process; give important moments enough space/);
assert.match(novelContract, /ordinary execution of the action the player already chose/);
assert.match(novelContract, /Do not explain a beat before playing it/);
assert.match(novelContract, /Never paraphrase them as character dialogue/);
assert.match(routerRules, /사용자가 이미 고른 행동의 권위 있는 원문/);
assert.match(routerRules, /일상적 신체 동작·필요한 이동·즉각 결과/);
assert.match(routerRules, /새로운 PC 의도·목표·대사·감정/);
assert.match(routerRules, /부정·가정·질문뿐인 행동은 실행하지 않는다/);
assert.ok(routerRules.length + novelContract.length <= 2300, 'Diet / Reset runtime narrative contract must remain below the reduced footprint');
assert.doesNotMatch(novelContract, /Reaction Field|Subtext|Conversation in Motion|CHARACTER MUST SURVIVE FUNCTION|DEPTH > DISTANCE/);
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
