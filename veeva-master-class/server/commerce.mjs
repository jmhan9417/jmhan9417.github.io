import { PRICE_CENTS, PRODUCT_KEY, PURCHASE_REVIEW_QUOTA, REFUND_VERSION, PRIVACY_VERSION, TERMS_VERSION, serverConfig } from './config.mjs';
import { bodyError } from './http.mjs';
import { randomUUID } from 'node:crypto';
import { accessState, adminRest, beginCheckout, rpc } from './supabase.mjs';
import { cancelPaymentIntent, createCheckoutSession, createStripeCustomer, expireCheckoutSession, listCheckoutSessions, refundPaymentIntent, retrieveCheckoutSession, retrievePaymentIntent, retrieveCharge, retrieveDispute, retrieveRefund } from './stripe.mjs';

const q = encodeURIComponent;

async function selectOne(table, filters) {
  const query = Object.entries(filters).map(([key, value]) => `${q(key)}=eq.${q(value)}`).join('&');
  const rows = await adminRest(`${table}?${query}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsert(table, body, conflict) {
  const path = conflict ? `${table}?on_conflict=${q(conflict)}` : table;
  const rows = await adminRest(path, {
    method: 'POST', body,
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function patch(table, filters, body) {
  const query = Object.entries(filters).map(([key, value]) => `${q(key)}=eq.${q(value)}`).join('&');
  return adminRest(`${table}?${query}`, {
    method: 'PATCH', body,
    headers: { Prefer: 'return=representation' }
  });
}

export async function createCheckoutForUser(user, input) {
  if (!user.email || !user.email_confirmed_at) throw bodyError('confirmed_email_required', 403);
  if (input.terms_version !== TERMS_VERSION || input.privacy_version !== PRIVACY_VERSION || input.refund_version !== REFUND_VERSION || input.accepted !== true) {
    throw bodyError('legal_acceptance_required', 400);
  }
  const requestKey = String(input.request_key || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) throw bodyError('invalid_request_key', 400);
  const cfg = serverConfig();
  if (!cfg.commerceEnabled) throw bodyError('commerce_closed', 403);
  if (!cfg.stripeSecret || !cfg.stripePriceId) throw bodyError('checkout_unavailable', 503);

  const access = await accessState(user.id);
  if (access?.entitled) throw bodyError('already_owned', 409);

  let checkout = await beginCheckout({
    userId: user.id, productKey: PRODUCT_KEY, requestKey,
    termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, refundVersion: REFUND_VERSION
  });
  if(!checkout?.stripe_session_id&&new Date(checkout?.stripe_expires_at||0).getTime()<=Date.now()+35*60*1000){await patch('readytoconsult_checkout_requests',{id:checkout.id},{status:'failed',updated_at:new Date().toISOString()});checkout=await beginCheckout({userId:user.id,productKey:PRODUCT_KEY,requestKey:randomUUID(),termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION,refundVersion:REFUND_VERSION});}
  if (checkout?.stripe_session_id) {
    const existing = await retrieveCheckoutSession(checkout.stripe_session_id);
    if (existing?.url && existing.status === 'open') return { url: existing.url, session_id: existing.id, reused: true };
    await patch('readytoconsult_checkout_requests', { id: checkout.id }, { status: 'expired', updated_at: new Date().toISOString() });
    checkout = await beginCheckout({
      userId: user.id, productKey: PRODUCT_KEY,
      requestKey: checkout.request_key === requestKey ? randomUUID() : requestKey,
      termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, refundVersion: REFUND_VERSION
    });
  }

  let billing = await selectOne('readytoconsult_billing_customers', { user_id: user.id, livemode: cfg.stripeLivemode });
  if (!billing) {
    const customer = await createStripeCustomer(user, `rtc_customer_${user.id}_${cfg.stripeLivemode ? 'live' : 'test'}`);
    billing = await upsert('readytoconsult_billing_customers', {
      user_id: user.id,
      livemode: cfg.stripeLivemode,
      stripe_customer_id: customer.id
    }, 'user_id,livemode');
  }

  const session = await createCheckoutSession({
    customerId: billing.stripe_customer_id,
    userId: user.id,
    priceId: cfg.stripePriceId,
    productKey: PRODUCT_KEY,
    checkoutRequestId: checkout.id,
    successUrl: `${cfg.publicAppUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${cfg.publicAppUrl}/?checkout=cancelled`,
    expiresAt: Math.floor(new Date(checkout.stripe_expires_at).getTime()/1000)
  }, `rtc_checkout_${checkout.id}`);

  const registered=await rpc('readytoconsult_register_checkout_session',{p_user_id:user.id,p_checkout_id:checkout.id,p_session_id:session.id,p_customer_id:billing.stripe_customer_id});
  if(registered?.account_closing){if(session.status==='open')await expireCheckoutSession(session.id);throw bodyError('account_closing',409);}
  return { url: session.url, session_id: session.id, reused: false };
}

function checkoutIdentifiers(session) {
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const priceId = session.line_items?.data?.[0]?.price?.id;
  return { paymentIntent, customer, priceId };
}

async function paymentStanding(paymentIntentId, expectedCustomer, expectedAmount) {
  const intent = await retrievePaymentIntent(paymentIntentId);
  const chargeRef = intent?.latest_charge;
  const charge = typeof chargeRef === 'string' ? await retrieveCharge(chargeRef) : chargeRef;
  if (intent?.status !== 'succeeded' || !charge || charge.paid !== true || charge.customer !== expectedCustomer) throw bodyError('payment_not_active', 409);
  if (Number(charge.amount) !== Number(expectedAmount)) throw bodyError('checkout_amount_mismatch', 409);
  if (Number(charge.amount_refunded || 0) >= Number(charge.amount || 0)) throw bodyError('purchase_revoked', 409);
  let disputeStatus=null;
  if(charge.disputed===true||charge.dispute){const ref=charge.dispute,dispute=typeof ref==='string'?await retrieveDispute(ref):ref;disputeStatus=dispute&&dispute.status||null;if(!['won','warning_closed'].includes(disputeStatus))throw bodyError('purchase_revoked',409);}
  return { intent, charge, amountRefunded: Number(charge.amount_refunded || 0), disputeStatus };
}

export async function validatePaidSession(session, expectedUserId) {
  const cfg = serverConfig();
  const ids = checkoutIdentifiers(session);
  if (session.mode !== 'payment' || session.payment_status !== 'paid') throw bodyError('payment_not_complete', 409);
  if (session.metadata?.product_key !== PRODUCT_KEY || session.metadata?.user_id !== expectedUserId || session.client_reference_id !== expectedUserId) throw bodyError('checkout_identity_mismatch', 403);
  if (!ids.customer || !ids.paymentIntent || ids.priceId !== cfg.stripePriceId) throw bodyError('checkout_product_mismatch', 409);
  if (session.amount_total !== PRICE_CENTS || String(session.currency).toLowerCase() !== 'usd') throw bodyError('checkout_amount_mismatch', 409);
  if (Boolean(session.livemode) !== cfg.stripeLivemode) throw bodyError('checkout_mode_mismatch', 409);
  const billing = await selectOne('readytoconsult_billing_customers', { user_id: expectedUserId, livemode: cfg.stripeLivemode });
  if (!billing || billing.stripe_customer_id !== ids.customer) throw bodyError('checkout_customer_mismatch', 403);
  const existing = await selectOne('readytoconsult_purchases', { stripe_checkout_session_id: session.id });
  if(existing?.status==='refunded')throw bodyError('purchase_revoked',409);
  const standing = await paymentStanding(ids.paymentIntent, ids.customer, session.amount_total);
  if(existing?.status==='disputed'&&!['won','warning_closed'].includes(standing.disputeStatus))throw bodyError('purchase_revoked',409);
  return { ...ids, standing };
}

export async function reconcilePaidSession(session, expectedUserId, event) {
  const ids = await validatePaidSession(session, expectedUserId);
  return rpc('readytoconsult_fulfill_purchase', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_livemode: Boolean(session.livemode),
    p_user_id: expectedUserId,
    p_product_key: PRODUCT_KEY,
    p_checkout_session_id: session.id,
    p_payment_intent_id: ids.paymentIntent,
    p_customer_id: ids.customer,
    p_price_id: ids.priceId,
    p_amount_total: session.amount_total,
    p_amount_refunded: ids.standing.amountRefunded,
    p_currency: session.currency,
    p_quota: PURCHASE_REVIEW_QUOTA
  });
}

export async function confirmCheckoutForUser(user, sessionId) {
  const session = await retrieveCheckoutSession(sessionId);
  await reconcilePaidSession(session, user.id, { id: `confirm:${session.id}`, type: 'checkout.confirmed' });
  return accessState(user.id);
}

export async function restoreForUser(user) {
  const cfg = serverConfig();
  const billing = await selectOne('readytoconsult_billing_customers', { user_id: user.id, livemode: cfg.stripeLivemode });
  if (!billing) return { status: 'none_found', access: await accessState(user.id) };
  const listed = await listCheckoutSessions(billing.stripe_customer_id);
  const candidates = (listed?.data || []).filter(session =>
    session.payment_status === 'paid' && session.client_reference_id === user.id && session.metadata?.product_key === PRODUCT_KEY
  );
  let restored = 0;
  for (const candidate of candidates) {
    const session = await retrieveCheckoutSession(candidate.id);
    await reconcilePaidSession(session, user.id, { id: `restore:${session.id}`, type: 'checkout.restored' });
    restored += 1;
  }
  return { status: restored ? 'restored' : 'none_found', restored, access: await accessState(user.id) };
}

async function accountClosure(userId){return selectOne('readytoconsult_account_closures',{user_id:userId});}
async function refundClosedAccountPayment(session,userId,event,closure){
  const cfg=serverConfig(),ids=checkoutIdentifiers(session);
  if(session.mode!=='payment'||session.payment_status!=='paid'||session.metadata?.product_key!==PRODUCT_KEY||session.metadata?.user_id!==userId||session.client_reference_id!==userId)throw bodyError('closed_checkout_identity_mismatch',409);
  if(!ids.customer||!ids.paymentIntent||!closure?.stripe_customer_ids?.includes(ids.customer)||ids.priceId!==cfg.stripePriceId)throw bodyError('closed_checkout_product_mismatch',409);
  if(Number(session.amount_total)!==PRICE_CENTS||String(session.currency).toLowerCase()!=='usd'||Boolean(session.livemode)!==cfg.stripeLivemode)throw bodyError('closed_checkout_amount_mismatch',409);
  const historical=await selectOne('readytoconsult_purchases',{stripe_checkout_session_id:session.id});
  if(historical){await upsert('readytoconsult_stripe_events',{stripe_event_id:event.id,event_type:event.type,livemode:Boolean(session.livemode),object_id:session.id,status:'ignored',processed_at:new Date().toISOString()},'stripe_event_id');return{status:'historical_purchase_no_refund'};}
  const requestId=String(session.metadata?.checkout_request_id||''),captured=closure?.checkout_session_ids?.includes(session.id)||closure?.checkout_request_ids?.includes(requestId);if(!captured){await upsert('readytoconsult_stripe_events',{stripe_event_id:event.id,event_type:event.type,livemode:Boolean(session.livemode),object_id:session.id,status:'ignored',processed_at:new Date().toISOString()},'stripe_event_id');return{status:'uncaptured_checkout_no_refund'};}
  const intent=await retrievePaymentIntent(ids.paymentIntent),chargeRef=intent?.latest_charge,charge=typeof chargeRef==='string'?await retrieveCharge(chargeRef):chargeRef;
  if(intent?.status!=='succeeded'||intent.customer!==ids.customer||Number(intent.amount)!==PRICE_CENTS||!charge||charge.paid!==true||charge.customer!==ids.customer)throw bodyError('closed_payment_not_refundable',409);
  const remaining=Math.max(0,Number(charge.amount||PRICE_CENTS)-Number(charge.amount_refunded||0));
  if(remaining===0)return rpc('readytoconsult_record_late_refund',{p_user_id:userId,p_event_id:event.id,p_event_type:event.type,p_livemode:Boolean(session.livemode),p_session_id:session.id,p_refund_id:`settled:${charge.id}`,p_refund_status:'succeeded'});
  const refund=await refundPaymentIntent(ids.paymentIntent,`rtc_closed_${session.id}`,remaining,userId,session.id),refundStatus=String(refund.status||'pending');
  const recorded=await rpc('readytoconsult_record_late_refund',{p_user_id:userId,p_event_id:event.id,p_event_type:event.type,p_livemode:Boolean(session.livemode),p_session_id:session.id,p_refund_id:refund.id,p_refund_status:refundStatus});
  if(['failed','canceled'].includes(refundStatus))throw bodyError('late_refund_failed',503);
  return recorded;
}

export async function prepareAccountDeletion(userId){
  const closure=await rpc('readytoconsult_begin_account_closure',{p_user_id:userId});
  for(const sessionId of closure?.checkout_session_ids||[]){
    const session=await retrieveCheckoutSession(sessionId),ids=checkoutIdentifiers(session);
    if(session.payment_status==='paid'){await refundClosedAccountPayment(session,userId,{id:`account-delete:${session.id}`,type:'account.deleted.payment_refund'},closure);continue;}
    if(session.status==='open')await expireCheckoutSession(session.id);
    if(ids.paymentIntent){const intent=await retrievePaymentIntent(ids.paymentIntent);if(!['succeeded','canceled'].includes(intent?.status)){await cancelPaymentIntent(ids.paymentIntent);}}
  }
  return closure;
}
export async function finishAccountDeletion(userId){return rpc('readytoconsult_finish_account_closure',{p_user_id:userId});}

export async function handleStripeEvent(event) {
  const object = event?.data?.object;
  if (!event?.id || !event?.type || !object) throw bodyError('invalid_stripe_event', 400);
  if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
    if (object.payment_status !== 'paid') return { status: 'pending' };
    const session = await retrieveCheckoutSession(object.id);
    const userId = session.metadata?.user_id;
    if (!userId) throw bodyError('checkout_identity_mismatch', 400);
    const closure=await accountClosure(userId);if(closure)return refundClosedAccountPayment(session,userId,event,closure);
    return reconcilePaidSession(session, userId, event);
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    await patch('readytoconsult_checkout_requests', { stripe_session_id: object.id }, { status: 'failed', updated_at: new Date().toISOString() });
    return { status: 'failed_recorded' };
  }
  if(event.type==='checkout.session.expired'){
    await patch('readytoconsult_checkout_requests',{stripe_session_id:object.id},{status:'expired',updated_at:new Date().toISOString()});
    return{status:'expired_recorded'};
  }
  if (['refund.created','refund.updated','refund.failed'].includes(event.type)) {
    const refund=await retrieveRefund(object.id),metadata=refund?.metadata||{};
    let closure=await selectOne('readytoconsult_account_closures',{late_refund_id:refund.id});
    if(!closure&&metadata.readytoconsult_user_id)closure=await selectOne('readytoconsult_account_closures',{user_id:metadata.readytoconsult_user_id});
    if(!closure){await upsert('readytoconsult_stripe_events',{stripe_event_id:event.id,event_type:event.type,livemode:Boolean(event.livemode),object_id:object.id||null,status:'ignored',processed_at:new Date().toISOString()},'stripe_event_id');return{status:'unowned_refund_event'};}
    return rpc('readytoconsult_record_late_refund',{p_user_id:closure.user_id,p_event_id:event.id,p_event_type:event.type,p_livemode:Boolean(event.livemode),p_session_id:String(metadata.checkout_session_id||''),p_refund_id:refund.id,p_refund_status:String(refund.status||'pending')});
  }
  if (event.type === 'charge.refunded') {
    const paymentIntentId=typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
    const purchase=await selectOne('readytoconsult_purchases',{stripe_payment_intent_id:paymentIntentId});
    if(!purchase){await upsert('readytoconsult_stripe_events',{stripe_event_id:event.id,event_type:event.type,livemode:Boolean(event.livemode),object_id:paymentIntentId||object.id||null,status:'processed',processed_at:new Date().toISOString()},'stripe_event_id');return{status:'unowned_refund_recorded'};}
    return rpc('readytoconsult_revoke_purchase', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: Boolean(event.livemode),
      p_payment_intent_id: paymentIntentId,
      p_amount_refunded: Number(object.amount_refunded || 0),
      p_reason: Number(object.amount_refunded || 0) >= Number(object.amount || 0) ? 'full_refund' : 'partial_refund'
    });
  }
  if (event.type === 'charge.dispute.created') {
    return rpc('readytoconsult_revoke_purchase', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: Boolean(event.livemode),
      p_payment_intent_id: typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id,
      p_amount_refunded: 0,
      p_reason: 'dispute'
    });
  }
  if(event.type==='charge.dispute.closed'&&object.status==='lost'){
    return rpc('readytoconsult_revoke_purchase',{
      p_event_id:event.id,p_event_type:event.type,p_livemode:Boolean(event.livemode),
      p_payment_intent_id:typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id,
      p_amount_refunded:0,p_reason:'dispute_lost'
    });
  }
  if (['charge.dispute.closed','charge.dispute.funds_reinstated'].includes(event.type) && (event.type.endsWith('funds_reinstated') || ['won','warning_closed'].includes(object.status))) {
    const paymentIntentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
    const purchase = await selectOne('readytoconsult_purchases', { stripe_payment_intent_id: paymentIntentId });
    if (!purchase?.stripe_checkout_session_id || !purchase?.user_id) throw bodyError('purchase_not_found', 404);
    const session = await retrieveCheckoutSession(purchase.stripe_checkout_session_id);
    return reconcilePaidSession(session, purchase.user_id, event);
  }
  await upsert('readytoconsult_stripe_events', {
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: Boolean(event.livemode),
    object_id: object.id || null,
    status: 'ignored',
    processed_at: new Date().toISOString()
  }, 'stripe_event_id');
  return { status: 'ignored' };
}
