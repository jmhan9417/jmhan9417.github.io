export const PRODUCT_KEY = 'readytoconsult_partner_review_v1';
export const RUBRIC_VERSION = '1.0.0';
export const CASE_VERSION = '1.0.0';
export const EVALUATOR_SCHEMA_VERSION = '1.0.0';
export const PRICE_CENTS = 7900;
export const PURCHASE_REVIEW_QUOTA = 100;
export const TRIAL_REVIEW_QUOTA = 3;
export const TERMS_VERSION = '2026-07-16';
export const PRIVACY_VERSION = '2026-07-16';
export const REFUND_VERSION = '2026-07-16';

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Server configuration missing: ${name}`);
    error.code = 'server_not_configured';
    throw error;
  }
  return value;
}

export function publicProductConfig() {
  return {
    product: PRODUCT_KEY,
    price_cents: PRICE_CENTS,
    currency: 'usd',
    price_label: '$79',
    purchase_reviews: PURCHASE_REVIEW_QUOTA,
    trial_reviews: TRIAL_REVIEW_QUOTA,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    refund_version: REFUND_VERSION,
    subscription: false,
    sales_open: process.env.RTC_COMMERCE_ENABLED === '1',
    evaluator_label: 'Beta AI partner review'
  };
}

export function serverConfig() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
  return {
    supabaseUrl: requiredEnv('SUPABASE_URL').replace(/\/$/, ''),
    supabaseAnonKey: requiredEnv('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    stripeSecret,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    stripePriceId: process.env.STRIPE_PRICE_ID || '',
    stripeLivemode: stripeSecret.startsWith('sk_live_'),
    commerceEnabled: process.env.RTC_COMMERCE_ENABLED === '1',
    publicAppUrl: (process.env.READYTOCONSULT_PUBLIC_URL || 'https://readytoconsult.vercel.app').replace(/\/$/, ''),
    aiGatewayKey: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '',
    evaluatorHashSecret: process.env.RTC_EVALUATOR_HASH_SECRET || '',
    evaluatorModel: process.env.RTC_EVALUATOR_MODEL || 'anthropic/claude-sonnet-5',
    evaluatorMock: process.env.RTC_EVALUATOR_MOCK === '1',
    evaluatorEnabled: process.env.RTC_EVALUATOR_ENABLED === '1'
  };
}
