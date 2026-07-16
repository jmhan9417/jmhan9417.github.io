import crypto from 'node:crypto';
import { serverConfig } from './config.mjs';
import { bodyError } from './http.mjs';

export async function stripeRequest(path, { method = 'GET', params, idempotencyKey } = {}) {
  const cfg = serverConfig();
  if (!cfg.stripeSecret) {
    const error = new Error('stripe_not_configured');
    error.code = 'checkout_unavailable';
    error.status = 503;
    throw error;
  }
  const headers = { Authorization: `Bearer ${cfg.stripeSecret}` };
  let body;
  if (params) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      form.append(key, typeof value === 'boolean' ? String(value) : String(value));
    }
    body = form.toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com${path}`, { method, headers, body, signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error('stripe_request_failed');
    error.code = response.status === 429 ? 'checkout_rate_limited' : 'checkout_unavailable';
    error.status = response.status === 429 ? 429 : 503;
    error.stripeType = payload?.error?.type;
    throw error;
  }
  return payload;
}

export function verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!secret || !signatureHeader) return false;
  const fields = String(signatureHeader).split(',').map(part => part.trim().split('='));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (age > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  });
}

export async function createStripeCustomer(user, idempotencyKey) {
  return stripeRequest('/v1/customers', {
    method: 'POST',
    idempotencyKey,
    params: {
      email: user.email,
      'metadata[supabase_user_id]': user.id,
      'metadata[product]': 'readytoconsult_partner_review_v1'
    }
  });
}

export function createCheckoutSession(params, idempotencyKey) {
  return stripeRequest('/v1/checkout/sessions', {
    method: 'POST',
    idempotencyKey,
    params: {
      mode: 'payment',
      customer: params.customerId,
      client_reference_id: params.userId,
      'line_items[0][price]': params.priceId,
      'line_items[0][quantity]': 1,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      expires_at: params.expiresAt,
      'metadata[user_id]': params.userId,
      'metadata[product_key]': params.productKey,
      'metadata[checkout_request_id]': params.checkoutRequestId,
      'payment_intent_data[metadata][user_id]': params.userId,
      'payment_intent_data[metadata][product_key]': params.productKey,
      allow_promotion_codes: false
    }
  });
}

export function retrieveCheckoutSession(sessionId) {
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(String(sessionId))) throw bodyError('invalid_checkout_session', 400);
  return stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`);
}

export function expireCheckoutSession(sessionId) {
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(String(sessionId))) throw bodyError('invalid_checkout_session', 400);
  return stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {method:'POST'});
}

export function cancelPaymentIntent(paymentIntentId) {
  if (!/^pi_[A-Za-z0-9_]+$/.test(String(paymentIntentId))) throw bodyError('invalid_payment_intent', 400);
  return stripeRequest(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`, {method:'POST'});
}

export function refundPaymentIntent(paymentIntentId,idempotencyKey,amount,userId,sessionId) {
  if (!/^pi_[A-Za-z0-9_]+$/.test(String(paymentIntentId))) throw bodyError('invalid_payment_intent', 400);
  return stripeRequest('/v1/refunds',{method:'POST',idempotencyKey,params:{payment_intent:paymentIntentId,amount,'metadata[readytoconsult_user_id]':userId,'metadata[checkout_session_id]':sessionId}});
}

export function listCheckoutSessions(customerId) {
  return stripeRequest(`/v1/checkout/sessions?customer=${encodeURIComponent(customerId)}&limit=100`);
}

export function retrievePaymentIntent(paymentIntentId) {
  return stripeRequest(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.dispute`);
}

export function retrieveRefund(refundId) {
  if (!/^re_[A-Za-z0-9_]+$/.test(String(refundId))) throw bodyError('invalid_refund', 400);
  return stripeRequest(`/v1/refunds/${encodeURIComponent(refundId)}`);
}

export function retrieveDispute(disputeId) {
  if (!/^dp_[A-Za-z0-9_]+$/.test(String(disputeId))) throw bodyError('invalid_dispute', 400);
  return stripeRequest(`/v1/disputes/${encodeURIComponent(disputeId)}`);
}

export function retrieveCharge(chargeId) {
  if (!/^ch_[A-Za-z0-9_]+$/.test(String(chargeId))) throw bodyError('invalid_charge', 400);
  return stripeRequest(`/v1/charges/${encodeURIComponent(chargeId)}`);
}
