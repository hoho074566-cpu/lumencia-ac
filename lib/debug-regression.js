import { ASSETS, CANONICAL_PORTRAIT_EXPRESSIONS } from '../assets.js';
import { migrateLegacyNpcKeys } from '../save-migrations.js';
import { actualScheduledEntrants, explicitDepartures, freshChoices, reconcileParticipants } from './scene-continuity.js';
import { compactEventProgress, isEventBeatEligible, mergeEventProgress } from './event-progress.js';

const PHYSICAL_KEYS = Object.freeze(['anastasia','aria','arien','aris','artemis','asmo','beelzebub','bellian','carne','chloe','delpirem','elena','elise','emily','etera','fria','isabel','kartia','laris','lena','levian','lillia','lily_lumina','lucia','mirabelle','nemesis','sera','serena','seriel','sia','sloth','veradin']);
const FULL_PORTRAIT_KEYS = Object.freeze(PHYSICAL_KEYS.filter(key => key !== 'anastasia'));
const CANONICAL_KEYS = Object.freeze(['bellian','carne','fria','mirabelle','lucia','lillia','lily_lumina']);
const TYPO_KEYS = Object.freeze(['belian','karne','pria','mirabel']);
const EXPECTED_EXPRESSIONS = Object.freeze(['default','smile','blush','serious','angry','sad','shock','smug','annoyed','worried','confused','laugh','flustered']);
const narration = (text) => ({ kind:'narration', text });
const dialogue = (speaker_key, speaker_name, text = '말한다.') => ({ kind:'dialogue', speaker_key, speaker_name, text });

function result(id, name, check, detail) {
  const started = performance.now();
  try {
    const value = check();
    if (!value) throw new Error(detail || 'contract mismatch');
    return { id, name, status:'PASS', detail:typeof value === 'string' ? value : detail, durationMs:performance.now() - started };
  } catch (error) {
    return { id, name, status:'FAIL', detail:error.message, durationMs:performance.now() - started };
  }
}

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function resolveManifestPortrait(key, requestedExpression = 'default') {
  const character = ASSETS.characters[key];
  if (!character?.available) return { url:null, role:null, fallback:'unavailable' };
  const requested = CANONICAL_PORTRAIT_EXPRESSIONS.includes(requestedExpression) ? requestedExpression : 'default';
  if (requested !== 'default' && character.expressions?.[requested]) return { url:character.expressions[requested], role:'portrait', fallback:'none' };
  if (character.default) return { url:character.default, role:'portrait', fallback:requested === requestedExpression ? 'default' : 'unknown -> default' };
  if (character.fullbody) return { url:character.fullbody, role:'fullbody', fallback:'fullbody' };
  return { url:null, role:null, fallback:'unavailable' };
}

