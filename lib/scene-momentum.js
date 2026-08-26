// Lumensia V1.5.6 Scene Momentum Recovery HF1
// Deterministic intent/compression + state-delta/stall accounting. No model calls.

import { scheduledIdsDueByTurnEnd } from './event-progress.js';
import { factionReputationChangeIsReal } from './faction-social-consequence.js';

export const SCENE_MOMENTUM_VERSION = '1.0';
export const ADAPTIVE_TIME_SCALE_VERSION = '2.0';

const CONSEQUENTIAL_ACTION_RE = /(?:전투(?:를|에)?\s*(?:시작|돌입|계속|참가|한다|하겠다|할지|할까)|공격(?:을|를)?\s*(?:한다|시도|시작|하겠다|하려|할지|할까|해)|결투(?!장)(?:를|을)?\s*(?:받아들|수락|거절|신청|시작|한다|하겠다|할지|할까)|대련(?:을|를)?\s*(?:한다|시작|신청|수락|거절|할지|할까)|죽이|살해|기습(?:을|를)?\s*(?:한다|시도|하겠다|할지|할까)?|협상(?:을|를)?\s*(?:한다|하고|시작|수락|거절|할지|할까)|고백(?:을|를)?\s*(?:한다|하겠다|할지|할까)|배신(?:을|를)?\s*(?:한다|하겠다|할지|할까)|계약(?:을|를)?\s*(?:맺|체결|수락|거절|서명|한다|할지|할까)|서명(?:한다|하겠다|할지|할까)|맹세(?:한다|하겠다|할지|할까)|(?:능력|스킬|권능|마법)(?:을|를)?\s*(?:사용|발동|시전|쓴|쓸|쓸지|쓸까)|도망치|싸우|\b(?:duel|attack|fight|kill|contract|confess)\b)/i;
const CONSEQUENTIAL_NEGATION_RE = /(?:(?:전투|공격|기습|결투|대련|죽이|살해|협상|고백|배신|계약|서명|맹세|사용|발동|시전|도망치|싸우)[^.!?。！？]{0,18}(?:지\s*(?:않|못)|하지\s*(?:않|못))|(?:안|못)\s*(?:싸우|공격|기습|죽이|살해|협상|고백|배신|계약|서명|맹세|사용|발동|시전|도망))/i;
const DELIBERATION_RE = /(?:할지|할까|해야\s*할지|할\s*것인지|고민|망설|결정(?:할지|해야|하지\s*못)|생각(?:해|한다|중)|수락할지|거절할지|받아들일지|whether|should\s+i|\?)/i;
const EXTERIOR_RE = /(?:^|\s)(?:밖으로|바깥으로|밖에|건물\s*밖(?:으로|에)|기숙사\s*밖(?:으로|에)|외부로)\s*(?:(?:천천히|바로|곧장|그냥)\s*)?(?:나간다|나가겠다|나갈게|나갈까|나갈지|간다|가겠다|갈게|갈까|갈지|이동한다|이동할까|이동할지|향한다|향할까|향할지)\s*[.!?。！？]*$/i;
const EXTERIOR_NEGATION_RE = /(?:밖으로|바깥으로|밖에|건물\s*밖(?:으로|에)|기숙사\s*밖(?:으로|에)|외부로)\s*(?:(?:안|못)\s*(?:나가|가|이동|향)|(?:나가|가|이동|향)(?:지(?:는)?)?\s*(?:않|못))/i;
const EXTERIOR_DELIBERATION_RE = /(?:밖으로|바깥으로|밖에|건물\s*밖(?:으로|에)|기숙사\s*밖(?:으로|에)|외부로).{0,20}(?:나갈지|나갈까|갈지|갈까|이동할지|이동할까|향할지|향할까|고민|망설|\?)/i;
const EXPLORE_RE = /^\s*(?:(?:여기저기|주변(?:을)?|일대(?:를)?|주위를?)\s*)?(?:돌아다닌다|돌아본다|배회한다|탐색한다|구경한다|둘러본다|wander(?:s|ed|ing)?|explore(?:s|d|ing)?)\s*[.!?。！？]*$/i;
const OBSERVE_RE = /^\s*(?:(?:(?:.+?)(?:을|를)\s*(?:(?:자세히|다시|재차|한\s*번|유심히|꼼꼼히|천천히)\s*)?)?(?:본다|살펴본다|살핀다|관찰한다|확인한다)|주위를\s*본다|주변을\s*본다|\b(?:look|observe|inspect)\b)\s*[.!?。！？]*$/i;
const KOREAN_DURATION_NUMBER = String.raw`(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)`;
const DURATION_NUMBER = String.raw`(?:\d+(?:\.\d+)?|${KOREAN_DURATION_NUMBER})`;
const NATIVE_DAY_DURATION = String.raw`(?:반나절|하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|보름)`;
const WEEK_DURATION = String.raw`(?:일주일|${DURATION_NUMBER}\s*주(?:일)?)(?!\s*(?:차|째))`;
const DAY_DURATION = String.raw`(?:(?:${NATIVE_DAY_DURATION}|${DURATION_NUMBER}\s*일)(?:\s*반)?)(?!\s*(?:에(?!서)|차|째|자|날))`;
const DURATION_NOUN_MODIFIER_GUARD = String.raw`(?!\s*(?:치|분(?:량)?))`;
const DURATION_ATOM = String.raw`(?:${WEEK_DURATION}|${DAY_DURATION}|${DURATION_NUMBER}\s*시간(?:(?:\s*${DURATION_NUMBER}\s*분)|(?:\s*반))?|${DURATION_NUMBER}\s*분)${DURATION_NOUN_MODIFIER_GUARD}`;
const TEMPORAL_OFFSET_QUALIFIER = String.raw`(?:(?:정도|쯤|가량)\s*)?`;
const DURATION_PREFIX = String.raw`(?:${DURATION_ATOM}|몇\s*분|잠시|잠깐|좀)`;
const SHARED_UNIT_DURATION_RANGE = String.raw`${DURATION_NUMBER}\s*(?:에서|~|〜|부터)\s*${DURATION_NUMBER}\s*(?:주(?:일)?(?!\s*(?:차|째))|일(?!\s*(?:에(?!서)|차|째|자|날))|시간|분)(?:\s*까지)?${DURATION_NOUN_MODIFIER_GUARD}`;
const DURATION_RANGE_PREFIX = String.raw`(?:(?:${DURATION_ATOM})\s*(?:에서|~|〜|부터)\s*(?:${DURATION_ATOM})(?:\s*까지)?|${SHARED_UNIT_DURATION_RANGE})`;
const DECLARED_DURATION_PREFIX = String.raw`(?:(?:최소|적어도)\s*)?(?:${DURATION_RANGE_PREFIX}|${DURATION_PREFIX})`;
const STRICT_DURATION_QUALIFIER = String.raw`(?:(?:을|를)?\s*(?:넘게|초과(?:해서|하여|해|한|하도록|로)?))`;
const INCLUSIVE_DURATION_QUALIFIER = String.raw`(?:(?:을|를)?\s*이상)`;
const DURATION_ACTIVITY_SUFFIX = String.raw`(?:동안|만|간|가량|정도|쯤|${STRICT_DURATION_QUALIFIER}|${INCLUSIVE_DURATION_QUALIFIER})`;
const CLOCK_PERIOD = String.raw`(?:오전|오후|아침|새벽|낮|저녁|밤)`;
const NUMERIC_CLOCK_EXPRESSION = String.raw`(?:(?:${CLOCK_PERIOD})\s*)?\d{1,2}(?:\s*시(?:\s*(?:\d{1,2}\s*분|반))?|:\d{2})`;
const CLOCK_EXPRESSION = String.raw`(?:정오|자정|${NUMERIC_CLOCK_EXPRESSION})`;
const SCHEDULED_CLOCK_WINDOW = String.raw`(?:(?:${CLOCK_EXPRESSION})\s*부터\s*(?:${CLOCK_EXPRESSION})\s*까지|(?:${CLOCK_EXPRESSION})\s*(?:에|부터|경|쯤|까지))`;
const RELATIVE_START_WINDOW = String.raw`(?:${DURATION_ATOM})\s*${TEMPORAL_OFFSET_QUALIFIER}(?:후|뒤|이후)(?:에)?`;
const SCHEDULED_ACTIVITY_CLOCK_RE = new RegExp(SCHEDULED_CLOCK_WINDOW,'i');
const ACTIVITY_TIMING_PREFIX = String.raw`(?:(?:${SCHEDULED_CLOCK_WINDOW})\s*)?(?:${DECLARED_DURATION_PREFIX}\s*(?:${DURATION_ACTIVITY_SUFFIX})?\s*)?`;
const TRAVEL_TIMING_PREFIX = String.raw`(?:(?:${SCHEDULED_CLOCK_WINDOW}|${RELATIVE_START_WINDOW})\s*)?(?:${DECLARED_DURATION_PREFIX}\s*(?:${DURATION_ACTIVITY_SUFFIX})?\s*)?`;
const DOWNTIME_RE = new RegExp(String.raw`^\s*(?:${DECLARED_DURATION_PREFIX}\s*(?:${DURATION_ACTIVITY_SUFFIX})?\s*)?(?:쉰다|쉬겠다|쉴게|휴식한다|휴식하겠다|휴식할게|쉬어간다|쉬어가겠다|쉬어갈게|잠을\s*(?:잔다|자겠다|잘게)|잔다|자겠다|잘게|눈을\s*(?:붙인다|붙이겠다|붙일게)|수면한다|수면하겠다|수면할게|sleep(?:s|ed|ing)?|rest(?:s|ed|ing)?)\s*[.!?。！？]*$`,'i');
const DOWNTIME_ACTION_RE = /(?:쉰다|쉬겠다|쉴게|휴식한다|휴식하겠다|휴식할게|쉬어간다|쉬어가겠다|쉬어갈게|잠을\s*(?:잔다|자겠다|잘게)|잔다|자겠다|잘게|눈을\s*(?:붙인다|붙이겠다|붙일게)|수면한다|수면하겠다|수면할게|sleep(?:s|ed|ing)?|rest(?:s|ed|ing)?)\s*[.!。！]*$/i;
const DOWNTIME_NEGATION_RE = /(?:휴식(?:하)?지\s*않|휴식\s*(?:안|않)\s*(?:하|해)|쉬지\s*않|(?:^|[\s,.;!?。！？])안\s*쉬|잠(?:을\s*)?자지\s*않|잠들지\s*않|눈을\s*붙이지\s*않|수면(?:하)?지\s*않|\b(?:do\s*not|don't|without)\s+(?:sleep|rest(?:ing)?)\b)/i;
const DOWNTIME_DELIBERATION_RE = new RegExp(String.raw`^\s*(?:${DECLARED_DURATION_PREFIX}\s*(?:${DURATION_ACTIVITY_SUFFIX})?\s*)?(?:쉴까|쉴지|휴식할까|휴식할지|쉬어볼까|잠(?:을)?\s*잘까|잠(?:을)?\s*잘지|수면할까|수면할지|(?:should\s+i|whether\s+to)\s+(?:rest|sleep))\s*[?？.!。！？]*$`,'i');
const WAIT_RE = new RegExp(String.raw`^\s*(?:${DECLARED_DURATION_PREFIX}\s*(?:${DURATION_ACTIVITY_SUFFIX})?\s*)?(?:기다린다|기다리겠다|기다릴게|기다려본다|기다려보겠다|기다려볼게|대기한다|대기하겠다|대기할게|시간을\s*(?:보낸다|보내겠다|보낼게)|가만히\s*(?:기다린다|기다리겠다|기다릴게|있는다|있겠다|있을게)|wait(?:s|ed|ing)?)\s*[.!?。！？]*$`,'i');
const WAIT_ACTION_RE = /(?:기다린다|기다리겠다|기다릴게|기다려본다|기다려보겠다|기다려볼게|대기한다|대기하겠다|대기할게|시간을\s*(?:보낸다|보내겠다|보낼게)|가만히\s*(?:기다린다|기다리겠다|기다릴게|있는다|있겠다|있을게)|wait(?:s|ed|ing)?)\s*[.!?。！？]*$/i;
const WAIT_NEGATION_RE = /(?:기다리지\s*않|대기(?:하)?지\s*않|(?:^|[\s,.;!?。！？])(?:안|못)\s*기다|\b(?:do\s*not|don't|without)\s+wait(?:ing)?\b)/i;
const WAIT_DELIBERATION_RE = new RegExp(String.raw`^\s*(?:${DECLARED_DURATION_PREFIX}\s*(?:${DURATION_ACTIVITY_SUFFIX})?\s*)?(?:기다릴까|기다릴지|대기할까|대기할지|(?:should\s+i|whether\s+to)\s+wait)\s*[?？.!。！？]*$`,'i');
const DIALOGUE_ACTION_RE = new RegExp(String.raw`(?:말을\s*(?:건다|걸겠다|걸게)|(?:대화|이야기|질문|답변|설명|상담|논의|면담|회의|브리핑)(?:을|를)?\s*${ACTIVITY_TIMING_PREFIX}(?:한다|하겠다|할게)|묻는다|묻겠다|물을게|답한다|답하겠다|답할게)\s*[.!。！]*$`,'i');
const MEAL_ACTION_RE = new RegExp(String.raw`(?:(?:아침|점심|저녁|밥|식사)(?:을|를)?\s*${ACTIVITY_TIMING_PREFIX}(?:먹는다|먹겠다|먹을게)|식사(?:를)?\s*${ACTIVITY_TIMING_PREFIX}(?:한다|하겠다|할게|마친다|마치겠다|마칠게))\s*[.!。！]*$`,'i');
const EATING_ACTION_RE = /[^\n,.!?。！？]{1,40}(?:을|를)[^\n,.!?。！？]{0,32}(?:먹는다|먹겠다|먹을게)\s*[.!。！]*$/i;
const TRAINING_ACTION_RE = new RegExp(String.raw`(?:훈련|연습|수련|단련)(?:을|를)?\s*${ACTIVITY_TIMING_PREFIX}(?:한다|하겠다|할게|시작한다|시작하겠다|시작할게|계속한다|계속하겠다|계속할게|마친다|마치겠다|마칠게)\s*[.!。！]*$`,'i');
const CLASS_ACTION_RE = new RegExp(String.raw`(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:에|을|를)?\s*${ACTIVITY_TIMING_PREFIX}(?:참석한다|참석하겠다|참석할게|참여한다|참여하겠다|참여할게|듣는다|듣겠다|들을게|수강한다|수강하겠다|수강할게|받는다|받겠다|받을게|시작한다|시작하겠다|시작할게|계속한다|계속하겠다|계속할게|마친다|마치겠다|마칠게)\s*[.!。！]*$`,'i');
const PRIOR_ACTIVITY_TIMING = ACTIVITY_TIMING_PREFIX;
const PRIOR_ACTIVITY_CONNECTOR_RE = new RegExp(String.raw`(?:(?:훈련|연습|수련|단련)(?:을|를)?\s*${PRIOR_ACTIVITY_TIMING}(?:하고|한\s*(?:뒤|후)|마치고)|(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:에|을|를)?\s*${PRIOR_ACTIVITY_TIMING}(?:하고|참석하고|참여하고|듣고|수강하고|받고|마치고|참석한\s*(?:뒤|후)|들은\s*(?:뒤|후))|(?:아침|점심|저녁|밥|식사)(?:을|를)?\s*${PRIOR_ACTIVITY_TIMING}(?:하고|먹고|마치고)|(?:대화|이야기|질문|답변|설명|상담|논의|면담|회의|브리핑)(?:을|를)?\s*${PRIOR_ACTIVITY_TIMING}(?:하고|한\s*(?:뒤|후)|마치고)|협상\s*${PRIOR_ACTIVITY_TIMING}(?:하고|한\s*(?:뒤|후)|마치고)|(?:잠을\s*${PRIOR_ACTIVITY_TIMING}자고|잠을\s*${PRIOR_ACTIVITY_TIMING}잔\s*(?:뒤|후)|(?:휴식|대기)(?:을|를)?\s*${PRIOR_ACTIVITY_TIMING}(?:하고|마치고)|쉬고|쉰\s*(?:뒤|후)|휴식하고|기다리고|대기하고)|(?:이동하고|도착하고|나가서|들어가서|가서|와서|방을\s*잡고))(?!(?:\s*)싶)`,'gi');
const CONCURRENT_ACTIVITY_CONNECTOR_RE = /(?:하면서|하며|한\s*채(?:로)?)(?=\s|[,;]|$)|(?:와|과)\s*동시에/gu;
const SLEEP_ACTION_RE = /(?:잠을\s*(?:잔다|자겠다|잘게)|잔다|자겠다|잘게|눈을\s*(?:붙인다|붙이겠다|붙일게)|수면한다|수면하겠다|수면할게)\s*[.!。！]*$/i;
const SHORT_REST_CUE_RE = /(?:잠깐|잠시|좀|몇\s*분|낮잠|쪽잠|선잠|토막잠)/i;
const DATE_QUALIFIER_RE = /(?:^|[\s,])(오늘|내일|모레|다음\s*날|익일|다음\s*주|차주)(?:은|는|엔|에는|에)?(?=\s|[,.!?。！？]|$)/gi;
const WEEKDAY_QUALIFIER_RE = /(?:^|[\s,])(?:(이번\s*주|다음\s*주|차주)(?:의)?\s*)?(월요일|화요일|수요일|목요일|금요일|토요일|일요일)(?:은|는|엔|에는|에)?(?=\s|[,.!?。！？]|$)/gi;
const ABSOLUTE_DATE_PATTERN = String.raw`(?:^|[\s,])(?:(\d{1,4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:은|는|엔|에는|에)?(?=\s|[,.!?。！？]|$)`;
const ISO_ABSOLUTE_DATE_PATTERN = String.raw`(?:^|[\s,])(\d{3,4})([-/.])(\d{1,2})\2(\d{1,2})(?:은|는|엔|에는|에)?(?=\s|[,.!?。！？]|$)`;
const QUOTED_SEGMENT_RE = /“[^”]*”|‘[^’]*’|"[^"]*"|'[^']*'|「[^」]*」|『[^』]*』/g;
const ATTRIBUTED_SPEECH_RE = /(?:^|[\s,])(?:누군가|그가|그녀가|(?!(?:나|내|저|제|우리|저희)(?:가|는|은)(?=\s))[가-힣]{1,16}(?:가|이|은|는))(?=\s)[^.!?。！？]{0,40}?(?:(?:겠다고|한다고|라고)\s*(?:외치|말하|소리치)[가-힣]{0,8}|(?:겠다는|한다는|라는)\s*(?:말|소리|이야기|얘기|소문|전언|보고|발언|위협|주장|사실|내용|계획|의도|것|걸)(?:을|를)?\s*(?:듣|접하|전해\s*듣|확인|알게\s*되|알고)[가-힣]{0,8})/gi;
const TRAVEL_RE = new RegExp(String.raw`([^\n,.!?。！？]{1,48}?)(?:으로|로|에)\s*${TRAVEL_TIMING_PREFIX}(?:간다|가자|이동한다|향한다|가본다|간다니까|go|move|head)\s*[.!?。！？]*\s*$`,'i');
const TRAVEL_DELIBERATION_RE = /([^\n,.!?。！？]{1,48}?)(?:으로|로|에)\s*(?:갈까(?:\s*말까)?|갈지|갈까요|가볼까|가볼지|가볼까요|가야\s*할까|가야\s*할지|이동할까|이동할지|이동할까요|향할까|향할지|향할까요)(?:\s*(?:고민한다|망설인다|생각한다))?\s*[.!?。！？]*\s*$/i;
const INDOOR_RE = /(개인실|방|복도|건물|기숙사|교실|강의실|도서관|로비|홀|실내|사무실|학생회실|식당|상점|창고|은신처|지하|계단)/i;
const OUTDOOR_RE = /(밖|외부|광장|거리|골목|정원|운동장|마당|야외|옥외|정문\s*밖|건물\s*앞|기숙사\s*앞|도서관\s*앞)/i;
const REGIONAL_DESTINATION_RE = /(?:^|[\s·/()_-])(?:왕도|수도|도시|마을|숲|숲길|산|산길|유적|항구|국경|영지|성채)(?:$|[\s·/()_-])/i;
const CONTINUE_ACTION_RE = /^\[LUMENSIA V1\.5\.6 CONTINUE\]/i;
const ORDINARY_NPC_STATE_FIELDS = Object.freeze(['location','status','long_term_goal','short_term_goal','goal_progress','obstacle','next_activity','next_location','next_change_minutes','last_seen']);

function norm(value='') { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function uniq(values) { return [...new Set(array(values).map(String).filter(Boolean))]; }
function stableJson(value) { try { return JSON.stringify(value ?? null); } catch { return ''; } }
function clockMinutes(value='') {
  const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!match)return null;
  const hour=Number(match[1]),minute=Number(match[2]);
  if(!Number.isInteger(hour)||!Number.isInteger(minute)||hour<0||hour>23||minute<0||minute>59)return null;
  return hour*60+minute;
}
function dateTimeMinutes(date='',time='') {
  const match=String(date||'').trim().match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/),clock=clockMinutes(time);
  if(!match||clock==null)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Math.floor(clock/60),minute=clock%60;
  if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||month<1||month>12||day<1||day>31)return null;
  const stamp=new Date(0);stamp.setUTCFullYear(year,month-1,day);stamp.setUTCHours(hour,minute,0,0);
  if(stamp.getUTCFullYear()!==year||stamp.getUTCMonth()!==month-1||stamp.getUTCDate()!==day||stamp.getUTCHours()!==hour||stamp.getUTCMinutes()!==minute)return null;
  return Math.floor(stamp.getTime()/60000);
}
function scheduleDepartmentTags(value='') {
  const text=String(value||'');
  const tags=new Set();
  if(/기사\s*(?:과|학부)?/i.test(text))tags.add('knight');
  if(/마법\s*(?:과|학부)?/i.test(text))tags.add('magic');
  if(/신학(?:부|과)?|성직(?:과|학부)?|신성(?:과|학부)?/i.test(text))tags.add('theology');
  if(/연금(?:술)?\s*(?:과|학부)?/i.test(text))tags.add('alchemy');
  if(/일반\s*(?:과|학부)?/i.test(text))tags.add('general');
  return tags;
}
export function isPcRelevantScheduleEvent(saveState={},event={}) {
  const save=object(saveState),row=object(event),pc=object(save.pc);
  if(!Object.keys(row).length)return false;
  if(row.pc_required===false||row.required_for_pc===false||row.attendance_required===false)return false;
  if(row.pc_required===true||row.required_for_pc===true||row.attendance_required===true)return true;
  const pcTokens=new Set(['pc','player','user','aaa',norm(pc.id),norm(pc.key),norm(pc.name)].filter(Boolean));
  const participants=array(row.participants).map(norm).filter(Boolean);
  if(participants.some(value=>pcTokens.has(value)))return true;
  const owner=norm(row.owner||row.audience||row.required_for||'');
  if(owner&&[...pcTokens].some(value=>value.length>=2&&owner.includes(value)))return true;
  const kind=norm(row.kind);
  if(kind==='world')return false;
  if(kind==='promise'||kind==='personal')return true;
  const eventDepartments=scheduleDepartmentTags([row.id,row.title,row.note,row.location,row.department].filter(Boolean).join(' '));
  if(eventDepartments.size){
    const [pcDepartment]=scheduleDepartmentTags(pc.department);
    return Boolean(pcDepartment&&eventDepartments.has(pcDepartment));
  }
  if(kind==='academic')return true;
  if(participants.length)return false;
  return true;
}
export function nextScheduleBoundaryMinutes(saveState={}, { futureOnly = false, action = '', intent = null, registry = {} } = {}) {
  const save=object(saveState),schedule=object(save.scheduleContext);
  if(!futureOnly&&array(schedule.due).some(event=>isPcRelevantScheduleEvent(save,event)))return 0;
  const currentDate=String(save?.world?.date||''),currentTime=String(save?.world?.time||''),now=dateTimeMinutes(currentDate,currentTime);
  if(now==null){
    const currentClock=clockMinutes(currentTime);if(currentClock==null)return null;
    let fallback=null;
    for(const event of array(schedule.upcoming)){
      if(!isPcRelevantScheduleEvent(save,event))continue;
      if(action&&isRequestedScheduledActivity(save,event,action,intent,registry))continue;
      if(currentDate&&event?.date&&String(event.date)!==currentDate)continue;
      const at=clockMinutes(event?.time);if(at==null)continue;
      const delta=at-currentClock;if(delta<=0){if(futureOnly)continue;return 0;}
      if(fallback==null||delta<fallback)fallback=delta;
    }
    return fallback;
  }
  let best=null;
  for(const event of [...array(save.scheduledEvents),...array(schedule.upcoming)]){
    if(!event||['completed','cancelled'].includes(String(event.status||'').trim().toLowerCase()))continue;
    if(!isPcRelevantScheduleEvent(save,event))continue;
    if(action&&isRequestedScheduledActivity(save,event,action,intent,registry))continue;
    const at=dateTimeMinutes(event.date||currentDate,event.time);if(at==null)continue;
    const delta=at-now;if(delta<=0){if(futureOnly)continue;return 0;}
    if(best==null||delta<best)best=delta;
  }
  return best;
}

export function scheduleBoundaryLimitMinutes(intent={}) {
  const row=object(intent),lookahead=Math.max(0,Number(row.boundaryLookaheadMinutes||0));if(lookahead>0)return Math.min(1440,lookahead);
  const minimum=Math.max(0,Number(row.minAdvanceMinutes||0));
  const maximum=Math.max(minimum,Number(array(row.suggestedAdvanceMinutes)[1]||0));
  const openEnded=row.explicitDurationMinutes==null&&row.explicitDurationUpperBoundMinutes==null&&['downtime','wait'].includes(String(row.kind||''));
  return Math.min(1440,openEnded?maximum:minimum);
}
export function activityRangeLimitMinutes(intent={}) {
  const row=object(intent),lookahead=Math.max(0,Number(row.boundaryLookaheadMinutes||0));if(lookahead>0)return Math.min(1440,lookahead);
  const minimum=Math.max(0,Number(row.minAdvanceMinutes||0)),maximum=Math.max(minimum,Number(array(row.suggestedAdvanceMinutes)[1]||0));
  return Math.min(1440,maximum);
}
function isLikelyIndoor(location='') { const text=String(location||'').trim(); return Boolean(text && INDOOR_RE.test(text) && !OUTDOOR_RE.test(text)); }
function placeAnchor(value='') {
  const text=String(value||'').trim();
  return text.match(/(?:[A-Za-z가-힣0-9]+동|기숙사|도서관|학생회관|강의동|기사과|마법과|신학부|연금(?:술)?과|식당|상점|잡화점|은신처)/i)?.[0]?.toLowerCase()||'';
}
function travelTimeProfile(location='',target='') {
  const from=String(location||'').trim(),to=String(target||'').trim();
  if(!from)return{timeProfile:'travel-unspecified',minAdvanceMinutes:3,suggestedAdvanceMinutes:[3,30]};
  const fromAnchor=placeAnchor(from),toAnchor=placeAnchor(to);
  if((fromAnchor&&toAnchor&&fromAnchor===toAnchor)||(isLikelyIndoor(from)&&/^(?:방|개인실|복도|계단|로비|홀|교실|강의실|사무실|학생회실|창고|지하)$/i.test(to))){
    return{timeProfile:'travel-within-building',minAdvanceMinutes:2,suggestedAdvanceMinutes:[2,8]};
  }
  if(REGIONAL_DESTINATION_RE.test(to))return{timeProfile:'travel-regional',minAdvanceMinutes:15,suggestedAdvanceMinutes:[15,60]};
  if(/(?:[A-Za-z가-힣0-9]+동|기숙사|도서관|학생회관|강의동|기사과|마법과|신학부|연금(?:술)?과|식당|중앙광장|운동장|정문|교정|건물)/i.test(to))return{timeProfile:'travel-campus',minAdvanceMinutes:5,suggestedAdvanceMinutes:[5,20]};
  return{timeProfile:'travel-local',minAdvanceMinutes:3,suggestedAdvanceMinutes:[3,30]};
}
function cleanTravelTarget(raw='',stripTrailingParticle=false,actorName='',compact=true) {
  let target=String(raw||'').trim().replace(/^(?:그냥|바로|곧장|이제|그럼|그리고)\s+/i,'');
  target=target.replace(new RegExp(String.raw`^(?:${DECLARED_DURATION_PREFIX})\s*(?:${DURATION_ACTIVITY_SUFFIX})\s*`,'i'),'');
  target=target.replace(/^.*?(?:와|과|랑|이랑|하고)\s+(?:함께|같이)\s+/i,'');
  target=target.replace(/^.*?(?:하지\s*않고|지\s*않고|안\s*하고|말고)\s+/i,'');
  const temporal=target.match(/(?:후|뒤|나서)\s+(.+)$/); if(temporal?.[1])target=temporal[1].trim();
  target=target.replace(/^(?:나는|난|내가|우리는|우린|PC가|Aaa가)\s+/i,'').trim();
  const savedActor=String(actorName||'').trim(),savedActorPrefix=savedActor?[`${savedActor}가`,`${savedActor}이`,`${savedActor}는`,`${savedActor}은`].find(prefix=>target.startsWith(`${prefix} `)):null;if(savedActorPrefix)target=target.slice(savedActorPrefix.length).trim();
  if(compact){const tokens=target.split(/\s+/).filter(Boolean);if(tokens.length>3)target=tokens.slice(-3).join(' ');target=target.slice(-36).trim();}
  return(stripTrailingParticle?target.replace(/(?:으로|로|에)$/u,''):target).trim();
}
const KOREAN_DURATION_VALUES = Object.freeze({한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10,열한:11,열두:12});
function durationNumber(value='') {
  const text=String(value||'').trim();
  if(!text)return null;
  if(Object.prototype.hasOwnProperty.call(KOREAN_DURATION_VALUES,text))return KOREAN_DURATION_VALUES[text];
  const number=Number(text);return Number.isFinite(number)?number:null;
}
function terminalCommittedActionScope(text='') {
  let source=String(text||'');
  QUOTED_SEGMENT_RE.lastIndex=0;source=source.replace(QUOTED_SEGMENT_RE,match=>' '.repeat(match.length));QUOTED_SEGMENT_RE.lastIndex=0;
  ATTRIBUTED_SPEECH_RE.lastIndex=0;source=source.replace(ATTRIBUTED_SPEECH_RE,match=>' '.repeat(match.length));ATTRIBUTED_SPEECH_RE.lastIndex=0;
  const body=source.replace(/[\s.!?。！？]+$/gu,''),boundaries=[...body.matchAll(/(?<!\d)[.!?。！？](?!\d)/gu)],boundary=boundaries.at(-1);
  return body.slice(boundary?(boundary.index??-1)+boundary[0].length:0).trim();
}
function activityDurationScope(text='') {
  const source=terminalCommittedActionScope(text);
  PRIOR_ACTIVITY_CONNECTOR_RE.lastIndex=0;
  let boundary=0,match;
  while((match=PRIOR_ACTIVITY_CONNECTOR_RE.exec(source)))boundary=match.index+match[0].length;
  PRIOR_ACTIVITY_CONNECTOR_RE.lastIndex=0;
  return source.slice(boundary);
}
function maskNegatedTimedClauses(text='') {
  const negatedTimedClause=new RegExp(String.raw`(?:${DURATION_RANGE_PREFIX}|${DURATION_ATOM})\s*(?:${DURATION_ACTIVITY_SUFFIX})?[^,.!?。！？]{0,64}?(?:하지\s*않고|지\s*않고|(?<![가-힣])안\s*하고|(?<![가-힣])말고)`,'gi');
  const source=String(text||'');
  return source.replace(negatedTimedClause,(match,offset)=>{
    const later=source.slice(Number(offset)+match.length),laterDuration=new RegExp(DURATION_ATOM).test(later);
    return /동안/.test(match)&&!laterDuration?match:' ';
  });
}
function waitActivityScope(text='') {
  const source=activityDurationScope(text),matches=[...source.matchAll(/(?:(?:기다리|대기(?:하)?)지\s*않고|(?:^|[\s,])(?:안|못)\s*(?:기다리고|대기하고))/gi)],match=matches.at(-1);
  return match?source.slice((match.index??0)+match[0].length):source;
}
function selectedActivityDateQualifier(text='') {
  const matches=[...String(text||'').matchAll(DATE_QUALIFIER_RE)];
  DATE_QUALIFIER_RE.lastIndex=0;
  return String(matches.at(-1)?.[1]||'').replace(/\s+/g,'');
}
function weekdayIndex(value='',currentDate='') {
  const normalized=String(value||'').trim().toLowerCase().replace(/요일$/,'');
  const aliases={월:0,화:1,수:2,목:3,금:4,토:5,일:6,monday:0,tuesday:1,wednesday:2,thursday:3,friday:4,saturday:5,sunday:6,mon:0,tue:1,wed:2,thu:3,fri:4,sat:5,sun:6};
  if(Object.prototype.hasOwnProperty.call(aliases,normalized))return aliases[normalized];
  const start=dateTimeMinutes(currentDate,'00:00');if(start==null)return null;
  return(new Date(start*60000).getUTCDay()+6)%7;
}
function selectedActivityWeekday(text='',currentDate='',currentWeekday='') {
  const matches=[...String(text||'').matchAll(WEEKDAY_QUALIFIER_RE)];WEEKDAY_QUALIFIER_RE.lastIndex=0;const match=matches.at(-1);if(!match)return null;
  const current=weekdayIndex(currentWeekday,currentDate),target=weekdayIndex(match[2]);if(current==null||target==null)return null;
  const scope=String(match[1]||'').replace(/\s+/g,''),sameWeek=target-current;
  const offset=scope==='다음주'||scope==='차주'?7-current+target:scope==='이번주'?sameWeek:(sameWeek+7)%7;
  return{scope,weekday:String(match[2]||''),offsetDays:offset};
}
function absoluteCalendarDateOffsetDays(text='',currentDate='') {
  const source=String(text||''),current=String(currentDate||'').trim().match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/),korean=[...source.matchAll(new RegExp(ABSOLUTE_DATE_PATTERN,'g'))].map(match=>({index:match.index??-1,year:match[1],month:match[2],day:match[3]})),iso=[...source.matchAll(new RegExp(ISO_ABSOLUTE_DATE_PATTERN,'g'))].map(match=>({index:match.index??-1,year:match[1],month:match[3],day:match[4]})),selected=[...korean,...iso].sort((a,b)=>a.index-b.index).at(-1);
  if(!current||!selected)return null;
  let year=Number(selected.year||current[1]);const month=Number(selected.month),day=Number(selected.day),currentStart=dateTimeMinutes(currentDate,'00:00');
  let targetStart=dateTimeMinutes(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,'00:00');
  if(currentStart==null||targetStart==null)return null;
  if(!selected.year&&targetStart<currentStart){year+=1;targetStart=dateTimeMinutes(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,'00:00');if(targetStart==null)return null;}
  return Math.trunc((targetStart-currentStart)/1440);
}
function relativeCalendarDateOffsetDays(text='',currentDate='') {
  const matches=[...String(text||'').matchAll(new RegExp(`(${DURATION_NUMBER})\\s*(년|개월|달)\\s*(?:후|뒤|이후)(?:에)?`,'g'))],match=matches.at(-1);if(!match)return null;
  const amount=durationNumber(match[1]);if(amount==null||amount<=0)return null;
  const current=String(currentDate||'').trim().match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if(!current)return Math.round(amount*(match[2]==='년'?365:30));
  const year=Number(current[1]),month=Number(current[2])-1,day=Number(current[3]),targetYear=year+(match[2]==='년'?amount:0),targetMonth=month+(match[2]==='년'?0:amount),lastTargetDay=new Date(Date.UTC(targetYear,targetMonth+1,0)).getUTCDate(),targetDay=Math.min(day,lastTargetDay),start=Date.UTC(year,month,day),target=Date.UTC(targetYear,targetMonth,targetDay);
  return Math.max(0,Math.round((target-start)/86400000));
}
function selectedActivityDateOffsetDays(text='',currentDate='',currentWeekday='') {
  const absoluteOffset=absoluteCalendarDateOffsetDays(text,currentDate);if(absoluteOffset!=null)return absoluteOffset;
  const relativeCalendarOffset=relativeCalendarDateOffsetDays(text,currentDate);if(relativeCalendarOffset!=null)return relativeCalendarOffset;
  const weekday=selectedActivityWeekday(text,currentDate,currentWeekday);if(weekday)return weekday.offsetDays;
  const selected=selectedActivityDateQualifier(text);
  if(['내일','다음날','익일'].includes(selected))return 1;
  if(selected==='모레')return 2;
  if(['다음주','차주'].includes(selected))return 7;
  return 0;
}
function selectedActivityDateIsFuture(text='',currentDate='',currentWeekday='') { return selectedActivityDateOffsetDays(text,currentDate,currentWeekday)>0; }
function hasCommittedConsequentialAction(text='') {
  let source=activityDurationScope(text).replace(QUOTED_SEGMENT_RE,' ').replace(ATTRIBUTED_SPEECH_RE,' ');
  source=source.replace(new RegExp(CONSEQUENTIAL_NEGATION_RE.source,'gi'),' ');
  return CONSEQUENTIAL_ACTION_RE.test(source);
}
function durationExpressionMinutes(text='') {
  const source=String(text||'').trim();
  if(source==='일주일')return 10080;
  const weekMatch=source.match(new RegExp(`^(${DURATION_NUMBER})\\s*주(?:일)?$`));if(weekMatch){const weeks=durationNumber(weekMatch[1]),total=Math.round(Number(weeks||0)*10080);return Number.isFinite(total)?Math.max(0,total):null;}
  const namedDayMatch=source.match(new RegExp(`^(${NATIVE_DAY_DURATION})(?:\\s*(반))?$`));
  if(namedDayMatch){const days={반나절:0.5,하루:1,이틀:2,사흘:3,나흘:4,닷새:5,엿새:6,이레:7,여드레:8,아흐레:9,열흘:10,보름:15}[namedDayMatch[1]];return days*1440+(namedDayMatch[2]?720:0);}
  const dayMatch=source.match(new RegExp(`^(${DURATION_NUMBER})\\s*일(?:\\s*(반))?$`));
  if(dayMatch){const days=durationNumber(dayMatch[1]),total=Math.round(Number(days||0)*1440)+(dayMatch[2]?720:0);return Number.isFinite(total)?Math.max(0,total):null;}
  const match=source.match(new RegExp(`^(${DURATION_NUMBER})\\s*시간(?:\\s*(?:(${DURATION_NUMBER})\\s*분|(반)))?$|^(${DURATION_NUMBER})\\s*분$`));if(!match)return null;
  const hours=durationNumber(match[1]),minutes=durationNumber(match[2]??match[4]),half=match[3]?30:0,total=Math.round(Number(hours||0)*60+Number(minutes||0)+half);
  return Number.isFinite(total)?Math.max(0,total):null;
}
function maskCalendarDayExpressions(text='') {
  return String(text||'').replace(new RegExp(ISO_ABSOLUTE_DATE_PATTERN,'g'),' ').replace(/(?:\d{1,4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일(?=\s*(?:에|에는|엔|동안|오전|오후|아침|새벽|저녁|밤|정오|자정|\d{1,2}\s*(?:시|:)|$))/g,' ');
}
function explicitDurationRangeMatch(text='') {
  const source=maskCalendarDayExpressions(text),nonActivitySuffix=String.raw`(?:${TEMPORAL_OFFSET_QUALIFIER}(?:전(?:에)?|이전|후(?:에)?|뒤(?:에)?)|마다|간격(?:으로)?|씩|짜리)`,compactMatch=source.match(new RegExp(`(한두|두세|서너)\\s*(시간|분)(?!\\s*${nonActivitySuffix})`));
  if(compactMatch){const ranges={한두:[1,2],두세:[2,3],서너:[3,4]},multiplier=compactMatch[2]==='시간'?60:1,range=ranges[compactMatch[1]];return{match:compactMatch[0],range:range.map(value=>value*multiplier)};}
  const fullPattern=new RegExp(`(${DURATION_ATOM})\\s*(?:에서|~|〜|부터)\\s*(${DURATION_ATOM})(?:\\s*까지)?(?!\\s*${nonActivitySuffix})`),fullMatch=source.match(fullPattern);
  if(fullMatch){const first=durationExpressionMinutes(fullMatch[1]),second=durationExpressionMinutes(fullMatch[2]);if(first!=null&&second!=null)return{match:fullMatch[0],range:[Math.min(first,second),Math.max(first,second)]};}
  const sharedPattern=new RegExp(`(${DURATION_NUMBER})\\s*(?:에서|~|〜|부터)\\s*(${DURATION_NUMBER})\\s*(주(?:일)?(?!\\s*(?:차|째))|일(?!\\s*(?:에(?!서)|차|째|자|날))|시간|분)(?:\\s*까지)?${DURATION_NOUN_MODIFIER_GUARD}(?!\\s*${nonActivitySuffix})`),sharedMatch=source.match(sharedPattern);if(!sharedMatch)return null;
  const multiplier=sharedMatch[3].startsWith('주')?10080:sharedMatch[3]==='일'?1440:sharedMatch[3]==='시간'?60:1,first=durationNumber(sharedMatch[1]),second=durationNumber(sharedMatch[2]);if(first==null||second==null)return null;
  return{match:sharedMatch[0],range:[Math.round(Math.min(first,second)*multiplier),Math.round(Math.max(first,second)*multiplier)]};
}
function durationUpperBoundMatches(text='') {
  const source=maskCalendarDayExpressions(text),pattern=new RegExp(`(?:최대\\s*(${DURATION_ATOM})|(${DURATION_ATOM})\\s*(미만|이내|이하))`,'g');
  return[...source.matchAll(pattern)].map(match=>{const minutes=durationExpressionMinutes(match[1]||match[2]),exclusive=match[3]==='미만';return{match:match[0],minutes,maximum:minutes==null?null:Math.max(0,minutes-(exclusive?1:0)),exclusive};}).filter(row=>row.minutes!=null);
}
function parseExplicitDurationRangeMinutes(text='') { const scope=maskNegatedTimedClauses(activityDurationScope(text));return durationUpperBoundMatches(scope).length?parseExplicitDurationBounds(scope):explicitDurationRangeMatch(scope)?.range||null; }
function parseExplicitDurationUpperBoundMinutes(text='') { const scope=maskNegatedTimedClauses(activityDurationScope(text));return durationUpperBoundMatches(scope).length?parseExplicitDurationBounds(scope)?.[1]??null:null; }
function parseExplicitDurationTotal(text='') {
  return parseExplicitDurationBounds(text)?.[1]??null;
}
function parseLinearExplicitDurationBounds(text='') {
  const temporalRangeQualifier=new RegExp(`(?:${DURATION_RANGE_PREFIX})\\s*${TEMPORAL_OFFSET_QUALIFIER}(?=(?:전(?:에)?|이전|후(?:에)?|뒤(?:에)?))`,'g');
  const temporalQualifier=new RegExp(`(?:${DURATION_ATOM})(?=\\s*${TEMPORAL_OFFSET_QUALIFIER}(?:전(?:에)?|이전|후(?:에)?|뒤(?:에)?))`,'g');
  const cadenceRangeQualifier=new RegExp(`(?:${DURATION_RANGE_PREFIX})(?=\\s*(?:마다|간격(?:으로)?|씩))`,'g');
  const cadenceQualifier=new RegExp(`(?:${DURATION_ATOM})(?=\\s*(?:마다|간격(?:으로)?|씩))`,'g');
  const objectModifierRangeQualifier=new RegExp(`(?:${DURATION_RANGE_PREFIX})(?=\\s*짜리)`,'g');
  const objectModifierQualifier=new RegExp(`(?:${DURATION_ATOM})(?=\\s*짜리)`,'g');
  const clockMinute=new RegExp(`(?:^|\\s)(?:오전|오후|아침|새벽|저녁|밤)?\\s*\\d{1,2}\\s*시\\s*${DURATION_NUMBER}\\s*분(?=\\s*(?:에|부터|까지|경|쯤|시작|개시))`,'g');
  let unqualified=maskCalendarDayExpressions(maskNegatedTimedClauses(text)).replace(temporalRangeQualifier,'').replace(temporalQualifier,'').replace(cadenceRangeQualifier,'').replace(cadenceQualifier,'').replace(objectModifierRangeQualifier,'').replace(objectModifierQualifier,'').replace(clockMinute,' '),minimum=0,maximum=0,found=false,rangeMatch;
  for(const upper of durationUpperBoundMatches(unqualified)){maximum+=upper.maximum;found=true;unqualified=unqualified.replace(upper.match,' ');}
  while((rangeMatch=explicitDurationRangeMatch(unqualified))){minimum+=rangeMatch.range[0];maximum+=rangeMatch.range[1];found=true;unqualified=unqualified.replace(rangeMatch.match,' ');}
  const durations=new RegExp(`(${DURATION_ATOM})`,'g');
  for(const match of unqualified.matchAll(durations)){
    const minutes=durationExpressionMinutes(match[1]);if(minutes==null)continue;
    minimum+=minutes;maximum+=minutes;found=true;
  }
  return found?[Math.max(0,Math.round(minimum)),Math.max(0,Math.round(maximum))]:null;
}
function parseExplicitDurationBounds(text='') {
  const source=String(text||''),concurrentSegments=source.split(CONCURRENT_ACTIVITY_CONNECTOR_RE);
  if(concurrentSegments.length>1){
    const bounds=concurrentSegments.map(parseLinearExplicitDurationBounds).filter(Boolean);
    if(bounds.length)return[Math.max(...bounds.map(row=>row[0])),Math.max(...bounds.map(row=>row[1]))];
  }
  return parseLinearExplicitDurationBounds(source);
}
function parseExplicitDurationMinutes(text='') { return parseExplicitDurationTotal(activityDurationScope(text)); }
function parseDurationLowerBound(text='', { scopeTerminal = true } = {}) {
  const durationScope=scopeTerminal?activityDurationScope(text):String(text||''),source=maskCalendarDayExpressions(maskNegatedTimedClauses(durationScope)),patterns=[
    {re:new RegExp(`(?:최소|적어도)\\s*(${DURATION_ATOM})`,'g'),inclusive:true},
    {re:new RegExp(`(${DURATION_ATOM})\\s*${INCLUSIVE_DURATION_QUALIFIER}`,'g'),inclusive:true},
    {re:new RegExp(`(${DURATION_ATOM})\\s*${STRICT_DURATION_QUALIFIER}`,'g'),inclusive:false},
  ],matches=[];
  for(const pattern of patterns)for(const match of source.matchAll(pattern.re))matches.push({index:match.index??-1,minutes:durationExpressionMinutes(match[1]),inclusive:pattern.inclusive});
  const selected=matches.filter(row=>row.minutes!=null).sort((a,b)=>a.index-b.index).at(-1);return selected?{minutes:Math.max(0,selected.minutes),inclusive:selected.inclusive}:null;
}
function parseRelativeStartOffsetMinutes(text='', { scopeTerminal = true } = {}) {
  const source=scopeTerminal?activityDurationScope(text):String(text||''),matches=[...source.matchAll(new RegExp(`(${DURATION_ATOM})\\s*${TEMPORAL_OFFSET_QUALIFIER}(?:후|뒤|이후)(?:에)?`,'g'))],match=matches.at(-1);
  if(!match)return null;
  const total=durationExpressionMinutes(match[1]);
  return total>0?total:null;
}
function precedingActivitySubjectProbe(segment='') {
  return String(segment||'').replace(/참석한\s*(?:뒤|후)\s*$/u,'참석한다').replace(/들은\s*(?:뒤|후)\s*$/u,'듣는다').replace(/잔\s*(?:뒤|후)\s*$/u,'잔다').replace(/쉰\s*(?:뒤|후)\s*$/u,'쉰다').replace(/한\s*(?:뒤|후)\s*$/u,'한다').replace(/듣고\s*$/u,'듣는다').replace(/먹고\s*$/u,'먹는다').replace(/자고\s*$/u,'잔다').replace(/쉬고\s*$/u,'쉰다').replace(/기다리고\s*$/u,'기다린다').replace(/마치고\s*$/u,'마친다').replace(/([가-힣]+)하고\s*$/u,'$1한다');
}
function parsePrecedingExplicitDurationBounds(text='',currentTime='',actorName='',currentDate='',currentWeekday='') {
  const source=terminalCommittedActionScope(text);let boundary=0,minimum=0,maximum=0,matched=false;
  PRIOR_ACTIVITY_CONNECTOR_RE.lastIndex=0;
  const connectors=[...source.matchAll(PRIOR_ACTIVITY_CONNECTOR_RE)];
  PRIOR_ACTIVITY_CONNECTOR_RE.lastIndex=0;
  for(const match of connectors){
    const end=match.index+match[0].length,segment=source.slice(boundary,end),explicit=parseExplicitDurationBounds(segment),durationLowerBound=parseDurationLowerBound(segment,{scopeTerminal:false}),strictLowerBound=durationLowerBound?.minutes??null,clockInterval=parseExplicitClockIntervalTiming(segment,currentTime,{scopeTerminal:false,currentDate,currentWeekday}),defaults=/(?:훈련|연습|수련|단련)/.test(match[0])?[30,120]:/(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)/.test(match[0])?[45,120]:/(?:아침|점심|저녁|밥|식사)/.test(match[0])?[20,45]:/(?:대화|이야기|질문|답변|설명|상담|논의|면담|회의|브리핑|협상)/.test(match[0])?[2,10]:/(?:잠을|잔\s*(?:뒤|후))/.test(match[0])?[240,480]:/(?:휴식|쉬고|쉰\s*(?:뒤|후))/.test(match[0])?[30,240]:/(?:대기|기다리고)/.test(match[0])?[10,60]:/(?:(?:으로|로|에)\s*(?:이동하고|도착하고|나가서|들어가서|가서)|방을\s*잡고)/.test(segment)?[3,30]:[0,0],strictMinimum=strictLowerBound==null?null:strictLowerBound+(durationLowerBound.inclusive?0:1),bounds=clockInterval?[clockInterval.minutes,clockInterval.minutes]:strictMinimum==null?explicit||defaults:[strictMinimum,Math.max(strictMinimum,defaults[1])],relativeStart=parseRelativeStartOffsetMinutes(segment,{scopeTerminal:false}),dateStart=selectedActivityDateIsFuture(segment,currentDate,currentWeekday)?parseDateQualifiedStartOffsetMinutes(segment,currentTime,{scopeTerminal:false,currentDate,currentWeekday}):null,clockStart=parseFutureClockOffsetMinutes(segment,currentTime,{scopeTerminal:false,currentDate,currentWeekday}),startOffset=relativeStart??dateStart??clockStart;
    if(hasThirdPartyTimedSubject(precedingActivitySubjectProbe(segment),actorName)){boundary=end;continue;}
    if(startOffset!=null){minimum=Math.max(minimum,startOffset);maximum=Math.max(maximum,startOffset);}
    minimum+=bounds[0];maximum+=bounds[1];matched=true;boundary=end;
  }
  return matched?[minimum,maximum]:null;
}
function clockExpressionMinutes(marker='',hourValue='',minuteValue='0') {
  const rawHour=Number(hourValue),minute=Number(minuteValue||0),period=String(marker||''),normalizedPeriod=/^(?:오전|아침|새벽)$/.test(period)?'am':/^(?:오후|낮|저녁|밤)$/.test(period)?'pm':'';
  if(!Number.isInteger(rawHour)||!Number.isInteger(minute)||minute<0||minute>59)return null;
  if(period==='밤'&&(rawHour===12||rawHour<=5)){if(rawHour<1||rawHour>12)return null;return(rawHour===12?0:rawHour)*60+minute;}
  if(normalizedPeriod){if(rawHour<1||rawHour>12)return null;return(rawHour%12+(normalizedPeriod==='pm'?12:0))*60+minute;}
  if(rawHour<0||rawHour>23)return null;
  return rawHour*60+minute;
}
function clockTokenParts(token='') {
  const named=String(token||'').trim();if(named==='정오')return{marker:'named',named:true,minutes:720};if(named==='자정')return{marker:'named',named:true,minutes:0};
  const match=String(token||'').trim().match(/^(오전|오후|아침|새벽|낮|저녁|밤)?\s*(\d{1,2})(?:\s*시(?:\s*(?:(\d{1,2})\s*분|(반)))?|:(\d{2}))$/);if(!match)return null;
  return{marker:String(match[1]||''),hour:match[2],minute:match[4]?30:match[3]??match[5]??0};
}
function parseExplicitClockIntervalTiming(text='',currentTime='', { scopeTerminal = true, currentDate = '', currentWeekday = '' } = {}) {
  const source=scopeTerminal?activityDurationScope(text):String(text||''),match=source.match(new RegExp(`(?:^|\\s)(${CLOCK_EXPRESSION})\\s*부터\\s*(${CLOCK_EXPRESSION})\\s*까지`));
  if(!match){
    const deadlineMatches=[...source.matchAll(new RegExp(`(?:^|\\s)(${CLOCK_EXPRESSION})\\s*까지`,'g'))],deadline=deadlineMatches.at(-1);if(!deadline)return null;
    const parts=clockTokenParts(deadline[1]),now=clockMinutes(currentTime);if(!parts||now==null)return null;
    const end=parts.named?parts.minutes:clockExpressionMinutes(parts.marker,parts.hour,parts.minute);if(end==null)return null;
    const absoluteOffset=absoluteCalendarDateOffsetDays(source,currentDate),relativeQualifier=selectedActivityDateQualifier(source),weekdayQualifier=selectedActivityWeekday(source,currentDate,currentWeekday),dateOffset=selectedActivityDateOffsetDays(source,currentDate,currentWeekday),explicitDate=absoluteOffset!=null||Boolean(relativeQualifier)||Boolean(weekdayQualifier),elapsedDeadline=Boolean(absoluteOffset<0||(explicitDate&&dateOffset<0)||(explicitDate&&dateOffset===0&&end<now)),rollover=Boolean(!explicitDate&&((parts.named&&parts.minutes===0)||parts.marker==='새벽'||/^(?:오전|아침)$/.test(parts.marker)&&end<now||(parts.marker==='밤'&&(Number(parts.hour)===12||Number(parts.hour)<=5)))),duration=dateOffset>0?dateOffset*1440+end-now:elapsedDeadline?0:end-now+(rollover&&end<=now?1440:0);
    return{minutes:Math.max(0,duration),startOffsetSuppressed:true,deadline:true,elapsedDeadline};
  }
  const startParts=clockTokenParts(match[1]),endParts=clockTokenParts(match[2]);if(!startParts||!endParts)return null;
  const startMarker=startParts.marker,explicitEndMarker=endParts.marker,endMarker=explicitEndMarker||(startParts.named&&startParts.minutes===720?'오후':startMarker);
  const start=startParts.named?startParts.minutes:clockExpressionMinutes(startMarker,startParts.hour,startParts.minute),end=endParts.named?endParts.minutes:clockExpressionMinutes(endMarker,endParts.hour,endParts.minute);
  if(start==null||end==null)return null;
  let duration=end-start;
  if(duration<=0&&startMarker&&!explicitEndMarker&&!endParts.named){const rawEnd=Number(endParts.hour),unmarkedEnd=rawEnd===12&&/^(?:오후|저녁|밤)$/.test(startMarker)?0:clockExpressionMinutes('',endParts.hour,endParts.minute),amAlternative=/^(?:오전|아침)$/.test(startMarker)&&rawEnd>=1&&rawEnd<=11?unmarkedEnd+720:unmarkedEnd;duration=amAlternative>start?amAlternative-start:amAlternative+1440-start;}
  if(duration<=0&&(startParts.named||endParts.named||(startMarker&&explicitEndMarker)||(!startMarker&&!explicitEndMarker)))duration+=1440;
  if(!(duration>0&&duration<=1440))return null;
  const now=clockMinutes(currentTime);if(now==null||selectedActivityDateIsFuture(text,currentDate,currentWeekday))return{minutes:duration,startOffsetSuppressed:false};
  const endAbsolute=start+duration;if(now>=start&&now<endAbsolute)return{minutes:endAbsolute-now,startOffsetSuppressed:true};
  if(parseFutureClockOffsetMinutes(text,currentTime,{currentDate,currentWeekday})!=null||now<start)return{minutes:duration,startOffsetSuppressed:false};
  return{minutes:0,startOffsetSuppressed:true};
}
function stripScheduledStartExpression(text='') {
  const clock=String.raw`(?:정오|자정|${CLOCK_EXPRESSION})`;
  const relative=String.raw`(?:${DURATION_ATOM})\s*(?:후|뒤|이후)(?:에)?`;
  const source=String(text||'').trim(),stripped=source.replace(new RegExp(String.raw`(?:^|\s)${clock}\s*부터\s*${clock}\s*까지(?=\s|$)`,'g'),' ').replace(new RegExp(String.raw`(?:^|\s)${clock}\s*(?:에|부터|경|쯤|까지)(?=\s|$)`,'g'),' ').replace(new RegExp(String.raw`(?:^|\s)${clock}(?=\s|$)`,'g'),' ').replace(new RegExp(String.raw`(?:^|\s)${relative}(?=\s|$)`,'g'),' ').trim();
  return stripped===source?stripped:stripped.replace(/(?:으로|로|에)\s*$/,'');
}
function selectedActivityClock(text='', { scopeTerminal = true } = {}) {
  const raw=String(text||''),source=scopeTerminal?activityDurationScope(raw):raw;
  const named=[...source.matchAll(/(?:^|\s)(정오|자정)\s*(?=에|부터|경|쯤|시작|개시)/g)].map(match=>({index:match.index??-1,named:match[1],match}));
  const numeric=[...source.matchAll(new RegExp(`(?:^|\\s)(${NUMERIC_CLOCK_EXPRESSION})\\s*(?=에|부터|경|쯤|시작|개시)`,'g'))].map(match=>({index:match.index??-1,match}));
  const selected=[...named,...numeric].sort((a,b)=>a.index-b.index).at(-1);if(!selected)return null;
  if(selected.named)return{minutes:selected.named==='정오'?720:0,named:true};
  const parts=clockTokenParts(selected.match[1]);if(!parts)return null;
  const minutes=clockExpressionMinutes(parts.marker,parts.hour,parts.minute);
  const rollover=/^(?:오전|아침|새벽)$/.test(parts.marker)||parts.marker==='밤'&&(Number(parts.hour)===12||Number(parts.hour)<=5);
  return minutes==null?null:{minutes,named:false,rollover};
}
function parseFutureClockOffsetMinutes(text='',currentTime='', { scopeTerminal = true, currentDate = '', currentWeekday = '' } = {}) {
  const now=clockMinutes(currentTime),raw=String(text);if(now==null||selectedActivityDateIsFuture(raw,currentDate,currentWeekday))return null;
  const selected=selectedActivityClock(raw,{scopeTerminal});if(!selected)return null;
  const offset=selected.minutes-now;if(offset===0)return null;
  return offset>0?offset:selected.named||selected.rollover?offset+1440:null;
}
function hasElapsedScheduledDateStart(text='',currentTime='',currentDate='',currentWeekday='') {
  const now=clockMinutes(currentTime),selected=selectedActivityClock(text);
  const absoluteOffset=absoluteCalendarDateOffsetDays(text,currentDate);if(absoluteOffset!=null)return absoluteOffset<0||(absoluteOffset===0&&now!=null&&selected!=null&&selected.minutes<now);
  const weekday=selectedActivityWeekday(text,currentDate,currentWeekday);if(weekday)return weekday.offsetDays<0||(weekday.offsetDays===0&&now!=null&&selected!=null&&selected.minutes<now);
  return selectedActivityDateQualifier(text)==='오늘'&&now!=null&&selected!=null&&selected.minutes<now;
}
function parseDateQualifiedStartOffsetMinutes(text='',currentTime='', { scopeTerminal = true, currentDate = '', currentWeekday = '' } = {}) {
  const now=clockMinutes(currentTime),dateOffsetDays=selectedActivityDateOffsetDays(text,currentDate,currentWeekday),selected=selectedActivityClock(text,{scopeTerminal});
  if(now==null||dateOffsetDays<=0||!selected)return null;
  const offset=dateOffsetDays*1440+selected.minutes-now;
  return offset>0?offset:null;
}
function hasThirdPartyTimedSubject(text='',actorName='') {
  const raw=String(text||'');ATTRIBUTED_SPEECH_RE.lastIndex=0;const attributedReport=ATTRIBUTED_SPEECH_RE.test(raw);ATTRIBUTED_SPEECH_RE.lastIndex=0;
  const quotedReport=/(?:^|[\s,])(?:누군가|그가|그녀가|[가-힣]{1,16}(?:가|이|은|는))\s*[“"「『][^”"」』]{1,120}[”"」』][^.!?。！？]{0,60}(?:소리|말|이야기|발언)(?:을|를)?\s*(?:듣고|확인하고|알고)/.test(raw);
  const activityScoped=activityDurationScope(raw),subordinateMatches=[...activityScoped.matchAll(/(?:아서|어서|해서|라서|여서|와서|도록|으?므로|때문에|때까지)\s+/gu)],subordinateMatch=subordinateMatches.at(-1),subordinateScoped=Boolean(subordinateMatch),scoped=subordinateMatch?activityScoped.slice((subordinateMatch.index??0)+subordinateMatch[0].length):activityScoped,allowed=new Set(['나','난','내','저','제','우리','우린','저희','pc','player','aaa',norm(actorName)].filter(Boolean));
  const participantNames=['나','저','우리','저희',String(actorName||'').trim()].filter(Boolean).map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),participantPattern=participantNames.join('|'),jointPcParticipation=Boolean(participantPattern&&new RegExp(`(?:^|[\\s,])(?:${participantPattern})(?:와|과|랑|이랑|하고)(?:\\s*함께)?(?=\\s|[,.!?。！？]|$)`,'i').test(raw)&&!new RegExp(`(?:^|[\\s,])(?:${participantPattern})(?:와|과|랑|이랑|하고)\\s*(?:함께\\s*)?하지\\s*(?:않|못)`,'i').test(raw));
  const activityTopics=new Set(['잠','수면','휴식','대기','기다림','식사','아침','점심','저녁','훈련','연습','수련','단련','수업','강의','세미나','실습','오리엔테이션','교육','입학식','대화','이야기','상담','논의','면담','회의','브리핑','체력','신체','근력','지구력','민첩','마나','마력','지능','신성','오러']),trainingTopic=/(?:검술|창술|궁술|도끼술|격투술|마법|주문|보법|검기|회피|방어)$/u;
  const subjectFrom=(value)=>{let source=stripScheduledStartExpression(value).replace(DATE_QUALIFIER_RE,' ').replace(WEEKDAY_QUALIFIER_RE,' ').trim();DATE_QUALIFIER_RE.lastIndex=0;WEEKDAY_QUALIFIER_RE.lastIndex=0;source=source.replace(/^.{1,48}?(?:와는|과는|에게는|한테는|께는|에서는|으로는|로는|에는)\s+/u,'');const matches=[...source.matchAll(/(?:^|[\s,])([^\s,]{1,48}?)(가|이|은|는)\s+/gu)].filter(match=>!(match[2]==='는'&&/(?:다|하|되|겠|었|았|했)$/u.test(match[1]))),subject=norm(matches.at(-1)?.[1]||'');return activityTopics.has(subject)||trainingTopic.test(subject)?'':subject;};
  if(attributedReport||quotedReport){const reportTail=raw.match(/(?:듣고|확인하고|알고)\s+([^]*)$/)?.[1]||'',reportedSubject=subjectFrom(reportTail);return Boolean(reportedSubject&&!allowed.has(reportedSubject));}
  if(jointPcParticipation)return false;
  const terminalSubject=subjectFrom(scoped);if(terminalSubject)return!allowed.has(terminalSubject);
  const inheritedSubject=scoped===raw||subordinateScoped?'':subjectFrom(raw);return Boolean(inheritedSubject&&!allowed.has(inheritedSubject));
}
function scalarDifferent(previous,next) {
  if(next===null||next===undefined)return false;
  if(typeof next==='number')return !Number.isFinite(Number(previous))||Number(previous)!==next;
  if(typeof next==='boolean')return Boolean(previous)!==next;
  return norm(previous)!==norm(next);
}
function deltaRowsChange(rows) {
  return array(rows).some((row)=>{
    if(typeof row==='number')return Number.isFinite(row)&&row!==0;
    if(typeof row==='string')return row.trim().length>0;
    const src=object(row);
    for(const field of ['amount','delta','xp_delta','progress_delta','experience_delta']){
      if(Object.prototype.hasOwnProperty.call(src,field))return Number(src[field]||0)!==0;
    }
    return Object.keys(src).length>0;
  });
}
function goalUpdateChangesObjective(saveState,row={}) {
  const key=String(row?.npc_key||row?.key||'').trim(); if(!key)return false;
  const previous=object(saveState?.npcInnerStates?.[key]?.active_goal);
  const previousDesire=norm(previous.desire||saveState?.npcStates?.[key]?.current_goal||'');
  const requestedDesire=norm(row?.current_goal||'');
  if(row?.goal_replace===true)return true;
  if(requestedDesire&&requestedDesire!==previousDesire)return true;
  const progressDelta=Number(row?.goal_progress_delta||0); if(Number.isFinite(progressDelta)&&progressDelta!==0)return true;
  const requestedState=String(row?.goal_state||'').trim().toLowerCase();
  const previousState=String(previous.state||(previousDesire?'active':'')).trim().toLowerCase();
  if(requestedState&&requestedState!==previousState)return true;
  return false;
}
function npcStateUpdateChanges(saveState,row={}) {
  const key=String(row?.npc_key||row?.key||'').trim(); if(!key)return false;
  const previous=object(saveState?.npcStates?.[key]);
  if(goalUpdateChangesObjective(saveState,row))return true;
  return ORDINARY_NPC_STATE_FIELDS.some((field)=>Object.prototype.hasOwnProperty.call(row,field)&&scalarDifferent(previous[field],row[field]));
}
function npcRelationshipUpdateChanges(saveState,row={}) {
  const source=String(row?.source_npc_key||'').trim(),target=String(row?.target_npc_key||'').trim();if(!source||!target||source===target)return false;
  if(Number(row?.affinity_delta||0)!==0||Number(row?.trust_delta||0)!==0)return true;
  if(row?.status==null||String(row.status).trim()==='')return false;
  return scalarDifferent(saveState?.npcInnerStates?.[source]?.npc_relationships?.[target]?.status,row.status);
}
function hasCommittedDowntime(text='') { const scope=activityDurationScope(text);return(DOWNTIME_RE.test(text)||DOWNTIME_ACTION_RE.test(text))&&!DOWNTIME_NEGATION_RE.test(scope); }
function hasCommittedWait(text='') { const scope=waitActivityScope(text);return (WAIT_RE.test(text)||WAIT_ACTION_RE.test(text))&&!WAIT_NEGATION_RE.test(scope); }
function isLowValueDeliberation(text='') { return DOWNTIME_DELIBERATION_RE.test(text)||WAIT_DELIBERATION_RE.test(text); }
function namedAreaExteriorTarget(text='') {
  const matches=[...String(text||'').matchAll(/(?:^|[\s,])([A-Za-z가-힣0-9·_-]{1,32})\s+밖(?:으로|에)(?=\s)/gi)],qualifier=String(matches.at(-1)?.[1]||'').trim();
  if(!qualifier||/^(?:그냥|바로|곧장|이제|그럼|그리고|다시)$/i.test(qualifier)||/(?:건물|기숙사|개인실|방|도서관|학생회관|강의동|본관|별관|식당|상점|창고|은신처|[A-Za-z가-힣0-9]+동)$/i.test(qualifier))return'';
  return`${qualifier} 밖`;
}
function resumedTimedActionIntent(text='',resumeTimedAction={},location='',actorName='') {
  const record=object(resumeTimedAction),kind=String(record.kind||''),remaining=Math.max(0,Math.trunc(Number(record.remaining_minutes)||0)),allowedKinds=new Set(['downtime','wait','meal','training','class-attendance','dialogue','travel']);
  if(!allowedKinds.has(kind)||remaining<=0||hasThirdPartyTimedSubject(text,actorName)||!/(?:계속|이어서|이어|마저|남은)/.test(String(text||'')))return null;
  const committed={downtime:/(?:잔다|자겠다|잘게|쉰다|쉬겠다|쉴게|휴식한다|휴식하겠다|휴식할게)\s*[.!。！]*$/i,wait:/(?:기다린다|기다리겠다|기다릴게|대기한다|대기하겠다|대기할게)\s*[.!。！]*$/i,meal:/(?:먹는다|먹겠다|먹을게|식사한다|식사하겠다|식사할게)\s*[.!。！]*$/i,training:/(?:훈련한다|훈련하겠다|훈련할게|연습한다|연습하겠다|연습할게|수련한다|수련하겠다|수련할게|단련한다|단련하겠다|단련할게|계속한다)\s*[.!。！]*$/i,'class-attendance':/(?:참석한다|참석하겠다|참석할게|참여한다|참여하겠다|참여할게|듣는다|듣겠다|들을게|수강한다|수강하겠다|수강할게|계속한다)\s*[.!。！]*$/i,dialogue:/(?:대화한다|대화하겠다|대화할게|이야기한다|이야기하겠다|이야기할게|회의한다|회의하겠다|회의할게|계속한다)\s*[.!。！]*$/i,travel:/(?:간다|가겠다|갈게|이동한다|이동하겠다|이동할게|향한다|향하겠다|향할게|계속한다)\s*[.!。！]*$/i}[kind];
  if(!committed?.test(String(text||''))&&!/^\s*(?:계속|이어서|마저)\s*(?:한다|하겠다|할게)\s*[.!。！]*$/i.test(String(text||'')))return null;
  const bounded=Math.min(1440,remaining),targets={downtime:'rest-complete',wait:'time-advanced',meal:'meal-complete',training:'training-session-complete','class-attendance':'class-session-complete',dialogue:'conversation-exchange',travel:String(record.semantic_target||'declared-destination')},stops={downtime:'post-rest-meaningful-state',wait:'changed-world-or-important-interruption',meal:'meal-complete-or-meaningful-interruption',training:'training-result-or-meaningful-interruption','class-attendance':'class-result-or-meaningful-interruption',dialogue:'exchange-complete-or-important-question',travel:'declared-destination-or-meaningful-interruption'};
  return{kind,timeProfile:`resumed-${kind}`,semanticTarget:targets[kind],compression:true,minAdvanceMinutes:bounded,suggestedAdvanceMinutes:[bounded,bounded],deltaTarget:kind==='downtime'||kind==='travel'?2:1,requiresNovelty:false,stopPolicy:stops[kind],location,explicitDurationMinutes:remaining,explicitDurationRangeMinutes:null,precedingActivityMinutes:0,precedingActivityRangeMinutes:null,scheduledStartOffsetMinutes:null,dateQualifiedStart:false,resumedTimedAction:true,resumeRemainingMinutes:remaining,turnLimitTruncated:remaining>1440};
}
function eventNullMeansPause(saveState,previousRuntime,delta,turn) {
  if(turn?.event_progress!==null)return false;
  const previous=object(previousRuntime?.eventProgress);
  const priorId=norm(previous.eventInstanceId||previous.event_instance_id||''); if(!priorId)return false;
  const removed=new Set([...array(delta.active_events_remove),...array(delta.completed_events_add),...array(delta.scheduled_events_complete)].map((value)=>norm(value)).filter(Boolean));
  if(removed.has(priorId))return false;
  const dueIds=new Set(scheduledIdsDueByTurnEnd(saveState,delta.advance_minutes).map((value)=>norm(value)).filter(Boolean));
  if(dueIds.has(priorId))return true;
  const resumeKey=norm(previous.resumeKey||previous.resume_key||'');
  const activeEvents=new Set(array(saveState?.activeEvents).map((value)=>norm(value)).filter(Boolean));
  return Boolean(resumeKey&&activeEvents.has(resumeKey)&&!removed.has(resumeKey));
}

export function classifySceneIntent(action='', { location='', currentTime='', currentDate='', currentWeekday='', actorName='', resumeTimedAction=null } = {}) {
  const text=String(action||'').trim();
  const resumedIntent=resumedTimedActionIntent(text,resumeTimedAction,location,actorName);if(resumedIntent)return resumedIntent;
  const thirdPartyTimedSubject=hasThirdPartyTimedSubject(text,actorName);
  const consequential=!thirdPartyTimedSubject&&hasCommittedConsequentialAction(text);
  const exteriorMatch=EXTERIOR_RE.test(text),namedAreaExit=namedAreaExteriorTarget(text),lowValueDeliberation=isLowValueDeliberation(text),travelDeliberation=TRAVEL_DELIBERATION_RE.test(text),committedDowntime=!thirdPartyTimedSubject&&!consequential&&hasCommittedDowntime(text),committedWait=!thirdPartyTimedSubject&&hasCommittedWait(text),exploreMatch=EXPLORE_RE.test(text),observeMatch=OBSERVE_RE.test(text),dialogueMatch=!thirdPartyTimedSubject&&DIALOGUE_ACTION_RE.test(text),mealMatch=!thirdPartyTimedSubject&&(MEAL_ACTION_RE.test(text)||(EATING_ACTION_RE.test(text)&&(parseExplicitDurationBounds(activityDurationScope(text))!==null||SCHEDULED_ACTIVITY_CLOCK_RE.test(activityDurationScope(text))))),trainingMatch=!thirdPartyTimedSubject&&TRAINING_ACTION_RE.test(text),classMatch=!thirdPartyTimedSubject&&CLASS_ACTION_RE.test(text),travel=thirdPartyTimedSubject?null:text.match(TRAVEL_RE);
  const timedActivity=dialogueMatch||mealMatch||trainingMatch||classMatch,schedulableActivity=timedActivity||travel||committedDowntime||committedWait;
  const selectedActivityScope=activityDurationScope(text),clockIntervalTiming=schedulableActivity?parseExplicitClockIntervalTiming(text,currentTime,{currentDate,currentWeekday}):null,dateQualifiedStart=Boolean(schedulableActivity&&!clockIntervalTiming?.deadline&&selectedActivityDateIsFuture(selectedActivityScope,currentDate,currentWeekday)),clockIntervalMinutes=clockIntervalTiming?.minutes??null;
  const elapsedScheduledStart=Boolean(schedulableActivity&&(clockIntervalTiming?.elapsedDeadline||!clockIntervalTiming?.startOffsetSuppressed&&hasElapsedScheduledDateStart(selectedActivityScope,currentTime,currentDate,currentWeekday)));
  const durationLowerBound=(committedDowntime||committedWait||lowValueDeliberation||timedActivity||travel)&&clockIntervalMinutes==null?parseDurationLowerBound(text):null,strictDurationLowerBoundMinutes=durationLowerBound?.minutes??null,strictDurationLowerBoundInclusive=Boolean(durationLowerBound?.inclusive);
  const explicitDurationUpperBoundMinutes=(committedDowntime||committedWait||lowValueDeliberation||timedActivity||travel)&&clockIntervalMinutes==null&&strictDurationLowerBoundMinutes==null?parseExplicitDurationUpperBoundMinutes(text):null;
  const explicitDurationRangeMinutes=(committedDowntime||committedWait||lowValueDeliberation||timedActivity||travel)&&clockIntervalMinutes==null&&strictDurationLowerBoundMinutes==null?parseExplicitDurationRangeMinutes(text):null;
  const explicitDurationMinutes=(committedDowntime||committedWait||lowValueDeliberation||timedActivity||travel)?clockIntervalMinutes??(explicitDurationRangeMinutes||strictDurationLowerBoundMinutes!=null?null:parseExplicitDurationMinutes(text)):null;
  const precedingActivityBounds=parsePrecedingExplicitDurationBounds(text,currentTime,actorName,currentDate,currentWeekday),precedingActivityMinimum=precedingActivityBounds?.[0]??0,precedingActivityMinutes=precedingActivityBounds?.[1]??0,precedingActivityRangeMinutes=precedingActivityBounds&&precedingActivityBounds[0]!==precedingActivityBounds[1]?precedingActivityBounds:null;
  const relativeStartOffsetMinutes=dateQualifiedStart?null:parseRelativeStartOffsetMinutes(text);
  const scheduledStartOffsetMinutes=schedulableActivity&&!dateQualifiedStart?relativeStartOffsetMinutes??(clockIntervalTiming?.startOffsetSuppressed?null:parseFutureClockOffsetMinutes(text,currentTime,{currentDate,currentWeekday})):null;
  const dateQualifiedStartOffsetMinutes=dateQualifiedStart?parseDateQualifiedStartOffsetMinutes(selectedActivityScope,currentTime,{currentDate,currentWeekday}):null;
  const capTimedIntent=(value)=>{const guide=array(value?.suggestedAdvanceMinutes),rawMinimum=Math.max(0,Number(value?.minAdvanceMinutes||0)),rawLower=Math.max(0,Number(guide[0]||0)),rawUpper=Math.max(rawLower,Number(guide[1]||0)),turnLimitTruncated=Boolean(value?.turnLimitTruncated)||rawMinimum>1440||rawLower>1440;return{...value,strictDurationLowerBoundMinutes,strictDurationLowerBoundInclusive,explicitDurationUpperBoundMinutes,minAdvanceMinutes:Math.min(1440,rawMinimum),suggestedAdvanceMinutes:[Math.min(1440,rawLower),Math.min(1440,rawUpper)],turnLimitTruncated};};
  const timedRange=(defaultMinutes,defaultMaximum)=>{const strictMinimum=strictDurationLowerBoundMinutes==null?null:strictDurationLowerBoundMinutes+(strictDurationLowerBoundInclusive?0:1),activityMinutes=strictMinimum??explicitDurationRangeMinutes?.[0]??explicitDurationMinutes??defaultMinutes,dateStartOffset=dateQualifiedStart&&dateQualifiedStartOffsetMinutes!=null&&dateQualifiedStartOffsetMinutes<=1440?dateQualifiedStartOffsetMinutes:null,dateCompletionReachable=dateStartOffset!=null&&dateStartOffset+activityMinutes<=1440;if(dateQualifiedStart&&dateStartOffset==null)return{minutes:0,guide:[0,1440],effectiveStartOffset:null,futureReachable:false,scheduledStartOverrun:false,scheduledStartBoundaryOnly:false};if(dateQualifiedStart&&!dateCompletionReachable)return{minutes:dateStartOffset,guide:[dateStartOffset,dateStartOffset],effectiveStartOffset:dateStartOffset,futureReachable:true,scheduledStartOverrun:false,scheduledStartBoundaryOnly:true};const effectiveStartOffset=dateStartOffset??scheduledStartOffsetMinutes,scheduledStartOverrun=effectiveStartOffset!=null&&precedingActivityMinimum>effectiveStartOffset;if(scheduledStartOverrun)return{minutes:effectiveStartOffset,guide:[effectiveStartOffset,effectiveStartOffset],effectiveStartOffset,futureReachable:Boolean(dateQualifiedStart&&dateStartOffset!=null),scheduledStartOverrun,scheduledStartBoundaryOnly:false};const offsetMinimum=effectiveStartOffset??precedingActivityMinimum,offsetMaximum=effectiveStartOffset??precedingActivityMinutes,rawGuide=strictMinimum!=null?[offsetMinimum+strictMinimum,offsetMaximum+Math.max(strictMinimum,defaultMaximum)]:explicitDurationRangeMinutes?[offsetMinimum+explicitDurationRangeMinutes[0],offsetMaximum+explicitDurationRangeMinutes[1]]:explicitDurationMinutes!=null?[offsetMinimum+activityMinutes,offsetMaximum+activityMinutes]:[offsetMinimum+defaultMinutes,offsetMaximum+defaultMaximum],guide=dateQualifiedStart?[rawGuide[0],Math.min(1440,rawGuide[1])]:rawGuide;return{minutes:offsetMinimum+activityMinutes,guide,effectiveStartOffset,futureReachable:Boolean(dateQualifiedStart&&dateStartOffset!=null),scheduledStartOverrun,scheduledStartBoundaryOnly:false};};
  const questionForm=/(?:[?？]|까(?:요)?[.!。！]?)[”"']?\s*$/.test(text);
  const deliberating=(consequential&&DELIBERATION_RE.test(text))||lowValueDeliberation||travelDeliberation||(exteriorMatch&&EXTERIOR_DELIBERATION_RE.test(text))||questionForm;
  if(elapsedScheduledStart)return{kind:'decision-sensitive',timeProfile:'elapsed-scheduled-start',semanticTarget:null,compression:false,minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,0],deltaTarget:0,requiresNovelty:false,stopPolicy:'reject-elapsed-scheduled-start',location,explicitDurationMinutes,elapsedScheduledStart:true};
  if(deliberating)return{kind:'decision-sensitive',timeProfile:'same-moment',semanticTarget:null,compression:false,minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,5],deltaTarget:0,requiresNovelty:false,stopPolicy:'important-choice',location,explicitDurationMinutes};
  if(consequential){const prefixed=precedingActivityBounds?{timeProfile:'preceded-consequence',compression:true,minAdvanceMinutes:precedingActivityMinimum,suggestedAdvanceMinutes:[precedingActivityMinimum,precedingActivityMinutes+10]}:{timeProfile:'immediate-consequence',compression:false,minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,10]};return capTimedIntent({kind:'committed-consequence',...prefixed,semanticTarget:precedingActivityBounds?'resolve-committed-action-after-prefix':null,deltaTarget:1,requiresNovelty:false,stopPolicy:'resolve-committed-action-then-meaningful-choice',location,explicitDurationMinutes,precedingActivityMinutes,precedingActivityRangeMinutes});}
  if(exteriorMatch&&!namedAreaExit&&!EXTERIOR_NEGATION_RE.test(text))return{kind:'exit-exterior',timeProfile:'travel-building-exit',semanticTarget:'current-building-exterior',compression:true,minAdvanceMinutes:2,suggestedAdvanceMinutes:[2,10],deltaTarget:2,requiresNovelty:true,stopPolicy:'semantic-destination-or-meaningful-interruption',location,explicitDurationMinutes};
  if(committedDowntime){const sleepLike=SLEEP_ACTION_RE.test(text)&&!SHORT_REST_CUE_RE.test(activityDurationScope(text)),{minutes,guide,effectiveStartOffset,futureReachable,scheduledStartOverrun,scheduledStartBoundaryOnly}=timedRange(sleepLike?240:30,sleepLike?480:240),deferredDate=dateQualifiedStart&&!futureReachable;return capTimedIntent({kind:'downtime',timeProfile:dateQualifiedStart?(sleepLike?'date-qualified-sleep':'date-qualified-rest'):(sleepLike?'sleep':'rest'),semanticTarget:'rest-complete',compression:!deferredDate,minAdvanceMinutes:minutes,suggestedAdvanceMinutes:guide,boundaryLookaheadMinutes:deferredDate?1440:0,deltaTarget:deferredDate?0:2,requiresNovelty:!deferredDate,stopPolicy:'post-rest-meaningful-state',location,explicitDurationMinutes,explicitDurationRangeMinutes,precedingActivityMinutes,precedingActivityRangeMinutes,scheduledStartOffsetMinutes:effectiveStartOffset,scheduledStartOverrun,scheduledStartBoundaryOnly,dateQualifiedStart,turnLimitTruncated:deferredDate||scheduledStartBoundaryOnly});}
  if(committedWait){const {minutes,guide,effectiveStartOffset,futureReachable,scheduledStartOverrun,scheduledStartBoundaryOnly}=timedRange(10,60),deferredDate=dateQualifiedStart&&!futureReachable;return capTimedIntent({kind:'wait',timeProfile:dateQualifiedStart?'date-qualified-wait':'wait',semanticTarget:'time-advanced',compression:!deferredDate,minAdvanceMinutes:minutes,suggestedAdvanceMinutes:guide,boundaryLookaheadMinutes:deferredDate?1440:0,deltaTarget:deferredDate?0:1,requiresNovelty:!deferredDate,stopPolicy:'changed-world-or-important-interruption',location,explicitDurationMinutes,explicitDurationRangeMinutes,precedingActivityMinutes,precedingActivityRangeMinutes,scheduledStartOffsetMinutes:effectiveStartOffset,scheduledStartOverrun,scheduledStartBoundaryOnly,dateQualifiedStart,turnLimitTruncated:deferredDate||scheduledStartBoundaryOnly});}
  if(mealMatch){const {minutes,guide,effectiveStartOffset,futureReachable,scheduledStartOverrun,scheduledStartBoundaryOnly}=timedRange(20,45),deferredDate=dateQualifiedStart&&!futureReachable;return capTimedIntent({kind:'meal',timeProfile:dateQualifiedStart?'date-qualified-meal':'meal',semanticTarget:'meal-complete',compression:!deferredDate,minAdvanceMinutes:minutes,suggestedAdvanceMinutes:guide,boundaryLookaheadMinutes:deferredDate?1440:0,deltaTarget:deferredDate?0:1,requiresNovelty:false,stopPolicy:'meal-complete-or-meaningful-interruption',location,explicitDurationMinutes,explicitDurationRangeMinutes,precedingActivityMinutes,precedingActivityRangeMinutes,scheduledStartOffsetMinutes:effectiveStartOffset,scheduledStartOverrun,scheduledStartBoundaryOnly,dateQualifiedStart,turnLimitTruncated:deferredDate||scheduledStartBoundaryOnly});}
  if(trainingMatch){const {minutes,guide,effectiveStartOffset,futureReachable,scheduledStartOverrun,scheduledStartBoundaryOnly}=timedRange(30,120),deferredDate=dateQualifiedStart&&!futureReachable;return capTimedIntent({kind:'training',timeProfile:dateQualifiedStart?'date-qualified-training':'training',semanticTarget:'training-session-complete',compression:!deferredDate,minAdvanceMinutes:minutes,suggestedAdvanceMinutes:guide,boundaryLookaheadMinutes:deferredDate?1440:0,deltaTarget:deferredDate?0:1,requiresNovelty:false,stopPolicy:'training-result-or-meaningful-interruption',location,explicitDurationMinutes,explicitDurationRangeMinutes,precedingActivityMinutes,precedingActivityRangeMinutes,scheduledStartOffsetMinutes:effectiveStartOffset,scheduledStartOverrun,scheduledStartBoundaryOnly,dateQualifiedStart,turnLimitTruncated:deferredDate||scheduledStartBoundaryOnly});}
  if(classMatch){const {minutes,guide,effectiveStartOffset,futureReachable,scheduledStartOverrun,scheduledStartBoundaryOnly}=timedRange(45,120),deferredDate=dateQualifiedStart&&!futureReachable;return capTimedIntent({kind:'class-attendance',timeProfile:dateQualifiedStart?'date-qualified-class':'class',semanticTarget:'class-session-complete',compression:!deferredDate,minAdvanceMinutes:minutes,suggestedAdvanceMinutes:guide,boundaryLookaheadMinutes:deferredDate?1440:0,deltaTarget:deferredDate?0:1,requiresNovelty:false,stopPolicy:'class-result-or-meaningful-interruption',location,explicitDurationMinutes,explicitDurationRangeMinutes,precedingActivityMinutes,precedingActivityRangeMinutes,scheduledStartOffsetMinutes:effectiveStartOffset,scheduledStartOverrun,scheduledStartBoundaryOnly,dateQualifiedStart,turnLimitTruncated:deferredDate||scheduledStartBoundaryOnly});}
  if(dialogueMatch){const {minutes,guide,effectiveStartOffset,futureReachable,scheduledStartOverrun,scheduledStartBoundaryOnly}=timedRange(2,10),deferredDate=dateQualifiedStart&&!futureReachable;return capTimedIntent({kind:'dialogue',timeProfile:dateQualifiedStart?'date-qualified-dialogue':'dialogue',semanticTarget:'conversation-exchange',compression:!deferredDate,minAdvanceMinutes:minutes,suggestedAdvanceMinutes:guide,boundaryLookaheadMinutes:deferredDate?1440:0,deltaTarget:deferredDate?0:1,requiresNovelty:false,stopPolicy:'exchange-complete-or-important-question',location,explicitDurationMinutes,explicitDurationRangeMinutes,precedingActivityMinutes,precedingActivityRangeMinutes,scheduledStartOffsetMinutes:effectiveStartOffset,scheduledStartOverrun,scheduledStartBoundaryOnly,dateQualifiedStart,turnLimitTruncated:deferredDate||scheduledStartBoundaryOnly});}
  if(exploreMatch)return{kind:'explore',timeProfile:'exploration',semanticTarget:'several-nearby-points',compression:true,minAdvanceMinutes:8,suggestedAdvanceMinutes:[8,25],deltaTarget:2,requiresNovelty:true,stopPolicy:'meaningful-discovery-or-choice',location,explicitDurationMinutes};
  if(observeMatch)return{kind:'observe',timeProfile:'observation',semanticTarget:'new-or-changed-relevant-detail',compression:true,minAdvanceMinutes:1,suggestedAdvanceMinutes:[1,3],deltaTarget:1,requiresNovelty:true,stopPolicy:'new-information-or-world-advance',location,explicitDurationMinutes};
  if(travel){const withoutSchedule=stripScheduledStartExpression(travel[1]),withoutRelativeDate=withoutSchedule.replace(DATE_QUALIFIER_RE,' '),withoutWeekdayDate=withoutRelativeDate.replace(WEEKDAY_QUALIFIER_RE,' '),withoutKoreanDate=withoutWeekdayDate.replace(new RegExp(ABSOLUTE_DATE_PATTERN,'g'),' '),withoutDate=withoutKoreanDate.replace(new RegExp(ISO_ABSOLUTE_DATE_PATTERN,'g'),' '),stripDestinationParticle=withoutDate!==withoutSchedule,target=cleanTravelTarget(withoutDate,stripDestinationParticle,actorName),fullTarget=cleanTravelTarget(withoutDate,stripDestinationParticle,actorName,false);DATE_QUALIFIER_RE.lastIndex=0;WEEKDAY_QUALIFIER_RE.lastIndex=0;const time=travelTimeProfile(location,fullTarget),strictMinimum=strictDurationLowerBoundMinutes==null?null:strictDurationLowerBoundMinutes+(strictDurationLowerBoundInclusive?0:1),activityTiming=strictMinimum!=null?{...time,minAdvanceMinutes:strictMinimum,suggestedAdvanceMinutes:[strictMinimum,Math.max(strictMinimum,time.suggestedAdvanceMinutes[1])]}:explicitDurationRangeMinutes?{...time,minAdvanceMinutes:explicitDurationRangeMinutes[0],suggestedAdvanceMinutes:explicitDurationRangeMinutes}:explicitDurationMinutes!=null?{...time,minAdvanceMinutes:explicitDurationMinutes,suggestedAdvanceMinutes:[explicitDurationMinutes,explicitDurationMinutes]}:time,prefixedTiming=precedingActivityBounds?{...activityTiming,minAdvanceMinutes:precedingActivityMinimum+activityTiming.minAdvanceMinutes,suggestedAdvanceMinutes:[precedingActivityMinimum+activityTiming.suggestedAdvanceMinutes[0],precedingActivityMinutes+activityTiming.suggestedAdvanceMinutes[1]]}:activityTiming,dateStartOffset=dateQualifiedStart&&dateQualifiedStartOffsetMinutes!=null&&dateQualifiedStartOffsetMinutes<=1440?dateQualifiedStartOffsetMinutes:null,dateCompletionReachable=dateStartOffset!=null&&dateStartOffset+activityTiming.minAdvanceMinutes<=1440,scheduledStartBoundaryOnly=Boolean(dateQualifiedStart&&dateStartOffset!=null&&!dateCompletionReachable),effectiveStartOffset=dateQualifiedStart?dateStartOffset:scheduledStartOffsetMinutes,offset=effectiveStartOffset??0,deferredDate=dateQualifiedStart&&dateStartOffset==null,scheduledStartOverrun=!scheduledStartBoundaryOnly&&effectiveStartOffset!=null&&precedingActivityMinimum>effectiveStartOffset,timing=deferredDate?{...time,timeProfile:'date-qualified-travel',minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,1440]}:scheduledStartBoundaryOnly?{...activityTiming,timeProfile:'date-qualified-travel',minAdvanceMinutes:offset,suggestedAdvanceMinutes:[offset,offset]}:scheduledStartOverrun?{...activityTiming,timeProfile:dateQualifiedStart?'date-qualified-travel':activityTiming.timeProfile,minAdvanceMinutes:offset,suggestedAdvanceMinutes:[offset,offset]}:effectiveStartOffset!=null?{...activityTiming,timeProfile:dateQualifiedStart?'date-qualified-travel':activityTiming.timeProfile,minAdvanceMinutes:offset+activityTiming.minAdvanceMinutes,suggestedAdvanceMinutes:activityTiming.suggestedAdvanceMinutes.map(value=>dateQualifiedStart?Math.min(1440,offset+value):offset+value)}:prefixedTiming;return capTimedIntent({kind:'travel',...timing,semanticTarget:target||'declared-destination',compression:!deferredDate,boundaryLookaheadMinutes:deferredDate?1440:0,deltaTarget:deferredDate?0:2,requiresNovelty:false,stopPolicy:'declared-destination-or-meaningful-interruption',location,explicitDurationMinutes,explicitDurationRangeMinutes,precedingActivityMinutes,precedingActivityRangeMinutes,scheduledStartOffsetMinutes:effectiveStartOffset,scheduledStartOverrun,scheduledStartBoundaryOnly,dateQualifiedStart,turnLimitTruncated:deferredDate||scheduledStartBoundaryOnly});}
  return{kind:'generic',timeProfile:'contextual',semanticTarget:null,compression:false,minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,10],deltaTarget:1,requiresNovelty:false,stopPolicy:'important-choice-only',location,explicitDurationMinutes};
}

