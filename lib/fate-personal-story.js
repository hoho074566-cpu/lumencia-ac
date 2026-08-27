import { buildFateBackgroundState, normalizeFateBackgroundState } from './fate-background.js';

export const FATE_PERSONAL_STORY_VERSION = '1.0';
export const FATE_PERSONAL_STORY_LAYERS = Object.freeze(['WORLD_PLOT','NPC_PLOT','PC_ORIGIN_PLOT']);

const CLASS_LABELS = Object.freeze({ commoner:'평민', fallen_noble:'몰락귀족' });

function cleanText(value, max = 360) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function uniqueStrings(value, limit = 4, max = 80) {
  return [...new Set(safeArray(value).map((item) => cleanText(item, max)).filter(Boolean))].slice(0, limit);
}
function backgroundFact(background, id) { return safeArray(background?.facts).find((row) => row?.id === id) || null; }
function hook({ id, title, kind, visibility, premise, publicAnchor, sourceFactIds, bridgeLayers, activationCue, audience = [] }) {
  return {
    id:cleanText(id,60), status:'candidate', layer:'PC_ORIGIN_PLOT',
    bridgeLayers:uniqueStrings(bridgeLayers,2,30), kind:cleanText(kind,30), title:cleanText(title,120),
    visibility:cleanText(visibility,12), premise:cleanText(premise,360), publicAnchor:cleanText(publicAnchor,180),
    sourceFactIds:uniqueStrings(sourceFactIds,4,60), activationCue:cleanText(activationCue,220),
    audience:uniqueStrings(audience,4,60),
  };
}

export function buildFatePersonalStoryState(origin = {}, backgroundValue = null) {
  const sourceSeedTag=cleanText(origin?.seedTag,80);
  if(!sourceSeedTag)return null;
  const background=normalizeFateBackgroundState(backgroundValue,origin)||buildFateBackgroundState(origin);
  const classLabel=CLASS_LABELS[origin.socialClass]||cleanText(origin.socialClass,40);
  const publicAnchor=`${cleanText(origin.region,80)} · ${classLabel} · ${cleanText(origin.department,100)}`;
  const mentorFact=backgroundFact(background,'mentor_identity');
  let hooks;
  if(origin.socialClass==='fallen_noble'){
    hooks=[
      hook({
        id:'lost-house-echo', title:'잃어버린 가문의 흔적', kind:'investigation', visibility:'PUBLIC',
        premise:`공개된 몰락귀족 신분과 ${cleanText(origin.region,80)} 출신이라는 사실이 가문 관련 NPC 또는 세계 사건과 다시 맞닿을 수 있다.`,
        publicAnchor, sourceFactIds:['social_class','home_region'], bridgeLayers:['NPC_PLOT','WORLD_PLOT'],
        activationCue:'가문 기록, 옛 귀족 인맥, 영지·채무·정치 사건이 현재 장면과 실제로 연결될 때',
      }),
      hook({
        id:'scattered-family-duty', title:'흩어진 가족과 남은 의무', kind:'social', visibility:'PRIVATE',
        premise:cleanText(origin.familyState), publicAnchor, sourceFactIds:['family_state'], bridgeLayers:['NPC_PLOT'],
        activationCue:'PC가 가족 사정을 공개했거나 권위 있는 전달·목격으로 현재 NPC가 알게 된 뒤 관계 선택과 연결될 때',
      }),
      hook({
        id:'fall-cause', title:'가문 몰락의 감춰진 원인', kind:'investigation', visibility:'SECRET',
        premise:cleanText(origin.pastIncident), publicAnchor, sourceFactIds:['past_incident'], bridgeLayers:['WORLD_PLOT','NPC_PLOT'],
        activationCue:'몰락 원인에 대한 실제 단서가 발견되거나 PC가 직접 조사·공개했을 때',
      }),
    ];
  }else{
    hooks=[
      hook({
        id:'regional-tie', title:'출신 지역에서 이어지는 인연', kind:'social', visibility:'PUBLIC',
        premise:`${cleanText(origin.region,80)}에서 시작된 인연이나 문제가 아카데미의 NPC·세계 사건과 다시 맞닿을 수 있다.`,
        publicAnchor, sourceFactIds:['home_region','social_class'], bridgeLayers:['NPC_PLOT','WORLD_PLOT'],
        activationCue:'같은 지역의 인물·물건·소식·세력이 현재 장면에 인과적으로 등장할 때',
      }),
      hook({
        id:'mentor-return', title:'스승에게서 이어진 과제', kind:'training', visibility:mentorFact?.visibility||'PRIVATE',
        premise:`${cleanText(origin.mentor)}에게 배운 ${uniqueStrings(origin.skillsLearned,3,80).join(', ')}의 기초가 이후 평가·훈련·만남에서 다시 의미를 가질 수 있다.`,
        publicAnchor, sourceFactIds:['mentor_identity','starting_training'], bridgeLayers:['NPC_PLOT'],
        activationCue:'스승·기초 훈련 기록을 알 수 있는 인물이 등장하거나 관련 기술을 실제로 사용할 때', audience:mentorFact?.audience,
      }),
      hook({
        id:'past-incident', title:'고향 사건의 남은 여파', kind:'investigation', visibility:'SECRET',
        premise:cleanText(origin.pastIncident), publicAnchor, sourceFactIds:['past_incident'], bridgeLayers:['WORLD_PLOT','NPC_PLOT'],
        activationCue:'과거 사건과 닮은 징후·인물·증거를 실제로 마주치거나 PC가 직접 공개했을 때',
      }),
    ];
  }
  return {
    version:1, sourceSeedTag, layers:[...FATE_PERSONAL_STORY_LAYERS],
    combinationPolicy:'PC_ORIGIN_PLOT은 현재 WORLD_PLOT 또는 NPC_PLOT과 인과적으로 맞을 때만 결합한다.',
    hooks:hooks.slice(0,4),
  };
}

