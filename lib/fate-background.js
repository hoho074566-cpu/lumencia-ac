export const FATE_BACKGROUND_VISIBILITY = Object.freeze(['PUBLIC','LIMITED','PRIVATE','SECRET']);

const CLASS_LABELS=Object.freeze({commoner:'평민',fallen_noble:'몰락귀족'});
const DEPARTMENT_ROUTES=Object.freeze({
  '기사과 1학년':Object.freeze({checkpoint:'기사과 기초 실기 분류',axis:'body',talent:'martial'}),
  '마법과 1학년':Object.freeze({checkpoint:'마법과 마력 적성 확인',axis:'mana',talent:'magic'}),
  '신학부 1학년':Object.freeze({checkpoint:'신학부 신성·응급 대응 확인',axis:'divinity',talent:'soul'}),
  '일반학부 1학년':Object.freeze({checkpoint:'일반학부 기초 소양 분류',axis:'intelligence',talent:'knowledge'}),
});

function cleanText(value,max=360){return String(value||'').trim().slice(0,max);}
function safeArray(value){return Array.isArray(value)?value:[];}
function cleanFacts(value){
  const seen=new Set(),rows=[];
  for(const row of safeArray(value)){
    const id=cleanText(row?.id,60),visibility=String(row?.visibility||'').toUpperCase(),label=cleanText(row?.label,60),fact=cleanText(row?.fact,360);
    if(!id||seen.has(id)||!FATE_BACKGROUND_VISIBILITY.includes(visibility)||!label||!fact)continue;
    seen.add(id);rows.push({id,visibility,label,fact,audience:[...new Set(safeArray(row?.audience).map(item=>cleanText(item,60)).filter(Boolean))].slice(0,4)});
  }
  return rows.slice(0,12);
}

function strengthProfile(origin){
  const route=DEPARTMENT_ROUTES[origin.department]||DEPARTMENT_ROUTES['일반학부 1학년'];
  const axis=Math.max(1,Math.min(3,Number(origin.baseStats?.[route.axis])||1));
  const talent=Math.max(1,Math.min(3,Number(origin.talents?.[route.talent])||1));
  const score=axis+talent;
  if(score>=6)return{band:'advanced_start',evaluationMode:'기초 확인을 한 번만 실시하고 입증되면 즉시 상위 과제로 전환',knownBasis:'공식 기록이 아니라 현재 장면에서 실제로 입증된 수행'};
  if(score>=5)return{band:'prepared_start',evaluationMode:'기초 절차를 압축하고 약점 확인 중심으로 조정',knownBasis:'입학 기록 또는 현재 장면에서 관찰된 수행'};
  return{band:'foundation_start',evaluationMode:'표준 기초 평가를 진행하되 이미 성공한 항목은 반복 강요하지 않음',knownBasis:'현재 장면에서 관찰된 수행'};
}

function startingRoute(origin){
  const department=DEPARTMENT_ROUTES[origin.department]||DEPARTMENT_ROUTES['일반학부 1학년'];
  if(origin.socialClass==='fallen_noble')return{
    id:`fallen-house-review:${origin.department}`,
    arrivalFocus:'대강당 앞 몰락 가문 신원 확인 등록대',
    checkpoint:department.checkpoint,
    expectation:'남아 있는 귀족식 교육과 실제 수행 능력이 일치하는지 빠르게 검증',
    eventMeaning:'같은 신입 평가라도 잃어버린 신분의 잔재와 현재 실력 사이를 확인하는 자리',
  };
  return{
    id:`public-intake:${origin.department}`,
    arrivalFocus:'대강당 앞 공개 선발 신입 등록대',
    checkpoint:department.checkpoint,
    expectation:'비정규 경험에서 얻은 실용성과 정식 교육의 공백을 함께 확인',
    eventMeaning:'같은 신입 평가라도 출발선의 제약을 넘어 실제 가능성을 증명하는 자리',
  };
}