function scheduleActivityCategory(value='',kind='') {
  const fromText=(candidate='')=>{const text=String(candidate||'').toLowerCase();
    if(/academic|수업|강의|세미나|실습|오리엔테이션|교육|입학식/.test(text))return'class-attendance';
    if(/training|훈련|연습|수련|단련|대련/.test(text))return'training';
    if(/meal|식사|아침|점심|저녁|만찬/.test(text))return'meal';
    if(/dialogue|meeting|면담|상담|회의|대화|브리핑/.test(text))return'dialogue';
    if(/sleep|rest|수면|휴식|잠/.test(text))return'downtime';
    if(/wait|대기|기다림/.test(text))return'wait';
    if(/travel|departure|depart|이동|출발|여행|행차/.test(text))return'travel';
    return'';
  };
  return fromText(kind)||fromText(value);
}
function scheduleActivityTokens(value='') {
  const generic=new Set(['academic','class','event','schedule','필수','일정','예정','시작','참석','참여','수업','강의','세미나','실습','오리엔테이션','교육','입학식','훈련','연습','수련','단련','대련','식사','아침','점심','저녁','만찬','면담','상담','회의','대화','브리핑','수면','휴식','잠','대기','기다림','이동','출발','여행','행차','간다','가자','이동한다','향한다','가본다','잔다','쉰다','휴식한다','기다린다','대기한다','sleep','rest','wait','travel','departure','depart','go','move','head','기사과','마법과','신학부','연금술과','일반과','학부','훈련장','강의실','교실','대강당','본관','기숙사','중앙광장','오전','오후','정오','자정','오늘','내일','모레','이번','다음','하루','이틀','시간','분','일','동안','정도','가량','쯤','약','만']);
  let source=maskCalendarDayExpressions(String(value||'').toLowerCase()).replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,' ').replace(new RegExp(CLOCK_EXPRESSION,'g'),' ').replace(new RegExp(`(?:${DURATION_ATOM})\\s*(?:후|뒤|이후)(?:에)?`,'g'),' ').replace(new RegExp(DURATION_RANGE_PREFIX,'g'),' ').replace(new RegExp(DURATION_ATOM,'g'),' ');
  DATE_QUALIFIER_RE.lastIndex=0;WEEKDAY_QUALIFIER_RE.lastIndex=0;source=source.replace(DATE_QUALIFIER_RE,' ').replace(WEEKDAY_QUALIFIER_RE,' ');DATE_QUALIFIER_RE.lastIndex=0;WEEKDAY_QUALIFIER_RE.lastIndex=0;
  return [...new Set((source.match(/[가-힣a-z0-9_]+/g)||[]).map(token=>token.replace(/(?:에게서|에게|한테|께서|으로|에서|까지|부터|처럼|보다|에는|에게는|으로는|에서는|은|는|이|가|을|를|와|과|의|에)$/u,'')).filter(token=>(token.length>=2||/^\d+$/.test(token))&&!generic.has(token)&&!/(?:하게|스럽게|답게|적으로|히)$/.test(token)&&!/(?:한다|했다|듣는다|먹는다|참석한다|참여한다|시작한다|계속한다|마친다)$/.test(token)))];
}
function scheduleParticipantIdentityText(saveState={},event={},registry={}) {
  const save=object(saveState),row=object(event),labels=[];
  for(const rawKey of array(row.participants)){
    const key=String(rawKey||'').trim();if(!key)continue;
    labels.push(key,registry?.[key],save?.npcStates?.[key]?.name,save?.npcStates?.[key]?.display_name,save?.npcStates?.[key]?.displayName,save?.npcInnerStates?.[key]?.name,save?.npcInnerStates?.[key]?.display_name,save?.npcInnerStates?.[key]?.displayName);
  }
  labels.push(...array(row.participant_names));
  return [...new Set(labels.map(value=>String(value||'').trim()).filter(Boolean))].join(' ');
}
function precedingCommittedActivityClauses(action='') {
  const source=terminalCommittedActionScope(action),clauses=[];let cursor=0;
  PRIOR_ACTIVITY_CONNECTOR_RE.lastIndex=0;const connectors=[...source.matchAll(PRIOR_ACTIVITY_CONNECTOR_RE)];PRIOR_ACTIVITY_CONNECTOR_RE.lastIndex=0;
  for(const match of connectors){const end=(match.index??0)+match[0].length,clause=precedingActivitySubjectProbe(source.slice(cursor,end)).trim();if(clause)clauses.push(clause);cursor=end;}
  return clauses;
}
export function isRequestedScheduledActivity(saveState={},event={},action='',intent=null,registry={}) {
  const save=object(saveState),row=object(event),sceneIntent=object(intent||classifySceneIntent(action,{location:save?.world?.location||'',currentTime:save?.world?.time||'',currentDate:save?.world?.date||'',currentWeekday:save?.world?.weekday||'',actorName:save?.pc?.name||'',resumeTimedAction:save?.sceneRuntime?.timed_action}));
  const currentDate=String(save?.world?.date||''),now=dateTimeMinutes(currentDate,save?.world?.time),at=dateTimeMinutes(row.date||currentDate,row.time);
  if(now==null||at==null)return false;
  const eventPrimaryText=[row.id,row.title].filter(Boolean).join(' '),eventText=[eventPrimaryText,row.note,row.location,row.department,scheduleParticipantIdentityText(save,row,registry)].filter(Boolean).join(' '),eventCategory=scheduleActivityCategory(eventPrimaryText,row.kind);
  const currentWeekday=String(save?.world?.weekday||''),pcIdentityTokens=new Set(scheduleActivityTokens(save?.pc?.name||'')),eventTokens=new Set(scheduleActivityTokens(eventText)),compactEventIdentity=norm(eventText).replace(/[\s\p{P}\p{S}]+/gu,''),dayStart=dateTimeMinutes(currentDate,'00:00'),candidateRows=[{action:String(action||''),intent:sceneIntent},...precedingCommittedActivityClauses(action).map(candidateAction=>({action:candidateAction,intent:classifySceneIntent(candidateAction,{location:save?.world?.location||'',currentTime:save?.world?.time||'',currentDate,currentWeekday,actorName:save?.pc?.name||''})}))];
  for(const candidateRow of candidateRows){
    const candidateAction=candidateRow.action,candidateIntent=object(candidateRow.intent);if(candidateIntent.scheduledStartOverrun||!['class-attendance','training','meal','dialogue','downtime','wait','travel'].includes(String(candidateIntent.kind||'')))continue;
    if(eventCategory&&eventCategory!==candidateIntent.kind)continue;if(!eventCategory&&candidateIntent.kind!=='dialogue')continue;
    const offset=Number(candidateIntent.scheduledStartOffsetMinutes),dateOffsetDays=selectedActivityDateOffsetDays(candidateAction,currentDate,currentWeekday),selectedClock=selectedActivityClock(candidateAction),requestedAt=Number.isFinite(offset)&&offset>0?now+offset:candidateIntent.dateQualifiedStart&&dateOffsetDays>0&&selectedClock&&dayStart!=null?dayStart+dateOffsetDays*1440+selectedClock.minutes:null;if(requestedAt==null||at!==requestedAt)continue;
    const requestedIdentity=candidateIntent.kind==='travel'?candidateIntent.semanticTarget:activityDurationScope(candidateAction),requestedTokens=scheduleActivityTokens(requestedIdentity).filter(token=>!pcIdentityTokens.has(token));if(requestedTokens.length){if(requestedTokens.every(token=>eventTokens.has(token)||compactEventIdentity.includes(norm(token).replace(/[\s\p{P}\p{S}]+/gu,''))))return true;continue;}
    const candidates=new Set();for(const candidate of [...array(save.scheduledEvents),...array(save?.scheduleContext?.upcoming)]){
      if(!candidate||['completed','cancelled'].includes(String(candidate.status||'').trim().toLowerCase())||!isPcRelevantScheduleEvent(save,candidate))continue;if(dateTimeMinutes(candidate.date||currentDate,candidate.time)!==at)continue;
      const candidatePrimaryText=[candidate.id,candidate.title].filter(Boolean).join(' '),candidateCategory=scheduleActivityCategory(candidatePrimaryText,candidate.kind);if(candidateCategory!==candidateIntent.kind)continue;candidates.add(`${String(candidate.id||candidate.title||'').trim().toLowerCase()}|${candidate.date||currentDate}|${candidate.time||''}`);
    }
    if(candidates.size===1)return true;
  }
  return false;
}