export function normalizeFatePersonalStoryState(value, origin = {}, backgroundValue = null) {
  const canonical=buildFatePersonalStoryState(origin,backgroundValue);
  if(!canonical)return null;
  if(!value||Number(value.version)!==1||cleanText(value.sourceSeedTag,80)!==canonical.sourceSeedTag)return canonical;
  return canonical;
}

export function compactFatePersonalStoryForModel(creation, { existingHooks = [] } = {}) {
  const fate=creation?.mode==='fate'?creation.fateStart:null,origin=fate?.origin;
  if(!origin)return null;
  const state=normalizeFatePersonalStoryState(fate.personalStory,origin,fate.background);
  if(!state)return null;
  const materialized=new Set(safeArray(existingHooks).map((row)=>cleanText(row?.id,80)).filter(Boolean));
  const candidates=state.hooks.flatMap((row,index)=>{
    const id=`origin-candidate-${index+1}`;
    if(materialized.has(`personal:${id}`)||materialized.has(`personal:${row.id}`))return[];
    const hidden=['PRIVATE','SECRET'].includes(row.visibility);
    const title=row.visibility==='PUBLIC'?row.title:row.visibility==='LIMITED'?'공식 기록과 연결된 개인 서사 후보':row.visibility==='PRIVATE'?'비공개 개인 서사 후보':'미발견 개인 서사 후보';
    return[{
      id, status:'candidate', layer:row.layer, bridge_layers:hidden?['NPC_PLOT','WORLD_PLOT']:row.bridgeLayers, kind:hidden?'other':row.kind,
      title, visibility:row.visibility, public_anchor:row.publicAnchor,
      ...(!hidden?{source_fact_ids:row.sourceFactIds}:{}),
      activation_cue:hidden?'현재 장면에서 PC의 실제 공개·목격·권위 있는 전달·발견으로 이 후보의 근거가 생길 때':row.activationCue,
      ...(row.visibility==='PUBLIC'?{known_detail:row.premise}:{}),
      ...(row.visibility==='LIMITED'?{limited_sources:row.sourceFactIds}:{}),
      ...(hidden?{withheld:true,withheld_sources:row.sourceFactIds.length}:{}),
    }];
  });
  const policy='dormant candidates; current action first; activate at most one when causal; use existing hooks_add; hidden details omitted';
  return {
    version:FATE_PERSONAL_STORY_VERSION,
    essential:{version:1,layers:state.layers,candidates:candidates.map(({id,status,layer,bridge_layers,kind,title,visibility,public_anchor,source_fact_ids,withheld})=>({id,status,layer,bridge_layers,kind,title,visibility,public_anchor,source_fact_ids,...(withheld?{withheld:true}:{})})),policy},
    detail:{version:1,layers:state.layers,combination_policy:state.combinationPolicy,candidates,policy},
    candidateCount:candidates.length,
  };
}

export function buildFatePersonalStoryDirective({ creation, existingHooks = [] } = {}) {
  const model=compactFatePersonalStoryForModel(creation,{existingHooks});
  if(!model)return'';
  return `[P2-PR04 PERSONAL STORY HOOKS]\n${JSON.stringify(model.detail)}\n이 목록은 발동된 사건이 아니라 dormant Active Thread 후보다. 현재 USER ACTION과 장면의 실제 인과가 맞을 때만 AI가 semantic relevance를 판단해 한 턴 최대 하나를 고른다. 모든 후보를 즉시 호출하거나 현재 장소에 억지로 등장시키지 않는다. 실제 장면에서 연결을 만들었다면 기존 hooks_add에 id=personal:<candidate id>로 open/deferred 훅 하나만 기록하고, 후보라는 이유만으로 완료·관계·평판·보상을 변경하지 않는다. WORLD_PLOT/NPC_PLOT/PC_ORIGIN_PLOT은 현재 사건의 인과 안에서 결합한다. LIMITED 원문은 여기서 합치지 않으며 FATE BACKGROUND의 개별 limited record와 audience를 그대로 따른다. PRIVATE/SECRET 원문은 제공되지 않았으므로 추측·NPC 자동 지식·선제 공개를 금지한다.`;
}