export function buildFateBackgroundState(origin={}){
  const classLabel=CLASS_LABELS[origin.socialClass]||cleanText(origin.socialClass,40);
  const facts=cleanFacts([
    {id:'social_class',visibility:'PUBLIC',label:'신분',fact:classLabel},
    {id:'home_region',visibility:'PUBLIC',label:'출신 지역',fact:origin.region},
    {id:'department',visibility:'PUBLIC',label:'입학 학과',fact:origin.department},
    {id:'prior_occupation',visibility:'LIMITED',label:'이전 생업',fact:origin.occupation,audience:['academy_intake','department_evaluator']},
    {id:'admission_record',visibility:'LIMITED',label:'입학 경로',fact:origin.admissionCause,audience:['academy_intake','department_evaluator']},
    {id:'starting_training',visibility:'LIMITED',label:'기초 훈련 기록',fact:safeArray(origin.skillsLearned).join(', '),audience:['department_evaluator']},
    {id:'family_state',visibility:'PRIVATE',label:'가족 사정',fact:origin.familyState},
    {id:'mentor_identity',visibility:String(origin.admissionCause||'').includes(String(origin.mentor||''))?'LIMITED':'PRIVATE',label:'스승',fact:origin.mentor,audience:['academy_intake']},
    {id:'past_incident',visibility:'SECRET',label:'과거 사건',fact:origin.pastIncident},
  ]);
  return{version:1,sourceSeedTag:cleanText(origin.seedTag,80),facts,startingRoute:startingRoute(origin),strengthProfile:strengthProfile(origin)};
}

export function normalizeFateBackgroundState(value,origin={}){
  const canonical=buildFateBackgroundState(origin);
  if(!canonical.sourceSeedTag)return null;
  if(!value||Number(value.version)!==1||cleanText(value.sourceSeedTag,80)!==canonical.sourceSeedTag)return canonical;
  const facts=cleanFacts(value.facts);
  if(FATE_BACKGROUND_VISIBILITY.some(level=>!facts.some(row=>row.visibility===level)))return canonical;
  return canonical;
}

export function compactFateBackgroundForModel(creation,pc={}){
  const fate=creation?.mode==='fate'?creation.fateStart:null,origin=fate?.origin;
  if(!origin)return null;
  const state=normalizeFateBackgroundState(fate.background,origin);
  if(!state)return null;
  const publicFacts=state.facts.filter(row=>row.visibility==='PUBLIC').map(({id,label,fact})=>({id,label,fact}));
  const limitedRecords=state.facts.filter(row=>row.visibility==='LIMITED').map(({id,label,fact,audience})=>({id,label,fact,audience}));
  return{
    essential:{version:1,route_id:state.startingRoute.id,public_facts:publicFacts,expectation:state.startingRoute.expectation,strength_band:state.strengthProfile.band,evaluation_mode:state.strengthProfile.evaluationMode},
    detail:{version:1,starting_route:state.startingRoute,public_facts:publicFacts,limited_records:limitedRecords,withheld:{PRIVATE:state.facts.filter(row=>row.visibility==='PRIVATE').length,SECRET:state.facts.filter(row=>row.visibility==='SECRET').length},strength_awareness:{...state.strengthProfile,actual_realm:cleanText(pc.realm,80)}},
  };
}

export function buildFateBackgroundDirective({creation,pc}={}){
  const model=compactFateBackgroundForModel(creation,pc);
  if(!model)return'';
  return `[P2-PR03 CHARACTER-DEPENDENT START]\n${JSON.stringify(model.detail)}\nPUBLIC은 기본적으로 알려져 있다. LIMITED는 현재 NPC가 명시된 공식 역할로 기록에 접근할 때만 사용한다. PRIVATE/SECRET 값은 이 문맥에서 제공되지 않았으며 NPC가 추측하거나 처음부터 아는 것으로 쓰지 않는다. 첫인상은 ROUTED NPC 성격 × 위 NPC_KNOWN 배경 × 현재 상황 × starting_route.expectation으로 판단한다. 같은 사건도 eventMeaning에 따라 기대·대사·평가 의미를 달리한다. strength_awareness는 GM의 난이도 기준이지 NPC의 자동 지식이 아니다. NPC는 공식 기록 또는 장면에서 직접 관찰한 수행만 알며, 입증된 실력에는 초보 절차를 끝까지 반복 강요하지 않는다.`;
}
