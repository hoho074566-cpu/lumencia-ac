import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { TurnSchema } from './lib/schema.js';
import { buildInstructions, buildTurnInput } from './lib/prompt.js';
import { chooseModel, reasoningFor } from './lib/router.js';
import { sanitizeTurn, usageSummary } from './lib/utils.js';

export const config = { maxDuration: 300 };

const json = (res, status, payload) => res.status(status).json(payload);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST만 지원합니다.' });
  if (!process.env.OPENAI_API_KEY) return json(res, 503, { error: 'Vercel 환경변수 OPENAI_API_KEY가 없습니다.', code: 'NO_API_KEY' });
  const requiredToken = process.env.LUMENSIA_ACCESS_TOKEN;
  if (requiredToken && req.headers['x-lumensia-token'] !== requiredToken) {
    return json(res, 401, { error: '루멘시아 접속 토큰이 없거나 틀렸습니다.', code: 'BAD_ACCESS_TOKEN' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = String(body.action || '').trim();
    if (!action) return json(res, 400, { error: '행동 입력이 비어 있습니다.' });
    if (action.length > 5000) return json(res, 400, { error: '한 번의 입력은 5,000자 이하로 줄여주세요.' });

    const saveState = body.saveState && typeof body.saveState === 'object' ? body.saveState : {};
    const recentTurns = Array.isArray(body.recentTurns) ? body.recentTurns.slice(-10) : [];
    const availableCgIds = Array.isArray(body.availableCgIds) ? body.availableCgIds.slice(0, 250) : [];
    const proReasoning = Boolean(body.proReasoning);
    const route = chooseModel({
      mode: body.modelMode,
      action,
      saveState,
      proReasoning,
      forceTerra: Boolean(body.forceTerra),
    });
    const effort = reasoningFor(route.tier, body.reasoningEffort, proReasoning);
    const proseLength = ['short', 'medium', 'long'].includes(body.proseLength) ? body.proseLength : 'medium';

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const reasoning = { effort };
    if (proReasoning) reasoning.mode = 'pro';

    const response = await client.responses.parse({
      model: route.model,
      store: false,
      instructions: buildInstructions({ adultMode: Boolean(body.adultMode), proseLength }),
      input: buildTurnInput({
        action,
        saveState,
        recentTurns,
        rollingSummary: body.rollingSummary || '',
        availableCgIds,
      }),
      reasoning,
      max_output_tokens: proseLength === 'long' ? 8000 : proseLength === 'short' ? 3500 : 5500,
      text: {
        verbosity: proseLength === 'long' ? 'high' : proseLength === 'short' ? 'low' : 'medium',
        format: zodTextFormat(TurnSchema, 'lumensia_turn'),
      },
    });

    if (!response.output_parsed) {
      return json(res, 502, { error: '구조화된 게임 응답을 받지 못했습니다.', request_id: response._request_id });
    }

    const turn = sanitizeTurn(response.output_parsed, { allowedCgIds: availableCgIds });
    return json(res, 200, {
      turn,
      route: {
        model: route.model,
        tier: route.tier,
        reason: route.reason,
        reasoning_effort: effort,
        reasoning_mode: proReasoning ? 'pro' : 'standard',
      },
      usage: usageSummary(route.model, response.usage),
      request_id: response._request_id || null,
    });
  } catch (error) {
    console.error(error);
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    return json(res, status, {
      error: error?.message || 'API 호출 중 오류가 발생했습니다.',
      code: error?.code || 'UNKNOWN',
      request_id: error?.request_id || null,
    });
  }
}
