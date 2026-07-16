import { createCheckoutForUser } from '../server/commerce.mjs';
import { methodGuard, readJson, safeErrorResponse, sendJson } from '../server/http.mjs';
import { verifyUser } from '../server/supabase.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  try {
    const { user } = await verifyUser(req);
    const input = await readJson(req, 8 * 1024);
    const checkout = await createCheckoutForUser(user, input);
    sendJson(res, 200, checkout);
  } catch (error) {
    safeErrorResponse(res, error);
  }
}
