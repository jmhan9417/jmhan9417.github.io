import { serverConfig } from './config.mjs';
import { bodyError } from './http.mjs';

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw bodyError('authentication_required', 401);
  return match[1];
}

export async function verifyUser(req) {
  const cfg = serverConfig();
  const token = bearerToken(req);
  const response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw bodyError('invalid_session', 401);
  const user = await response.json();
  if (!user?.id) throw bodyError('invalid_session', 401);
  return { user, token };
}

export async function deleteAuthUser(userId) {
  const cfg=serverConfig();
  const response=await fetch(`${cfg.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,{method:'DELETE',headers:{apikey:cfg.supabaseServiceRoleKey,Authorization:`Bearer ${cfg.supabaseServiceRoleKey}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok){const error=new Error('account_delete_failed');error.code='account_delete_failed';error.status=503;throw error;}
  return true;
}

export async function adminRest(path, options = {}) {
  const cfg = serverConfig();
  const headers = {
    apikey: cfg.supabaseServiceRoleKey,
    Authorization: `Bearer ${cfg.supabaseServiceRoleKey}`,
    Accept: 'application/json',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeout || 8000)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = text; }
  }
  if (!response.ok) {
    const error = new Error('database_request_failed');
    error.code = 'database_request_failed';
    error.status = 503;
    error.databaseStatus = response.status;
    error.databaseCode = data?.code;
    throw error;
  }
  return data;
}

export function rpc(name, args) {
  return adminRest(`rpc/${name}`, { method: 'POST', body: args });
}

export function beginCheckout(input) {
  return rpc('readytoconsult_begin_checkout', {
    p_user_id: input.userId,
    p_product_key: input.productKey,
    p_request_key: input.requestKey,
    p_terms_version: input.termsVersion,
    p_privacy_version: input.privacyVersion,
    p_refund_version: input.refundVersion
  });
}

export function deleteLearningData(userId) {
  return rpc('readytoconsult_delete_learning_data', { p_user_id: userId });
}

export async function accessState(userId) {
  return rpc('readytoconsult_access_state', {
    p_user_id: userId,
    p_product_key: 'readytoconsult_partner_review_v1'
  });
}

export async function reserveEvaluation(input) {
  return rpc('readytoconsult_reserve_evaluation', {
    p_request_id: input.requestId,
    p_user_id: input.userId,
    p_product_key: input.productKey,
    p_input_hash: input.inputHash,
    p_case_id: input.caseId,
    p_stage: input.stage,
    p_rubric_version: input.rubricVersion
  });
}

export async function completeEvaluation(input) {
  return rpc('readytoconsult_complete_evaluation', {
    p_request_id: input.requestId,
    p_user_id: input.userId,
    p_result: input.result,
    p_provider: input.provider,
    p_model: input.model,
    p_input_tokens: input.inputTokens ?? null,
    p_output_tokens: input.outputTokens ?? null,
    p_latency_ms: input.latencyMs ?? null
  });
}

export async function failEvaluation(requestId, userId, reason) {
  return rpc('readytoconsult_fail_evaluation', {
    p_request_id: requestId,
    p_user_id: userId,
    p_error: String(reason || 'evaluation_failed').slice(0, 240)
  });
}
