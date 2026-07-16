import { confirmCheckoutForUser } from '../server/commerce.mjs';
import { methodGuard, readJson, safeErrorResponse, sendJson } from '../server/http.mjs';
import { verifyUser } from '../server/supabase.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  try {
    const { user } = await verifyUser(req);
    const input = await readJson(req, 8 * 1024);
    const sessionId = String(input.session_id || '');
    const access = await confirmCheckoutForUser(user, sessionId);
    sendJson(res, 200, { status: 'reconciled', access });
  } catch (error) {
    safeErrorResponse(res, error);
  }
}