function eventSignature(progress) {
  const row=object(progress);
  return stableJson({id:row.eventInstanceId||row.event_instance_id||null,active:row.activeBeat||row.active_beat||null,completed:array(row.completedBeats||row.completed_beats).slice(-8),paused:Boolean(row.paused)});
}

export function deriveSceneDelta({ saveState = {}, previousRuntime = {}, turn = {}, nextParticipants = null, action = '' } = {}) {
  const delta=object(turn.state_delta),beforeLocation=norm(saveState?.world?.location||''),afterLocation=norm(delta.new_location||saveState?.world?.location||'');
  const beforeParticipants=uniq(previousRuntime?.participants).sort(),afterParticipants=uniq(nextParticipants==null?beforeParticipants:nextParticipants).sort();
  const beforeSet=new Set(beforeParticipants),afterSet=new Set(afterParticipants);
  const npcEnteredKeys=afterParticipants.filter((key)=>!beforeSet.has(key)),npcLeftKeys=beforeParticipants.filter((key)=>!afterSet.has(key));
  const advanceMinutes=Math.max(0,Number(delta.advance_minutes||0));
  const previousEvent=eventSignature(previousRuntime?.eventProgress),nextEvent=eventSignature(turn?.event_progress),pausedEventNull=eventNullMeansPause(saveState,previousRuntime,delta,turn);
  const eventListsChanged=[...array(delta.active_events_add),...array(delta.active_events_remove),...array(delta.completed_events_add),...array(delta.scheduled_events_complete)].length>0;
  const relationshipChanged=array(delta.relationship_changes).length>0||array(delta.npc_relationship_changes).some((row)=>npcRelationshipUpdateChanges(saveState,row))||array(delta.faction_reputation_changes).some((row)=>factionReputationChangeIsReal(saveState,row))||array(delta.relationship_milestones_add).length>0||array(delta.intimacy_changes).length>0;
  const goalRows=array(delta.npc_state_updates),goalObjectiveChanged=goalRows.some((row)=>goalUpdateChangesObjective(saveState,row)),npcStateChanged=goalRows.some((row)=>npcStateUpdateChanges(saveState,row));
  const objectiveChanged=array(delta.hooks_add).length>0||array(delta.hooks_update).length>0||goalObjectiveChanged;
  const newInformation=array(delta.pc_knowledge_add).length>0||array(delta.memories_add).length>0||array(delta.hooks_add).length>0||array(delta.hooks_update).length>0;
  const resourceChanged=Number(delta.fatigue_delta||0)!==0||Number(delta.gold_delta||0)!==0||array(delta.items_add).length>0||array(delta.items_remove).length>0;
  const growthChanged=deltaRowsChange(delta.stat_progress)||deltaRowsChange(delta.skill_experience)||deltaRowsChange(delta.skill_learning)||deltaRowsChange(delta.awakening_progress)||deltaRowsChange(delta.talent_evolution);
  const scheduleChanged=array(delta.scheduled_events_add).length>0||array(delta.scheduled_events_remove).length>0||array(delta.scheduled_events_complete).length>0||array(delta.npc_schedule_updates).length>0;
  const worldThreadChanged=array(delta.world_arcs_add).length>0||array(delta.world_arcs_remove).length>0||array(delta.rumors_add).length>0||array(delta.delayed_consequences_add).length>0;
  const npcAction=array(turn?.scene).some((row)=>row?.kind==='dialogue'&&Boolean(row?.speaker_key||String(row?.speaker_name||'').trim()));
  const dangerChanged=scalarDifferent(saveState?.pc?.status,delta.pc_status)||array(delta.active_events_add).some((x)=>/(전투|습격|위험|combat|attack|danger)/i.test(String(x)));
  const environmentChanged=array(delta.items_add).length>0||array(delta.items_remove).length>0;
  const eventProgressChanged=eventListsChanged||(!pausedEventNull&&((Boolean(previousRuntime?.eventProgress)||Boolean(turn?.event_progress))&&previousEvent!==nextEvent));
  const flags={locationChanged:Boolean(delta.new_location)&&beforeLocation!==afterLocation,timeAdvanced:advanceMinutes>0,npcEntered:npcEnteredKeys.length>0,npcLeft:npcLeftKeys.length>0,npcAction,npcStateChanged,newInformation,eventProgress:eventProgressChanged,relationshipChanged,objectiveChanged,resourceChanged,growthChanged,scheduleChanged,worldThreadChanged,dangerChanged,environmentChanged};
  const score=Object.values(flags).filter(Boolean).length;
  const structuralScore=[flags.locationChanged,flags.timeAdvanced,flags.npcEntered,flags.npcLeft,flags.npcStateChanged,flags.newInformation,flags.eventProgress,flags.relationshipChanged,flags.objectiveChanged,flags.resourceChanged,flags.growthChanged,flags.scheduleChanged,flags.worldThreadChanged,flags.dangerChanged,flags.environmentChanged].filter(Boolean).length;
  const meaningfulStop=array(turn?.choices).some((choice)=>String(choice||'').trim().length>0);
  const intent=classifySceneIntent(action,{location:saveState?.world?.location||'',currentTime:saveState?.world?.time||'',currentDate:saveState?.world?.date||'',currentWeekday:saveState?.world?.weekday||'',actorName:saveState?.pc?.name||'',resumeTimedAction:saveState?.sceneRuntime?.timed_action}),target=Math.max(0,Number(intent.deltaTarget||0)),metTarget=meaningfulStop||target===0||score>=target;
  return{version:SCENE_MOMENTUM_VERSION,intent:intent.kind,target,score,structuralScore,metTarget,flags,advanceMinutes,beforeLocation:saveState?.world?.location||null,afterLocation:delta.new_location||saveState?.world?.location||null,npcEnteredKeys,npcLeftKeys};
}

