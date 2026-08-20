export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    apiConfigured: Boolean(process.env.OPENAI_API_KEY),
    luna: process.env.OPENAI_MODEL_LUNA || 'gpt-5.6-luna',
    terra: process.env.OPENAI_MODEL_TERRA || 'gpt-5.6-terra',
    accessTokenRequired: Boolean(process.env.LUMENSIA_ACCESS_TOKEN),
    promptCacheRetention: '24h',
    version: '0.7.0',
    appVersion: '1.5.3',
    adapter: '/api/chat-v153',
    canonicalCore: '/api/chat',
    qualityPipeline: 'Single canonical pass + local runtime/QA/background',
    contextRouter: 'routine target 18k / soft max 20k; relevant CANON + memories',
    tokenBudget: { routine: 18000, routineSoftMax: 20000, important: 20000, critical: 24000 },
  });
}
