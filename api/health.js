export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    apiConfigured: Boolean(process.env.OPENAI_API_KEY),
    luna: process.env.OPENAI_MODEL_LUNA || 'gpt-5.6-luna',
    terra: process.env.OPENAI_MODEL_TERRA || 'gpt-5.6-terra',
    accessTokenRequired: Boolean(process.env.LUMENSIA_ACCESS_TOKEN),
    promptCacheRetention: '24h',
    version: '0.4.3',
  });
}
