import { randomUUID } from 'node:crypto';
import { PRODUCT_KEY, RUBRIC_VERSION, serverConfig } from '../server/config.mjs';
import { methodGuard, readJson, safeErrorResponse, sendJson } from '../server/http.mjs';
import { completeEvaluation, failEvaluation, reserveEvaluation, verifyUser } from '../server/supabase.mjs';
import { evaluationInputHash, normalizeEvaluationInput, runEvaluation } from '../server/evaluator.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  let user;
  let reservedRequestId = null;
  const deadlineAt=Date.now()+50000;
  try {
    const cfg=serverConfig();if(!cfg.evaluatorEnabled)throw Object.assign(new Error('private_beta_closed'),{code:'private_beta_closed',status:503});
    ({ user } = await verifyUser(req));
    const body = await readJson(req, 32 * 1024);
    const input = normalizeEvaluationInput(body);
    const inputHash = evaluationInputHash(input);
    const reservation = await reserveEvaluation({
      requestId: input.requestId || randomUUID(),
      userId: user.id,
      productKey: PRODUCT_KEY,
      inputHash,
      caseId: input.packet.case_id,
      stage: input.stage,
      rubricVersion: RUBRIC_VERSION
    });

    if (reservation?.status === 'cached') {
      return sendJson(res, 200, {
        evaluation_id: reservation.request_id,
        cached: true,
        evaluation: reservation.result,
        access: reservation.access
      });
    }
    if (reservation?.status === 'in_progress') {
      const error = new Error('evaluation_in_progress');
      error.code = 'evaluation_in_progress';
      error.status = 409;
      error.retryAfter = 3;
      throw error;
    }
    if (reservation?.status === 'rate_limited') {
      const error = new Error('evaluation_rate_limited');
      error.code = 'evaluation_rate_limited';
      error.status = 429;
      error.retryAfter = 60;
      throw error;
    }
    if (reservation?.status === 'no_credits') {
      const error = new Error('purchase_required');
      error.code = 'purchase_required';
      error.status = 402;
      throw error;
    }
    if (reservation?.status !== 'reserved') {
      const error = new Error('evaluation_reservation_failed');
      error.code = 'evaluation_unavailable';
      error.status = 503;
      throw error;
    }

    reservedRequestId = reservation.request_id;
    const started = Date.now();
    const remainingBeforeModel=deadlineAt-Date.now();
    if(remainingBeforeModel<20000)throw Object.assign(new Error('evaluation_deadline'),{code:'evaluator_unavailable',status:503});
    const modelBudget=Math.min(28000,remainingBeforeModel-16000);
    const evaluated = await runEvaluation(input,{deadlineMs:modelBudget});
    const latencyMs = Date.now() - started;
    const completed = await completeEvaluation({
      requestId: reservedRequestId,
      userId: user.id,
      result: evaluated.result,
      provider: evaluated.provider,
      model: evaluated.model,
      inputTokens: evaluated.usage?.prompt_tokens ?? evaluated.usage?.input_tokens ?? null,
      outputTokens: evaluated.usage?.completion_tokens ?? evaluated.usage?.output_tokens ?? null,
      latencyMs
    });
    if (completed !== true) throw Object.assign(new Error('evaluation_commit_failed'), { code: 'evaluation_unavailable', status: 503 });
    const access = reservation.access;
    return sendJson(res, 200, {
      evaluation_id: reservedRequestId,
      cached: false,
      evaluation: evaluated.result,
      access,
      model: { route: evaluated.model, rubric_version: RUBRIC_VERSION }
    });
  } catch (error) {
    if (reservedRequestId && user?.id) {
      await failEvaluation(reservedRequestId, user.id, error?.code || 'evaluation_failed').catch(() => {});
    }
    safeErrorResponse(res, error);
  }
}