export function updateSceneMomentum(previousRuntime = {}, deltaRecord = {}, { turnNumber = 0 } = {}) {
  const previous=object(previousRuntime?.momentum),target=Math.max(0,Number(deltaRecord?.target||0)),score=Math.max(0,Number(deltaRecord?.score||0));
  const metTarget=typeof deltaRecord?.metTarget==='boolean'?deltaRecord.metTarget:(target===0||score>=target),missed=!metTarget;
  const stallStreak=missed?Math.min(9,Math.max(0,Number(previous.stall_streak||0))+1):0;
  const recent=[...array(previous.recent_deltas),{turn:Number(turnNumber||0),intent:deltaRecord?.intent||'generic',score,structural_score:Math.max(0,Number(deltaRecord?.structuralScore||0)),target,met_target:metTarget,flags:object(deltaRecord?.flags),advance_minutes:Math.max(0,Number(deltaRecord?.advanceMinutes||0)),location:deltaRecord?.afterLocation||null}].slice(-3);
  return{version:SCENE_MOMENTUM_VERSION,stall_streak:stallStreak,pressure:stallStreak>=2?'required':stallStreak===1?'watch':'normal',last_score:score,last_structural_score:Math.max(0,Number(deltaRecord?.structuralScore||0)),last_target:target,last_intent:deltaRecord?.intent||'generic',recent_deltas:recent};
}

