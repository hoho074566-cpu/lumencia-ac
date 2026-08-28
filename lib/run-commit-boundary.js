export const RUN_COMMIT_BOUNDARY_VERSION = 1;
export const RUN_COMMIT_PENDING_KEY = 'lumensia.run-commit.pending.v1';

function runId(value){return String(value?.id||'').trim();}
function epoch(value){const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:0;}
function restore(storage,key,raw){if(raw==null)storage.removeItem(key);else storage.setItem(key,raw);}

export function captureRunOwnership(run,runEpoch=0){
  return Object.freeze({version:RUN_COMMIT_BOUNDARY_VERSION,runId:runId(run),runEpoch:epoch(runEpoch)});
}

export function isRunOwnershipCurrent(owner,run,runEpoch=0){
  return Number(owner?.version)===RUN_COMMIT_BOUNDARY_VERSION&&owner.runId===runId(run)&&owner.runEpoch===epoch(runEpoch);
}

export function recoverPendingRunCommit(storage,{saveKey,fateBookKey,pendingKey=RUN_COMMIT_PENDING_KEY}={}){
  const raw=storage.getItem(pendingKey);if(!raw)return false;
  let journal;
  try{journal=JSON.parse(raw);}catch{throw new Error('run commit recovery journal가 손상됨.');}
  if(Number(journal?.version)!==RUN_COMMIT_BOUNDARY_VERSION||!Object.hasOwn(journal,'previousSaveRaw')||!Object.hasOwn(journal,'previousFateBookRaw'))throw new Error('run commit recovery journal가 올바르지 않음.');
  restore(storage,fateBookKey,journal.previousFateBookRaw);
  restore(storage,saveKey,journal.previousSaveRaw);
  storage.removeItem(pendingKey);
  return true;
}

export function commitRunAndFate(storage,{saveKey,fateBookKey,pendingKey=RUN_COMMIT_PENDING_KEY}={},transaction={}){
  if(typeof transaction.isOwnerCurrent!=='function'||!transaction.isOwnerCurrent(transaction.owner))throw new Error('active run이 변경되어 이전 async 결과를 폐기함.');
  const previousSaveRaw=storage.getItem(saveKey),previousFateBookRaw=storage.getItem(fateBookKey);
  const journal={version:RUN_COMMIT_BOUNDARY_VERSION,owner:transaction.owner,previousSaveRaw,previousFateBookRaw};
  storage.setItem(pendingKey,JSON.stringify(journal));
  try{
    if(!transaction.isOwnerCurrent(transaction.owner))throw new Error('active run이 변경되어 이전 async 결과를 폐기함.');
    storage.setItem(fateBookKey,JSON.stringify(transaction.nextFateBook));
    storage.setItem(saveKey,JSON.stringify(transaction.nextRun));
    storage.removeItem(pendingKey);
  }catch(error){
    let rollbackError=null;
    try{restore(storage,fateBookKey,previousFateBookRaw);restore(storage,saveKey,previousSaveRaw);storage.removeItem(pendingKey);}catch(failure){rollbackError=failure;}
    if(rollbackError)throw new AggregateError([error,rollbackError],'run/meta commit과 rollback이 실패하여 recovery journal을 보존함.');
    throw error;
  }
}
