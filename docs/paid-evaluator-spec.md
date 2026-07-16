# ReadyToConsult Partner Review v1

## Product contract

- Price: USD 79, one-time payment, no subscription.
- Included: 100 non-expiring semantic answer reviews tied to one ReadyToConsult account.
- Trial: three reviews for each authenticated account.
- Existing deterministic practice remains available without a purchase.
- Duplicate evaluation of the same unchanged answer, rubric, case packet, and stage returns the cached result and does not consume another review.
- Failed provider calls and invalid model output do not consume a review.
- Full refunds revoke the purchase grant. Partial refunds keep access. Disputes suspend the affected grant until resolved.
- The evaluator is beta coaching guidance. It is not a hiring prediction and has no published accuracy claim until human calibration is completed.

## Evaluation contract

The semantic review remains separate from the existing 80-point objective task-coverage score. It evaluates five dimensions on a 0-4 anchored rubric:

1. Recommendation and evidence consistency.
2. Prompt comprehension.
3. Numeric interpretation.
4. Partner-level concision.
5. Responsiveness to the immediately preceding interviewer follow-up.

All five dimensions are returned. A dimension can be not applicable; it is removed from the weighted denominator. Server-side weights vary by stage. The model proposes evidence-linked findings. The server verifies the schema, quote substrings, fact identifiers, numeric rules, weights, and score caps before returning a result.

Deterministic caps:

- Does not answer the requested decision: maximum 49.
- Material recommendation/evidence contradiction: maximum 59.
- Fabricated decision-critical number: maximum 59.
- Central numeric conclusion wrong: maximum 69.

The UI must label the result `Beta AI partner review` and keep it visually separate from objective task coverage.

## Privacy boundary

The evaluator receives only the current case/stage packet, current answer, current interviewer follow-up, and the learner's response to that follow-up. It does not receive name, email, account ID, payment data, authentication token, unrelated course history, or another user's work.

The evaluator request is processed in memory. The evaluator table stores a salted input hash, the structured result, exact answer excerpts used as evidence, the generated rewrite (which may reproduce part or all of the answer), model route, token counts, latency, case/stage/rubric versions, and quota accounting. Signed-in cloud progress separately contains interview drafts. Both are retained until the learner deletes learning data or the account, subject to operational backup windows disclosed in the Privacy Policy.

Operational logs must not include raw answer text. Responses use `Cache-Control: private, no-store`.

## Security and scoring

- Supabase Auth bearer tokens are verified server-side.
- Entitlement, trial quota, purchase quota, and rate limits are enforced in Postgres RPCs, never from client flags.
- Stripe Checkout accepts no client amount or price. Product and Price IDs come from server configuration.
- Only a verified, idempotent Stripe webhook grants paid access.
- Candidate text is untrusted data and cannot alter the system rubric.
- The model has no tools or browsing.
- Evidence quotes must be exact substrings of an allowed source.
- Fact IDs must belong to the current versioned case packet.
- One constrained structured-output model call is allowed, plus one retry only for invalid schema/evidence.
- Maximum input: 12 KB. Maximum current answer: 4,000 characters. Maximum follow-up answer: 2,000 characters.
- Per-account limits: 10 reviews/hour and 30/day. Owner/admin accounts are limited to 30/hour and 500/day.

## Commerce and recovery

- Checkout requires a signed-in, email-confirmed account and explicit acceptance of versioned Terms, Privacy, and Refund Policy.
- Stripe Customer mapping uses immutable Supabase user ID, not email matching.
- Checkout uses `mode=payment`, a fixed one-time Price, server-fixed success/cancel URLs, and an idempotency key.
- Success URL state never unlocks access. The client polls canonical access, then performs one reconciliation attempt.
- Restore Purchase requires the same signed-in Supabase account and reconciles successful Stripe sessions belonging to its stored Stripe Customer.
- Webhook fulfillment, refunds, disputes, and restore all use the same idempotent reconciliation path.

## Honest feedback

Authenticated learners can rate a completed evaluation from 1-5 and send up to 1,500 characters of feedback. The app never publishes feedback automatically. Publication requires separate explicit consent and manual moderation. No testimonial, pass rate, user count, or accuracy claim may be shown until supported by real records and a documented method.

## Launch acceptance bar

- 24 versioned case-stage packets.
- Deterministic numeric tests and adversarial prompt-injection tests pass.
- Invalid/missing JWT, inactive/refunded grant, exhausted quota, oversized input, unknown case/stage, and provider failure all fail closed.
- Stripe test checkout, duplicate webhook, restore, full refund, dispute, and cross-account denial pass.
- RLS isolation passes for anonymous, User A, User B, and service role.
- 1440, 768, 390, and 320 pixel responsive checks pass.
- Keyboard, focus, dialog, status, and screen-reader checks pass.
- Independent technical, domain, privacy, and commerce audits return PASS.
