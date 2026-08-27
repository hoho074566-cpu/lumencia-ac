#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FATE_START_DEPARTMENTS,
  generateFateStartingCharacter,
  normalizeCharacterCreation,
  renderFateOriginStory,
} from '../../lib/fate-start.js';

const genders=['male','female'];
const socialClasses=['commoner','fallen_noble'];
const axes=['body','mana','intelligence','divinity'];
const talents=['magic','martial','soul','knowledge'];

for(const gender of genders){
  for(const socialClass of socialClasses){
    for(const department of FATE_START_DEPARTMENTS){
      const generated=generateFateStartingCharacter({gender,socialClass,department,seed:`${gender}:${socialClass}:${department}`});
      const {creation,pc}=generated,origin=creation.fateStart.origin;
      assert.equal(creation.mode,'fate');
      assert.equal(creation.fateStart.version,2);
      assert.equal(origin.gender,gender);
      assert.equal(origin.socialClass,socialClass);
      assert.equal(origin.department,department);
      for(const field of ['region','familyState','occupation','pastIncident','mentor','admissionCause'])assert.ok(origin[field],`${field} is required`);
      assert.equal(origin.originStory.length>=4&&origin.originStory.length<=7,true,'Origin Story must stay at 4-7 lines');
      assert.equal(origin.socialConnections.length>=1,true);
      assert.equal(origin.backgroundFlags.includes(`class:${socialClass}`),true);
      assert.equal(origin.backgroundFlags.some(flag=>flag.startsWith('region:')),true);
      for(const key of axes)assert.equal(Number.isInteger(origin.baseStats[key])&&origin.baseStats[key]>=1&&origin.baseStats[key]<=3,true,`${key} must be 1-3`);
      for(const key of talents)assert.equal(Number.isInteger(origin.talents[key])&&origin.talents[key]>=1&&origin.talents[key]<=3,true,`${key} talent must be 1-3`);
      assert.equal(origin.skillsLearned.length>=2,true,'origin and department skills are both required');
      assert.deepEqual(Object.keys(pc.skills),origin.skillsLearned,'starting skills must derive from structured Origin');
      assert.equal(pc.characterSetting,origin.originStory.join('\n'),'PC story must derive from structured Origin');
      assert.notEqual(pc.name,'Aaa','Fate generation must replace the placeholder name');
      assert.equal(pc.appearance.includes('초월')||pc.appearance.includes('신비')||pc.appearance.includes('압도'),false,'default appearance must remain ordinary');
      assert.equal(pc.realm,department==='마법과 1학년'?'1서클':'비기너');
      assert.deepEqual(normalizeCharacterCreation(JSON.parse(JSON.stringify(creation))),creation,'generated Origin must survive save/load normalization');
      const mismatched=JSON.parse(JSON.stringify(creation)); mismatched.fateStart.origin.department=FATE_START_DEPARTMENTS.find(value=>value!==department);
      assert.equal(normalizeCharacterCreation(mismatched).fateStart.version,1,'a selection/Origin mismatch must fail closed to the selected foundation state');
    }
  }
}

const repeated=Array.from({length:5},(_,index)=>generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:`acceptance-${index+1}`}));
const signatures=(selector)=>new Set(repeated.map(selector)).size;
assert.equal(signatures(row=>JSON.stringify(row.creation.fateStart.origin)) ,5,'five identical selections must generate five Origins');
assert.equal(signatures(row=>JSON.stringify(row.creation.fateStart.origin.baseStats)+JSON.stringify(row.creation.fateStart.origin.talents))>1,true,'five generations must vary initial ability profiles');
assert.equal(signatures(row=>row.creation.fateStart.origin.skillsLearned.join('|'))>1,true,'five generations must vary learned skills');
assert.equal(signatures(row=>row.creation.fateStart.origin.admissionCause)>1,true,'five generations must vary admission routes');

const sourceOrigin=repeated[0].creation.fateStart.origin;
const rerendered=renderFateOriginStory({...sourceOrigin,occupation:'구조 우선 검증용 직업',originStory:[]});
assert.match(rerendered.join('\n'),/구조 우선 검증용 직업/,'story rendering must consume structured data instead of inferring it afterward');

const app=readFileSync('app.js','utf8');
const runtime=readFileSync('app-runtime.js','utf8');
const html=readFileSync('index.html','utf8');
assert.match(app,/generateFateStartingCharacter\(\{/,'Fate submit must generate the structured starting character');
assert.match(app,/base\.pc=\{\.\.\.base\.pc,\.\.\.generated\.pc/,'generated PC fields must enter the existing PC model');
assert.match(app,/save\.creation\?\.mode==='fate'[\s\S]*fateOrigin\.originStory\.join\('\\n'\)/,'INFO must expose the generated Origin Story');
assert.match(runtime,/generateFateStartingCharacter/,'blob runtime must rewrite the expanded Fate module import');
assert.match(html,/구조 데이터에서 먼저 생성된다/,'creator must describe the data-first Origin contract');
const fatePath=app.slice(app.indexOf("if($('pcCreationMode').value==='fate')"),app.indexOf('base.creation=createFreeCharacterCreation()'));
assert.doesNotMatch(fatePath,/base\.(?:relationships|npcStates|memories|backgroundDigest)/,'P2-PR02 must not preimplement NPC/world background consequences');

console.log('procedural-origin-starting-character: PASS');