export function buildSceneMomentumDirective({ action = '', saveState = {}, registry = {} } = {}) {
  if(CONTINUE_ACTION_RE.test(String(action||'').trim()))return ['[SCENE MOMENTUM V1 — CONTINUE HARD FREEZE]','INTENT=continue-freeze','- CONTINUE는 직전 응답의 같은 순간/같은 장면을 문학적으로 이어 쓰는 전용 흐름이다. 시간·위치·NPC 출입/행동·관계·기억·성장·일정·훅·이벤트 진행 같은 새 상태 변화를 요구하거나 암시하지 않는다.','- 새로운 우연 사건/NPC 개입/Scene Stall 복구를 실행하지 않는다. 직전 장면의 이미 발생한 내용만 확장하고 PC의 새 선택·대사·감정도 만들지 않는다.','- 새 NPC 대사·발화·몸짓·이동·결정·도착·퇴장을 추가하지 않는다. 직전 응답의 기존 NPC 대사도 인용·반복·재출력하지 않는다. 직전 응답에서 이미 시작된 한 문장/한 행동의 표현 보강 또는 정적인 감각 묘사만 허용한다. 미처리 beat가 있어도 상태나 상호작용을 진행시키지 않는다.'].join('\n');
  const intent=classifySceneIntent(action,{location:saveState?.world?.location||'',currentTime:saveState?.world?.time||'',currentDate:saveState?.world?.date||'',currentWeekday:saveState?.world?.weekday||'',actorName:saveState?.pc?.name||'',resumeTimedAction:saveState?.sceneRuntime?.timed_action}),momentum=object(saveState?.sceneRuntime?.momentum),stall=Math.max(0,Number(momentum.stall_streak||0)),[minMinutes,maxMinutes]=intent.suggestedAdvanceMinutes;
  const boundaryLookahead=Math.max(0,Number(intent.boundaryLookaheadMinutes||0)),scheduleBoundary=(intent.compression&&activityRangeLimitMinutes(intent)>0)||boundaryLookahead>0?nextScheduleBoundaryMinutes(saveState,{futureOnly:true,action,intent,registry}):null;
  const allowedMax=Math.min(1440,Math.max(intent.minAdvanceMinutes,Number(maxMinutes||0)));
  const hardStopLimit=scheduleBoundaryLimitMinutes(intent);
  const boundedBySchedule=scheduleBoundary!=null&&scheduleBoundary>0&&scheduleBoundary<=hardStopLimit;
  const cappedBySchedule=!boundedBySchedule&&scheduleBoundary!=null&&scheduleBoundary>hardStopLimit&&scheduleBoundary<=allowedMax;
  const lines=['[SCENE MOMENTUM V1 — SEMANTIC ACTION COMPLETION]',`INTENT=${intent.kind}`,`SEMANTIC_TARGET=${intent.semanticTarget||'-'}`,`TARGET_STATE_DELTA=${intent.deltaTarget}`,`TIME_PROFILE=${intent.timeProfile||'contextual'}@${ADAPTIVE_TIME_SCALE_VERSION}`,`TIME_GUIDE=${minMinutes}-${maxMinutes}min`,...(intent.turnLimitTruncated?['TURN_LIMIT=1440min']:[]),...(intent.scheduledStartOffsetMinutes!=null?[`SCHEDULED_START_OFFSET=${intent.scheduledStartOffsetMinutes}min`]:[]),...(intent.strictDurationLowerBoundMinutes!=null?[`STRICT_DURATION_LOWER_BOUND=${intent.strictDurationLowerBoundMinutes}min`]:[]),...(intent.explicitDurationUpperBoundMinutes!=null?[`EXPLICIT_DURATION_UPPER_BOUND=${intent.explicitDurationUpperBoundMinutes}min`]:[]),...(intent.explicitDurationMinutes!=null?[`EXPLICIT_DURATION=${intent.explicitDurationMinutes}min`]:[]),...(intent.explicitDurationRangeMinutes?[`EXPLICIT_DURATION_RANGE=${intent.explicitDurationRangeMinutes[0]}-${intent.explicitDurationRangeMinutes[1]}min`]:[]),...(intent.precedingActivityRangeMinutes?[`PRECEDING_ACTIVITY_DURATION_RANGE=${intent.precedingActivityRangeMinutes[0]}-${intent.precedingActivityRangeMinutes[1]}min`]:intent.precedingActivityMinutes>0?[`PRECEDING_ACTIVITY_DURATION=${intent.precedingActivityMinutes}min`]:[]),`STALL_STREAK=${stall}`,'- PC의 새로운 독립적 선택·대사·감정은 만들지 않는다. 대신 사용자가 이미 선언한 의미적 목표를 완료하는 데 필요한 문/복도/계단/현관/평범한 길 같은 결정 가치 없는 중간 단계는 자동 처리한다.','- Scene Description보다 Scene Change를 우선한다. 직전 턴 이후 실제로 달라진 것부터 서술하고, 변하지 않은 게시판/창구/복도/공지 같은 이미 공개된 정보는 목록처럼 다시 읽어주지 않는다.','- NPC는 목표·일정·관계·감정과 물리적 가능성이 맞으면 먼저 말하거나 움직이거나 떠나거나 다른 NPC와 상호작용할 수 있다. PC가 찾아오기를 항상 기다리지 않는다.','- 사건이 끝난 뒤에도 자연스러운 세계 반응·후속 위험·소문·다음 가능성까지 이어갈 수 있다. 단, 새 대형 사건/보스/비밀을 억지로 생성하지 않는다.','- STOP은 전투 돌입/되돌리기 어려운 위험/중대한 관계 선택/중요 대화의 직접 질문/갈림길/능력 사용 여부처럼 플레이어 판단 자체가 콘텐츠인 순간에만 한다. 사소한 문·계단·복도·평범한 이동에서는 STOP하지 않는다.','- choices는 위와 같은 실제 결정점에서만 정확히 3개. 그렇지 않으면 빈 배열.','- 사용자에게 보이는 서술에서 내부 명칭 "PC"나 자리표시자 "Aaa"를 주어로 출력하지 않는다. 이름이 있으면 실제 이름을 쓰거나 한국어답게 주어를 생략한다.'];
  if(intent.turnLimitTruncated)lines.push('- 1회 턴 상한 규칙: 요청 전체가 1440분을 넘는다. 이번 턴은 TIME_GUIDE의 1440분에서 멈추고 아직 끝나지 않은 활동으로 남긴다. 완료·보상·성장·후속 결과를 만들거나 상한 밖 시각으로 진행하지 않는다.');
  if(intent.strictDurationLowerBoundMinutes!=null&&!intent.turnLimitTruncated)lines.push(intent.strictDurationLowerBoundInclusive?`- 포함 최소시간 규칙: 사용자는 최소 ${intent.strictDurationLowerBoundMinutes}분의 활동을 요청했다. 정확히 그 시각에 끝낼 수도 있고 자연 상한 안에서 더 진행할 수도 있다.`:`- 엄격한 최소시간 규칙: 사용자는 ${intent.strictDurationLowerBoundMinutes}분을 초과하는 활동을 요청했다. TIME_GUIDE 안에서 처리하되 정확히 ${intent.strictDurationLowerBoundMinutes}분에 완료시키지 않는다.`);
  if(boundedBySchedule){
    const includedPreceding=intent.scheduledStartOffsetMinutes==null?Number(intent.precedingActivityMinutes||0):0,precedingMinimum=intent.scheduledStartOffsetMinutes==null?Number(intent.precedingActivityRangeMinutes?.[0]??includedPreceding):0,declaredTotal=Number(intent.explicitDurationMinutes||0)+includedPreceding,declaredMinimum=Number(intent.explicitDurationMinutes||0)+precedingMinimum,durationLabel=intent.explicitDurationMinutes!=null?`사용자가 선언한 총 ${declaredMinimum===declaredTotal?declaredTotal:`${declaredMinimum}-${declaredTotal}`}분`:`허용 시간 범위 ${minMinutes}-${maxMinutes}분의`;
    lines.push(`SCHEDULE_BOUNDARY=${scheduleBoundary}min`,`- 일정 경계 우선: ${durationLabel} ${intent.kind==='downtime'?'휴식':intent.kind==='wait'?'대기':'행동'}을 경계 너머까지 실행하지 말고 ${scheduleBoundary}분 뒤 일정 시작 순간에서 멈춘다. 그 뒤 시간을 자동 진행하거나 일정 불참·완료를 대신 결정하지 않는다. 해당 일정과 현재 상황을 제시한 뒤 플레이어가 반응할 수 있게 한다.`);
  }else if(cappedBySchedule){
    lines.push(`SCHEDULE_CAP=${scheduleBoundary}min`,`- 일정 상한: 이 일정은 행동을 늘여 도달해야 하는 목표 시간이 아니다. 선언한 짧은 행동을 자연 소요시간에 완료하고, 불필요하게 기다리거나 장면을 늘여 ${scheduleBoundary}분 경계에 맞추지 않는다. 실제 방해로 행동이 그만큼 길어질 때만 경계를 넘지 않는다.`);
  }
  if(intent.explicitDurationMinutes!=null&&(!intent.dateQualifiedStart||intent.scheduledStartOffsetMinutes!=null)&&!intent.turnLimitTruncated){const includedPreceding=intent.scheduledStartOffsetMinutes==null?Number(intent.precedingActivityMinutes||0):0,precedingMinimum=intent.scheduledStartOffsetMinutes==null?Number(intent.precedingActivityRangeMinutes?.[0]??includedPreceding):0,declaredTotal=Number(intent.explicitDurationMinutes||0)+includedPreceding,declaredMinimum=Number(intent.explicitDurationMinutes||0)+precedingMinimum,totalLabel=declaredMinimum===declaredTotal?`${declaredTotal}분`:`${declaredMinimum}-${declaredTotal}분`;lines.push(`- 명시 시간 규칙: 사용자가 ${totalLabel}을 직접 지정했다${includedPreceding>0?`(앞선 행동 ${precedingMinimum===includedPreceding?`${includedPreceding}분`:`${precedingMinimum}-${includedPreceding}분`} 포함)`:''}. 일반적인 ${intent.kind} 시간 floor로 더 늘리지 말고 이 ${intent.scheduledStartOffsetMinutes!=null?'활동 지속시간':'총시간'} 범위를 우선한다. 단 SCHEDULE_BOUNDARY가 더 짧으면 그 일정 경계가 최우선이다.`);}
  if(intent.explicitDurationRangeMinutes&&(!intent.dateQualifiedStart||intent.scheduledStartOffsetMinutes!=null)&&!intent.turnLimitTruncated){const [rangeMin,rangeMax]=intent.explicitDurationRangeMinutes,offsetMinimum=intent.scheduledStartOffsetMinutes??Number(intent.precedingActivityRangeMinutes?.[0]??intent.precedingActivityMinutes??0),offsetMaximum=intent.scheduledStartOffsetMinutes??Number(intent.precedingActivityMinutes||0),guideMinimum=Math.max(0,Number(array(intent.suggestedAdvanceMinutes)[0]||0)),guideMaximum=Math.max(guideMinimum,Number(array(intent.suggestedAdvanceMinutes)[1]||0));lines.push(`- 명시 시간 범위 규칙: 사용자가 활동 지속시간을 ${rangeMin}-${rangeMax}분으로 지정했다. 두 끝값을 더하지 말고 시작 대기/앞선 행동 ${offsetMinimum===offsetMaximum?`${offsetMaximum}분`:`${offsetMinimum}-${offsetMaximum}분`}을 포함한 TIME_GUIDE ${guideMinimum}-${guideMaximum}분 안에서 완료한다. 더 이른 SCHEDULE_BOUNDARY가 있으면 그 경계가 최우선이다.`);}
  if(intent.explicitDurationUpperBoundMinutes!=null&&!intent.turnLimitTruncated)lines.push(`- 명시 시간 상한 규칙: ${intent.explicitDurationUpperBoundMinutes}분은 완료 목표나 최소시간이 아니라 넘지 말아야 할 상한이다. 더 일찍 자연스럽게 완료하거나 중요한 중단점에서 멈출 수 있으며, 이 상한이나 그 전의 일정에 맞추려고 행동을 늘이지 않는다.`);
  if(intent.scheduledStartOffsetMinutes!=null)lines.push(intent.scheduledStartBoundaryOnly?`- 시작 시각 경계 규칙: 사용자가 지정한 시작 시각은 현재로부터 ${intent.scheduledStartOffsetMinutes}분 뒤이며 이번 턴 안에 도달 가능하지만, 활동 완료는 1440분 상한을 넘는다. TIME_GUIDE의 시작 시각에서 활동을 완료하지 않은 채 멈춘다.`:intent.scheduledStartOverrun?`- 시작 시각 충돌 규칙: 앞선 행동의 최소 소요시간이 지정 시작 시각 ${intent.scheduledStartOffsetMinutes}분을 넘는다. 시간을 겹쳐 완료하거나 시작 시각을 무시하지 말고, TIME_GUIDE의 해당 시작 경계에서 앞선 행동과 뒤 활동 모두 끝나지 않은 상태로 멈춘다.`:intent.turnLimitTruncated?`- 시작 시각 규칙: 사용자가 지정한 시작 시각은 현재로부터 ${intent.scheduledStartOffsetMinutes}분 뒤다. 이 숫자를 활동 지속시간으로 오인하지 말고 그때까지 대기/이동을 처리하되, TIME_GUIDE의 1440분에 닿으면 활동을 완료하지 않은 채 멈춘다.`:`- 시작 시각 규칙: 사용자가 지정한 시작 시각은 현재로부터 ${intent.scheduledStartOffsetMinutes}분 뒤다. 이 숫자를 활동 지속시간으로 오인하지 말고, 그때까지의 대기/이동과 활동 자체의 자연 소요시간을 합친 TIME_GUIDE 안에서 완료한다.`);
  if(intent.dateQualifiedStart)lines.push(intent.scheduledStartBoundaryOnly?`- 날짜 지정 시작 규칙: 요청한 미래 날짜·시각의 시작은 이번 턴 안에 도달하지만 활동 완료는 1440분을 넘는다. 요청 날짜를 오늘로 당기거나 시작을 지나치지 말고 TIME_GUIDE의 시작 경계에서 미완료로 멈춘다.`:intent.scheduledStartOffsetMinutes!=null?`- 날짜 지정 시작 규칙: 요청한 미래 날짜·시각은 현재로부터 ${intent.scheduledStartOffsetMinutes}분 뒤이며 활동까지 1440분 안에 완료할 수 있다. 요청 날짜를 오늘로 당기거나 시작 전에 완료하지 말고 TIME_GUIDE의 실제 미래 시각까지 진행한다.`:`- 날짜 지정 시작 규칙: 내일/모레/다음 날처럼 현재 날짜를 넘고 활동까지 한 턴 안에 완료할 수 없는 요청에는 즉시 활동용 시간 floor를 적용하지 않는다. 한 턴 최대 1440분 안에서 먼저 만나는 권위 있는 일정·예약된 인과 결과에서 멈추고, 경계가 없더라도 요청한 날짜를 오늘로 당기거나 일반 활동 최대치로 잘라 완료하지 않는다.${intent.explicitDurationMinutes!=null?` 지정한 ${intent.explicitDurationMinutes}분은 미래 시작 뒤의 활동 지속시간이다.`:intent.explicitDurationRangeMinutes?` 지정한 ${intent.explicitDurationRangeMinutes[0]}-${intent.explicitDurationRangeMinutes[1]}분은 미래 시작 뒤의 활동 지속시간 범위다.`:''}`);
  if(intent.kind==='exit-exterior'){
    if(isLikelyIndoor(intent.location))lines.push('- EXIT 규칙: 별도 장애물이 없다면 현재 방/생활공간 → 복도 → 계단/현관을 한 턴에 압축해 건물 외부까지 도착시킨다. 복도에서 멈추려면 실제 방해/사건/중요 선택 근거가 있어야 한다.');
    else lines.push('- EXIT 규칙: 현재 위치가 이미 야외/외부라면 존재하지 않는 방·복도·현관을 만들어내지 않는다. 사용자가 말한 “밖”의 자연스러운 의미를 현재 장소의 경계/주변 맥락으로 해석해 이동하거나, 의미가 모호하면 짧은 세계 변화까지만 처리한다.');
  }else if(intent.kind==='travel')lines.push(intent.dateQualifiedStart&&intent.scheduledStartOffsetMinutes==null?`- TRAVEL 규칙: 지정한 미래 출발과 도착이 이번 1440분 창 안에 들어오지 않는다. 이동을 오늘로 당기거나 선언 목적지(${intent.semanticTarget||'목적지'}) 도착·이동 시작을 만들지 말고, 출발 전의 실제 상태로 남긴다.`:intent.turnLimitTruncated?`- TRAVEL 규칙: 평범한 이동 과정은 압축하되, 1440분 상한에서는 선언 목적지(${intent.semanticTarget||'목적지'})에 도착했다고 만들지 말고 이동 중인 실제 위치에서 멈춘다.`:`- TRAVEL 규칙: 특별한 방해가 없으면 평범한 이동 과정을 압축해 선언 목적지(${intent.semanticTarget||'목적지'})까지 이동 완료한다.`);
  else if(intent.kind==='decision-sensitive')lines.push(intent.elapsedScheduledStart?'- ELAPSED START 규칙: 사용자가 오늘로 명시한 시작 시각이 이미 지났다. 행동을 현재 시각에 새로 실행하거나 다음 날로 넘겨 실행하지 말고, 지정 시각을 놓쳤다는 현재 상태만 제시한다. state_delta.advance_minutes=0, state_delta.new_location=null을 유지한다.':'- QUESTION / DELIBERATION 규칙: 사용자는 가능성·정보·조언을 묻거나 아직 선택을 고민 중이다. 질문에 대한 현재 시점의 정보나 NPC 반응만 제공하고, 생각 중인 행동을 실행하거나 위치를 바꾸거나 시간을 진행하거나 진행 중인 일정/이벤트를 완료하지 않는다. state_delta.advance_minutes=0, state_delta.new_location=null을 유지한다.');
  else if(intent.kind==='explore')lines.push('- EXPLORE 규칙: 같은 복도 몇 걸음이 아니라 주변 여러 지점을 자연스럽게 훑고, 새 NPC/새 정보/작은 사건/소문/의미 있는 장소 중 최소 하나를 발견한다.');
  else if(intent.kind==='observe')lines.push('- OBSERVE 규칙: 우선순위는 ①아직 못 본 중요 요소 ②새로 변한 요소 ③현재 행동과 관련된 요소다. 기존 정보만 남았다면 재목록화하지 말고 짧게 넘기며 세계 시간을 진행시킨다.');
  else if(intent.kind==='downtime')lines.push(intent.turnLimitTruncated?'- DOWNTIME 규칙: 앉기→눈감기→잠들기 같은 미세 단계는 압축하되, 1440분 상한에서는 아직 휴식/수면이 진행 중인 상태로 멈춘다. 깨어남·완전 회복·완료 보상을 서술하거나 기록하지 않는다.':`- DOWNTIME 규칙: 앉기→눈감기→잠들기 같은 미세 단계를 여러 턴 요구하지 않는다. 충분한 시간을 넘긴 뒤 변화한 상황에서 재개한다. 실제 중단이 없으면 완료 시간과 advance_minutes를 TIME_GUIDE ${minMinutes}-${maxMinutes} 안에 두며, 후속 선택이나 편의상 아침 시각은 범위 이탈 근거가 아니다.`);
  else if(intent.kind==='wait')lines.push('- WAIT 규칙: 정지 화면처럼 묘사만 반복하지 말고 적절한 시간을 실제로 진행시킨 뒤 일정/NPC/환경의 변화를 반영한다.');
  else if(intent.kind==='committed-consequence')lines.push('- COMMITTED ACTION 규칙: 사용자가 이미 공격/결투 수락/협상/계약/능력 사용 등을 선언했다면 다시 “할지 말지”를 묻지 않는다. 그 시도와 즉각 결과·상대 반응·세계 반응까지 처리한 뒤, 새로 중요한 판단이 생긴 지점에서만 STOP한다.');
  if(stall>=2&&intent.kind!=='decision-sensitive')lines.push('- SCENE_STALL=true: 이번 턴은 문장만 바꾸거나 scene_title만 바꾸는 것으로 통과할 수 없다. 위치/시간/NPC 출입·행동·상태/새 정보/이벤트/관계/목표/자원/성장/일정/소문·월드 스레드/위험/환경 중 최소 하나의 실제 변화가 필요하다. 작은 변화면 충분하며 대형 사건을 강제하지 않는다.');
  return lines.join('\n');
}
