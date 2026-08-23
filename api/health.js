export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    apiConfigured: Boolean(process.env.OPENAI_API_KEY),
    luna: process.env.OPENAI_MODEL_LUNA || 'gpt-5.6-luna',
    terra: process.env.OPENAI_MODEL_TERRA || 'gpt-5.6-terra',
    accessTokenRequired: Boolean(process.env.LUMENSIA_ACCESS_TOKEN),
    promptCacheRetention: '24h',
    version: '0.8.3',
    appVersion: '1.5.6',
    adapter: '/api/chat-router',
    canonicalCore: '/api/chat',
    stablePaths: {
      runtime: '/app-runtime.js',
      api: '/api/chat-router',
      contextRouter: '/api/lib/context-router.js',
    },
    qualityPipeline: 'Single canonical pass + local runtime/QA/background',
    contextRouter: 'HF1 budgets preserved: routine 17k target / 20k soft max',
    eventDirector: 'V2.1 seeded weighted variation + active NPC-goal weighting + 3-turn surprise cooldown + no-event outcome',
    npcMotivation: 'V2 evidence-gated active_goal lifecycle + progress/replacement/history + eligible-candidate Director weighting',
    relationshipReason: 'V1 cause/expression/followup + turn/source persistence',
    sceneMomentum: 'HF1 semantic action compression + deterministic State Delta/stall + NPC initiative + meaningful-stop policy',
    tokenBudget: { routine: 17000, routineSoftMax: 20000, scheduled: 18000, important: 20000, critical: 24000 },
  });
}
