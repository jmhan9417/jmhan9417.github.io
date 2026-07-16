import { handleStripeEvent } from '../server/commerce.mjs';
import { serverConfig } from '../server/config.mjs';
import { methodGuard, readRawBody, safeErrorResponse, sendJson } from '../server/http.mjs';
import { verifyStripeSignature } from '../server/stripe.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  try {
    const cfg = serverConfig();
    if (!cfg.stripeWebhookSecret) throw Object.assign(new Error('webhook_not_configured'), { code: 'server_not_configured', status: 503 });
    const raw = await readRawBody(req, 1024 * 1024);
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'], cfg.stripeWebhookSecret)) {
      throw Object.assign(new Error('invalid_webhook_signature'), { code: 'invalid_webhook_signature', status: 400 });
    }
    const event = JSON.parse(raw.toString('utf8'));
    const outcome = await handleStripeEvent(event);
    sendJson(res, 200, { received: true, outcome });
  } catch (error) {
    safeErrorResponse(res, error);
  }
}
