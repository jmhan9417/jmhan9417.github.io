import { randomUUID } from 'node:crypto';
import { methodGuard, readJson, safeErrorResponse, sendJson } from '../server/http.mjs';
import { adminRest, verifyUser } from '../server/supabase.mjs';

const CONTEXTS = ['semantic_evaluation','interview_studio','market_access_lab','product'];

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  try {
    const { user } = await verifyUser(req);
    const input = await readJson(req, 8 * 1024);
    const context = String(input.context || '');
    const rating = Number(input.rating);
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    const evaluationId = input.evaluation_id == null ? null : String(input.evaluation_id);
    if (!CONTEXTS.includes(context) || !Number.isInteger(rating) || rating < 1 || rating > 5 || message.length > 1500) {
      throw Object.assign(new Error('invalid_feedback'), { code: 'invalid_feedback', status: 400 });
    }
    if (evaluationId && !/^[0-9a-f-]{36}$/i.test(evaluationId)) throw Object.assign(new Error('invalid_feedback'), { code: 'invalid_feedback', status: 400 });
    if (evaluationId) {
      const rows=await adminRest(`readytoconsult_evaluator_requests?request_id=eq.${encodeURIComponent(evaluationId)}&user_id=eq.${encodeURIComponent(user.id)}&select=request_id&limit=1`);
      if(!Array.isArray(rows)||!rows.length)throw Object.assign(new Error('evaluation_not_owned'),{code:'invalid_feedback',status:403});
    }
    const id = randomUUID();
    await adminRest('readytoconsult_feedback', {
      method: 'POST',
      body: {
        id,
        user_id: user.id,
        evaluation_id: evaluationId,
        context,
        rating,
        message,
        consent_to_contact: input.consent_to_contact === true,
        consent_to_publish: input.consent_to_publish === true,
        moderation_status: 'private'
      },
      headers: { Prefer: 'return=minimal' }
    });
    sendJson(res, 201, { saved: true, feedback_id: id, published: false });
  } catch (error) {
    safeErrorResponse(res, error);
  }
}
