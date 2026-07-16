import { publicProductConfig, serverConfig } from '../server/config.mjs';
import { methodGuard, safeErrorResponse, sendJson } from '../server/http.mjs';
import { accessState, verifyUser } from '../server/supabase.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;
  try {
    const product = publicProductConfig();
    if (!req.headers.authorization) {
      return sendJson(res, 200, { authenticated: false, access: 'signed_out', product });
    }
    const { user } = await verifyUser(req);
    const access = await accessState(user.id);
    const cfg = serverConfig();
    return sendJson(res, 200, {
      ...access,
      email: user.email || null,
      product,
      checkout_available: Boolean(cfg.stripeSecret && cfg.stripePriceId)
    });
  } catch (error) {
    safeErrorResponse(res, error);
  }
}