export function runFastLocalRegression() {
  const recent = [{ scene:[dialogue('mirabelle','미라벨'),dialogue('lillia','릴리아')] }];
  const registry = { mirabelle:'미라벨', lillia:'릴리아' };
  const movement = { scene:[narration('PC는 기사과 건물 내부에 도착했다.')], state_delta:{new_location:'기사과 건물 내부'}, choices:['기사과 건물로 간다.','둘러본다.'] };
  const checks = [
    ['event-monotonic','EVENT BEAT MONOTONICITY',()=>{const merged=mergeEventProgress({eventInstanceId:'entrance#1285',activeBeat:null,completedBeats:['welcome_address','freshman_rep_speech']},{event_instance_id:'entrance#1285',active_beat:'freshman_rep_speech',completed_beats:['welcome_address']});return merged.activeBeat===null&&merged.completedBeats.includes('freshman_rep_speech');},'완료 beat 유지, 재활성화 차단'],
    ['event-advance','SAME EVENT ADVANCE',()=>mergeEventProgress({eventInstanceId:'entrance#1285',completedBeats:['freshman_rep_speech']},{event_instance_id:'entrance#1285',active_beat:'ceremony_close',completed_beats:[]}).activeBeat==='ceremony_close','후속 beat 활성 허용'],
    ['event-instance','NEW EVENT INSTANCE',()=>isEventBeatEligible(mergeEventProgress({eventInstanceId:'entrance#1285',completedBeats:['freshman_rep_speech']},{event_instance_id:'entrance#1286',active_beat:'freshman_rep_speech',completed_beats:[]}), 'freshman_rep_speech'),'새 occurrence의 동일 beat 허용'],
    ['event-continue','CONTINUE REPLAY GUARD',()=>{const progress=mergeEventProgress({eventInstanceId:'entrance#1285',completedBeats:['freshman_rep_speech']},{event_instance_id:'entrance#1285',active_beat:'freshman_rep_speech',completed_beats:[]},{allowInstanceChange:false});return compactEventProgress(progress).includes('freshman_rep_speech')&&!isEventBeatEligible(progress,'freshman_rep_speech');},'compact anchor 유지, 후보 재선택 차단'],
    ['event-reference','PROSE REFERENCE ALLOWED',()=>isEventBeatEligible({eventInstanceId:'entrance#1285',completedBeats:['freshman_rep_speech']},'ceremony_close'),'회상 문구를 검사하지 않고 구조화 실행 beat만 차단'],
    ['movement','PLAYER ACTION COMMIT — 이동',()=>movement.state_delta.new_location==='기사과 건물 내부'&&same(freshChoices('기사과 건물로 간다.',movement),['둘러본다.']),'커밋/새 위치 유지, 동일 목적지 선택 제거'],
    ['entry','이동 후 중복 입장 선택지',()=>freshChoices('주변을 본다.',{...movement,choices:['기사과 건물 안으로 들어간다.','마법과 건물 안으로 들어간다.']}).join('|')==='마법과 건물 안으로 들어간다.','같은 건물은 제거, 다른 건물은 유지'],
    ['dialogue','동일 대화 선택지',()=>same(freshChoices('미라벨에게 장소를 알려 준다.',{scene:[narration('PC는 미라벨에게 장소를 알려 주었다.')],state_delta:{},choices:['미라벨에게 장소를 알려 준다.']}),[]),'직전 전달 반복 제거'],
    ['departure','NPC 명시적 퇴장 (KO/EN)',()=>['미라벨이 방을 떠났다.','Mirabelle left the room.'].every(text=>explicitDepartures({scene:[narration(text)]},recent,{activeParticipants:['mirabelle'],registry}).has('mirabelle')),'완료된 퇴장 감지'],
    ['negated','부정/시도 퇴장',()=>['미라벨은 떠나지 않았다.','미라벨은 떠나려 했지만 문이 잠겨 있었다.','Mirabelle tried to leave, but the door was locked.'].every(text=>explicitDepartures({scene:[narration(text)]},recent,{activeParticipants:['mirabelle'],registry}).size===0),'미완료 퇴장은 현재 인물 유지'],
    ['mixed','혼합 주어 퇴장',()=>same([...explicitDepartures({scene:[narration('릴리아는 떠나지 않았지만 미라벨은 방을 나갔다.')]},recent,{activeParticipants:['mirabelle','lillia'],registry})],['mirabelle']),'릴리아 유지, 미라벨 퇴장'],
    ['return','같은 턴 복귀',()=>same(reconcileParticipants({previous:['mirabelle'],turn:{scene:[narration('미라벨이 방을 떠났다.'),dialogue('mirabelle','미라벨','돌아왔어요.')],state_delta:{}},registry}),['mirabelle']),'최종 장면의 복귀를 따름'],
    ['companion','동행/잔류 NPC',()=>same(reconcileParticipants({previous:['mirabelle','lillia'],action:'미라벨과 함께 강당으로 간다. 릴리아는 남아 있기로 한다.',turn:{scene:[narration('미라벨과 함께 도착했고 릴리아는 뒤에 남았다.')],state_delta:{new_location:'강당'}},registry}),['mirabelle']),'동행만 이동, 잔류자는 제외'],
    ['priority','참여자 우선순위',()=>reconcileParticipants({previous:['a','b','c','d','e','f','g','h'],turn:{scene:[dialogue('speaker','화자')],state_delta:{}}})[0]==='speaker','현재 화자는 8명 한도에서도 우선'],
    ['schedule','실제 예정 입장자',()=>same(actualScheduledEntrants({due:[{participants:['mirabelle']}],turn:{scene:[narration('미라벨이 강당에 들어왔다.')],state_delta:{}},recentTurns:recent,currentLocation:'강당',registry}),['mirabelle'])&&same(actualScheduledEntrants({due:[{participants:['mirabelle']}],turn:{scene:[narration('미라벨은 도서관에 있다.')],state_delta:{}},recentTurns:recent,currentLocation:'강당',registry}),[]),'실제 현장 진입만 포함'],
    ['retry','실패 행동 재시도',()=>same(freshChoices('문으로 들어간다.',{resolution_log:{outcome:'failure'},scene:[narration('시도가 실패했다.')],state_delta:{},choices:['문으로 들어간다.']}),['문으로 들어간다.'])&&same(freshChoices('문으로 들어간다.',{scene:[narration('릴리아는 들어가지 못했다.')],state_delta:{},choices:['문으로 들어간다.']}),[]),'구조화 PC 실패만 재시도 허용'],
    ['combat','전투 반복',()=>same(freshChoices('적을 공격한다.',{scene:[narration('전투 중')],state_delta:{},choices:['적을 공격한다.']}),['적을 공격한다.'])&&same(freshChoices('공격을 멈춘다.',{scene:[narration('공격을 멈췄다.')],state_delta:{},choices:['공격을 멈춘다.']}),[]),'공격만 반복 가능, 중단은 예외 아님'],
    ['migration','lilia → lillia 저장 이관',()=>{const migrated=migrateLegacyNpcKeys({participants:['lilia','lillia'],npcStates:{lilia:{active:true}}});return same(migrated.participants,['lillia'])&&migrated.npcStates.lillia.active&&!('lilia' in migrated.npcStates);},'실제 저장 migration helper 사용'],
    ['keys','정규 NPC 키',()=>CANONICAL_KEYS.every(key=>key in ASSETS.characters)&&TYPO_KEYS.every(key=>!(key in ASSETS.characters)),'정규 키 구별, 옛 오타 키 비활성'],
  ];
  const rows = checks.map(([id,name,check,detail]) => result(id,name,check,detail));
  rows.push({id:'continue',name:'CONTINUE 계약',status:'WARN',detail:'브라우저 비공개 runtime 함수와 서버 단일 호출은 CI 결정론 테스트가 권위 있음',durationMs:0});
  rows.push({id:'routing',name:'주소/최근 화자 라우팅 우선순위',status:'WARN',detail:'서버 Context Router의 영구 테스트에서 검증 (브라우저에 서버 모듈 미탑재)',durationMs:0});
  rows.push({id:'architecture',name:'아키텍처 불변식',status:'WARN',detail:'단일 model call, store:false, prompt cache, budgets, stable filenames는 PR safety gate에서 정적 검증',durationMs:0});
  rows.push({id:'live',name:'Live smoke',status:'WARN',detail:'안전한 격리 호출 경로가 없어 실행하지 않음 (0 API calls)',durationMs:0});
  return rows;
}

