const DEFAULT_LIMIT = 64 * 1024;

export function setPrivateHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function sendJson(res, status, body, extraHeaders = {}) {
  setPrivateHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

export function methodGuard(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  sendJson(res, 405, { error: 'method_not_allowed' });
  return false;
}

export async function readRawBody(req, limit = DEFAULT_LIMIT) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limit) throw bodyError('payload_too_large', 413);
    return req.body;
  }
  if (typeof req.body === 'string') {
    const buffer = Buffer.from(req.body);
    if (buffer.length > limit) throw bodyError('payload_too_large', 413);
    return buffer;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > limit) throw bodyError('payload_too_large', 413);
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit = DEFAULT_LIMIT) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw bodyError('invalid_json', 400);
  }
}

export function bodyError(code, status = 400, details) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  if (details) error.details = details;
  return error;
}

export function safeErrorResponse(res, error) {
  const status = Number(error?.status) || (error?.code === 'server_not_configured' ? 503 : 500);
  const code = error?.code || (status >= 500 ? 'server_error' : 'request_failed');
  const body = { error: code };
  if (error?.details && status < 500) body.details = error.details;
  if (error?.retryAfter) body.retry_after = error.retryAfter;
  sendJson(res, status, body, error?.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
}

export function requestOrigin(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${forwarded}://${host}` : '';
}
