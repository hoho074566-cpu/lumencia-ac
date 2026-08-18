const IMPORTANT_RE = /(전투|공격|기습|결투|살해|죽음|도망|추적|구출|협상|정치|황위|비밀|조사|잠입|권능|사도|대죄주교|마신|심연|부상|치료|판정|대련|시험|고백|배신|의식|각성|깨달음|스킬 습득|L4|L5)/i;
const REASONING_LEVELS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

export function chooseModel({ mode = 'auto', action = '', saveState = {}, proReasoning = false, forceTerra = false }) {
  const luna = process.env.OPENAI_MODEL_LUNA || 'gpt-5.6-luna';
  const terra = process.env.OPENAI_MODEL_TERRA || 'gpt-5.6-terra';

  if (proReasoning) return { model: terra, tier: 'terra', reason: 'pro-mode' };
  if (forceTerra) return { model: terra, tier: 'terra', reason: 'one-turn-force' };
  if (mode === 'luna') return { model: luna, tier: 'luna', reason: 'manual-luna' };
  if (mode === 'terra') return { model: terra, tier: 'terra', reason: 'manual-terra' };

  const forced = Boolean(saveState?.flags?.forceTerraNextTurn);
  const major = Boolean(saveState?.flags?.majorScene);
  const importantAction = IMPORTANT_RE.test(String(action));
  if (forced) return { model: terra, tier: 'terra', reason: 'save-flag' };
  if (major) return { model: terra, tier: 'terra', reason: 'critical-followup' };
  if (importantAction) return { model: terra, tier: 'terra', reason: 'important-keyword' };
  return { model: luna, tier: 'luna', reason: 'routine' };
}

export function reasoningFor(tier, requested = 'auto', proReasoning = false) {
  if (requested && requested !== 'auto' && REASONING_LEVELS.has(requested)) {
    if (proReasoning && requested === 'none') return 'medium';
    return requested;
  }
  if (proReasoning) return 'high';
  return tier === 'terra' ? 'medium' : 'low';
}