function manifestUrls(assets) {
  return PHYSICAL_KEYS.flatMap(key => {
    const character = assets.characters?.[key];
    return character ? [character.default,...Object.values(character.expressions || {}),character.fullbody].filter(Boolean) : [];
  });
}

function validateRequiredImages(assets) {
  const missing = [];
  for (const key of PHYSICAL_KEYS) {
    const character = assets.characters?.[key];
    if (!character) { missing.push(`${key}: character entry`); continue; }
    if (!character.available) missing.push(`${key}: available flag`);
    if (!character.fullbody) missing.push(`${key}: fullbody`);
    if (key === 'anastasia') {
      if (character.default) missing.push('anastasia: unexpected default portrait');
      for (const expression of EXPECTED_EXPRESSIONS.slice(1)) if (!character.expressions?.[expression]) missing.push(`anastasia: ${expression}`);
    } else if (FULL_PORTRAIT_KEYS.includes(key)) {
      if (!character.default) missing.push(`${key}: default`);
      for (const expression of EXPECTED_EXPRESSIONS.slice(1)) if (!character.expressions?.[expression]) missing.push(`${key}: ${expression}`);
    }
  }
  if (missing.length) throw new Error(`required image missing: ${missing.join(', ')}`);
  return true;
}

export function runImageContractRegression(assets = ASSETS) {
  return [
    result('image-count','32명 V2 asset manifest',()=>assets.liveFolders?.length===32&&PHYSICAL_KEYS.every(key=>assets.liveFolders.includes(key)),`${assets.liveFolders?.length ?? 0}명`),
    result('expression-contract','13표정 contract',()=>same(CANONICAL_PORTRAIT_EXPRESSIONS,EXPECTED_EXPRESSIONS),'frontend canonical 13 states'),
    result('asset-keys','이미지 키 안전성',()=>TYPO_KEYS.every(key=>!assets.liveFolders?.includes(key))&&!assets.liveFolders?.includes('aaa'),'오타 키 및 Aaa 없음'),
    result('required-images','필수 이미지 availability',()=>validateRequiredImages(assets),'캐릭터별 필수 portrait/fullbody 선언 확인'),
    result('unknown','알 수 없는 표정',()=>!resolveManifestPortrait('nemesis','not-a-state').url.endsWith('/not-a-state.webp'),'임의 URL 합성 안 함'),
    result('urls','물리 URL contract',()=>{const urls=manifestUrls(assets);return urls.length===447&&new Set(urls).size===urls.length&&urls.every(url=>url.startsWith(`${assets.base}/`));},`${manifestUrls(assets).length}개 manifest URL (현재 contract: 447)`),
    {id:'server-expression',name:'서버/프론트 표정 일치',status:'WARN',detail:'서버 schema 일치는 CI 영구 테스트가 정적 검증',durationMs:0},
  ];
}

