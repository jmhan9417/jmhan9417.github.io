import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://commerce.supabase.co';
process.env.SUPABASE_ANON_KEY='anon-commerce';
process.env.SUPABASE_SERVICE_ROLE_KEY='service-commerce';
process.env.RTC_COMMERCE_ENABLED='1';
process.env.STRIPE_SECRET_KEY='sk_test_commerce';
process.env.STRIPE_PRICE_ID='price_test_readytoconsult_79';
process.env.READYTOCONSULT_PUBLIC_URL='https://readytoconsult.vercel.app';

let billingCreated=false;
let closingOnRegister=false;
let access={authenticated:true,access:'trial',entitled:false,can_evaluate:true,reviews_remaining:3,trial_remaining:3,paid_remaining:0};
const calls=[];const checkoutExpiresAt=new Date(Date.now()+7200000).toISOString();
let chargeState={id:'ch_test_ready',paid:true,customer:'cus_test_ready',amount:7900,amount_refunded:0,disputed:false};
const paidSession={
  id:'cs_test_checkout123',url:'https://checkout.stripe.test/session',status:'open',mode:'payment',payment_status:'paid',
  client_reference_id:'11111111-1111-4111-8111-111111111111',customer:'cus_test_ready',payment_intent:'pi_test_ready',
  metadata:{user_id:'11111111-1111-4111-8111-111111111111',product_key:'readytoconsult_partner_review_v1'},
  line_items:{data:[{price:{id:'price_test_readytoconsult_79'}}]},amount_total:7900,currency:'usd',livemode:false
};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
  const u=String(url);calls.push({url:u,method:options.method||'GET',body:options.body||'',headers:options.headers||{}});
  if(u.includes('/rest/v1/rpc/readytoconsult_access_state'))return Response.json(access);
  if(u.includes('/rest/v1/rpc/readytoconsult_begin_account_closure'))return Response.json({user_id:paidSession.client_reference_id,status:'closing',stripe_customer_ids:['cus_test_ready'],checkout_session_ids:['cs_test_open_delete']});
  if(u.includes('/rest/v1/rpc/readytoconsult_register_checkout_session'))return Response.json({account_closing:closingOnRegister,session_id:paidSession.id});
  if(u.includes('/rest/v1/rpc/readytoconsult_fulfill_purchase'))return Response.json({status:'fulfilled',purchase_id:'22222222-2222-4222-8222-222222222222'});
  if(u.includes('/rest/v1/rpc/readytoconsult_begin_checkout'))return Response.json({id:'33333333-3333-4333-8333-333333333333',request_key:'44444444-4444-4444-8444-444444444444',user_id:paidSession.client_reference_id,status:'creating',stripe_session_id:null,stripe_expires_at:checkoutExpiresAt});
  if(u.includes('/rest/v1/readytoconsult_billing_customers')&&(!options.method||options.method==='GET'))return Response.json(billingCreated?[{user_id:paidSession.client_reference_id,livemode:false,stripe_customer_id:'cus_test_ready'}]:[]);
  if(u.includes('/rest/v1/readytoconsult_billing_customers')&&options.method==='POST'){billingCreated=true;return Response.json([{user_id:paidSession.client_reference_id,livemode:false,stripe_customer_id:'cus_test_ready'}]);}
  if(u.includes('/rest/v1/readytoconsult_checkout_requests')&&options.method==='PATCH')return Response.json([]);
  if(u.includes('/rest/v1/readytoconsult_purchases'))return Response.json([]);
  if(u.includes('/rest/v1/readytoconsult_account_closures'))return Response.json([]);
  if(u==='https://api.stripe.com/v1/customers')return Response.json({id:'cus_test_ready'});
  if(u==='https://api.stripe.com/v1/checkout/sessions'){
    const form=new URLSearchParams(options.body);assert.equal(form.get('mode'),'payment');assert.equal(form.get('line_items[0][price]'),'price_test_readytoconsult_79');assert.equal(form.get('client_reference_id'),paidSession.client_reference_id);assert.equal(form.get('metadata[user_id]'),paidSession.client_reference_id);assert.equal(form.has('amount_total'),false);assert.ok(Number(form.get('expires_at'))>=Math.floor(Date.now()/1000)+7000);assert.match(form.get('success_url'),/session_id=\{CHECKOUT_SESSION_ID\}/);return Response.json(paidSession);
  }
  if(u.startsWith('https://api.stripe.com/v1/checkout/sessions?customer='))return Response.json({data:[paidSession]});
  if(u.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_test_open_delete/expire'))return Response.json({id:'cs_test_open_delete',status:'expired'});
  if(u.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_test_open_delete'))return Response.json({...paidSession,id:'cs_test_open_delete',status:'open',payment_status:'unpaid',payment_intent:null});
  if(u.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_test_checkout123/expire'))return Response.json({...paidSession,status:'expired'});
  if(u.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_test_checkout123'))return Response.json(paidSession);
  if(u.startsWith('https://api.stripe.com/v1/payment_intents/pi_test_ready'))return Response.json({id:'pi_test_ready',status:'succeeded',latest_charge:chargeState});
  throw new Error(`Unhandled fetch ${options.method||'GET'} ${u}`);
};

const { createCheckoutForUser, prepareAccountDeletion, restoreForUser, validatePaidSession }=await import('../veeva-master-class/server/commerce.mjs');
const user={id:paidSession.client_reference_id,email:'qa@example.com',email_confirmed_at:'2026-07-16T00:00:00Z'};
const legal={request_key:'44444444-4444-4444-8444-444444444444',accepted:true,terms_version:'2026-07-16',privacy_version:'2026-07-16',refund_version:'2026-07-16'};
const checkout=await createCheckoutForUser(user,legal);
assert.equal(checkout.url,paidSession.url);
assert.equal(checkout.reused,false);
assert.equal(billingCreated,true);
assert.equal(calls.some(c=>c.url.endsWith('/v1/checkout/sessions')&&c.method==='POST'),true);
const realDateNow=Date.now,firstAttemptNow=realDateNow();Date.now=()=>firstAttemptNow+60000;const second=await createCheckoutForUser(user,{...legal,request_key:'77777777-7777-4777-8777-777777777777'});Date.now=realDateNow;
assert.equal(second.session_id,checkout.session_id);
const stripeCreates=calls.filter(c=>c.url.endsWith('/v1/checkout/sessions')&&c.method==='POST');
assert.equal(stripeCreates.length,2);
assert.equal(stripeCreates[0].headers['Idempotency-Key'],stripeCreates[1].headers['Idempotency-Key'],'concurrent attempts share one checkout idempotency key');assert.equal(new URLSearchParams(stripeCreates[0].body).get('expires_at'),new URLSearchParams(stripeCreates[1].body).get('expires_at'),'idempotent retries reuse the persisted expiration despite time passing');

const ids=await validatePaidSession(paidSession,user.id);
assert.equal(ids.paymentIntent,'pi_test_ready');assert.equal(ids.customer,'cus_test_ready');assert.equal(ids.priceId,'price_test_readytoconsult_79');assert.equal(ids.standing.amountRefunded,0);
await assert.rejects(()=>validatePaidSession({...paidSession,amount_total:1},user.id),error=>error.code==='checkout_amount_mismatch');
await assert.rejects(()=>validatePaidSession({...paidSession,metadata:{...paidSession.metadata,user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},user.id),error=>error.code==='checkout_identity_mismatch');
await assert.rejects(()=>createCheckoutForUser(user,{...legal,request_key:'55555555-5555-4555-8555-555555555555',accepted:false}),error=>error.code==='legal_acceptance_required');

const restored=await restoreForUser(user);
assert.equal(restored.status,'restored');
assert.equal(restored.restored,1);
chargeState={...chargeState,amount_refunded:7900};
await assert.rejects(()=>restoreForUser(user),error=>error.code==='purchase_revoked');
chargeState={...chargeState,amount_refunded:0,disputed:true,dispute:{id:'dp_open',status:'under_review'}};
await assert.rejects(()=>restoreForUser(user),error=>error.code==='purchase_revoked');
chargeState={...chargeState,dispute:{id:'dp_won',status:'won'}};assert.equal((await restoreForUser(user)).status,'restored');
chargeState={...chargeState,dispute:{id:'dp_warning',status:'warning_closed'}};assert.equal((await restoreForUser(user)).status,'restored');
chargeState={...chargeState,disputed:false,dispute:null};

closingOnRegister=true;
await assert.rejects(()=>createCheckoutForUser(user,{...legal,request_key:'88888888-8888-4888-8888-888888888888'}),error=>error.code==='account_closing');
assert.ok(calls.some(c=>c.url.endsWith('/v1/checkout/sessions/cs_test_checkout123/expire')&&c.method==='POST'),'checkout created during account closure is expired');
closingOnRegister=false;
await prepareAccountDeletion(user.id);assert.ok(calls.some(c=>c.url.endsWith('/v1/checkout/sessions/cs_test_open_delete/expire')&&c.method==='POST'),'open Checkout is expired before Auth deletion');
access={...access,access:'pro',entitled:true};
await assert.rejects(()=>createCheckoutForUser(user,{...legal,request_key:'66666666-6666-4666-8666-666666666666'}),error=>error.code==='already_owned');

globalThis.fetch=originalFetch;
console.log('Commerce contract tests passed:',{checkout:checkout.session_id,restore:restored.status,serverPrice:true,identityBound:true});
