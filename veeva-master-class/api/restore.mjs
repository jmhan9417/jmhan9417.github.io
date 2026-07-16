import { restoreForUser } from '../server/commerce.mjs';
import { methodGuard, safeErrorResponse, sendJson } from '../server/http.mjs';
import { verifyUser } from '../server/supabase.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  try {
    const { user } = await verifyUser(req);
    const restored = await restoreForUser(user);
    sendJson(res, 200, restored);
  } catch (error) {
    safeErrorResponse(res, error);
  }
}