function summarize(rows) {
  const counts = Object.fromEntries(['PASS','FAIL','WARN','SKIP'].map(status=>[status,rows.filter(row=>row.status===status).length]));
  return { counts, durationMs:rows.reduce((sum,row)=>sum+row.durationMs,0) };
}

export function mountDebugRegression(root) {
  if (!root || root.dataset.mounted === 'true') return;
  root.dataset.mounted = 'true';
  const get = id => root.querySelector(`#${id}`);
  const results = get('regressionResults'); const meta = get('regressionMeta');
  let lastRows = [];
  const render = rows => {
    lastRows = rows; results.replaceChildren(...rows.map(row=>{const el=document.createElement('div');el.className='regression-result';el.dataset.status=row.status;el.textContent=`${row.status==='PASS'?'✅':row.status==='FAIL'?'❌':'⚠️'} ${row.name} — ${row.detail} (${row.durationMs.toFixed(1)}ms)`;return el;}));
    const {counts,durationMs}=summarize(rows); meta.textContent=`마지막 실행: ${new Date().toLocaleString()} · 전체 ${counts.PASS} PASS / ${counts.FAIL} FAIL / ${counts.WARN} WARN / ${counts.SKIP} SKIP · ${durationMs.toFixed(1)}ms`;
  };
  get('regressionFastBtn').addEventListener('click',()=>render(runFastLocalRegression()));
  get('regressionImageBtn').addEventListener('click',()=>render(runImageContractRegression()));
  get('regressionRerunBtn').addEventListener('click',()=>render([...runFastLocalRegression(),...runImageContractRegression()]));
  get('regressionCopyBtn').addEventListener('click',async()=>{if(!lastRows.length)return;await navigator.clipboard.writeText([meta.textContent,...lastRows.map(row=>`${row.status} ${row.name}: ${row.detail}`)].join('\n'));});
  const character = get('regressionCharacter'); const expression = get('regressionExpression');
  character.replaceChildren(...PHYSICAL_KEYS.map(key=>new Option(key,key))); expression.replaceChildren(...EXPECTED_EXPRESSIONS.map(key=>new Option(key,key)));
  const show = () => { const resolved=resolveManifestPortrait(character.value,expression.value); const preview=get('regressionPreview'); preview.replaceChildren(); const text=document.createElement('div'); text.textContent=`${character.value} · requested=${expression.value} · role=${resolved.role||'-'} · fallback=${resolved.fallback} · ${resolved.url||'URL 없음'}`; preview.append(text); if(!resolved.url)return; const image=new Image(); image.alt=`${character.value} ${expression.value}`; image.addEventListener('load',()=>text.append(' · LOAD PASS')); image.addEventListener('error',()=>text.append(' · LOAD FAIL')); image.src=resolved.url; preview.append(image); };
  get('regressionShowImage').addEventListener('click',show);
  get('regressionNextCharacter').addEventListener('click',()=>{character.selectedIndex=(character.selectedIndex+1)%character.options.length;show();});
  get('regressionNextExpression').addEventListener('click',()=>{expression.selectedIndex=(expression.selectedIndex+1)%expression.options.length;show();});
}