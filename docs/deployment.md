# ReadyToConsult deployment contract

The Vercel project **must use `veeva-master-class` as its Root Directory**. That folder contains the production `index.html`, `vercel.json`, static legal pages, pinned browser dependency, `/api` functions, and server modules. The current Vercel project setting was verified against project `readytoconsult` (`prj_uSNsEyrs2idmjrF2ZgU6cDtnWedQ`).

Required server environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RTC_EVALUATOR_HASH_SECRET`
- `AI_GATEWAY_API_KEY` or Vercel-provided `VERCEL_OIDC_TOKEN`
- `RTC_EVALUATOR_MODEL` (defaults to `anthropic/claude-sonnet-5`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `READYTOCONSULT_PUBLIC_URL=https://readytoconsult.vercel.app`
- `CRON_SECRET` (strong random value used by the daily retention job)
- `RTC_COMMERCE_ENABLED=1` only when the owner explicitly opens sales; omit it for the current private beta
- `RTC_EVALUATOR_ENABLED=1` only when an AI provider route is funded and the owner explicitly opens review access; omit it for the current closed beta

Production does not set `RTC_EVALUATOR_MOCK`. The mock flag is only for the local contract harness.

Database setup is reproducible from `supabase/migrations/202607160001_paid_evaluator.sql`. Apply it before enabling the APIs, then insert the immutable owner Supabase Auth UUID into `readytoconsult_roles` with role `owner`.

Stripe configuration:

- one-time Price exactly USD 79.00;
- webhook endpoint `https://readytoconsult.vercel.app/api/stripe-webhook`;
- events for Checkout completion/async success/failure/expiration; charge refunds; `refund.created`, `refund.updated`, and `refund.failed`; and dispute creation/closure/funds reinstatement;
- test and live secrets must never be mixed.

Supabase Auth configuration:

- Site URL `https://readytoconsult.vercel.app`;
- allow `https://readytoconsult.vercel.app/` and approved Vercel Preview origins for magic-link redirects;
- production email delivery configured and tested.

Every release is local verify → feature branch/PR → Vercel Preview → test-mode acceptance → merge → production promotion → production API/UI/CSP smoke test.
