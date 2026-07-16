begin;

-- Test identities exist only inside this rolled-back transaction.
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','rtc-a@example.invalid','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','rtc-b@example.invalid','',now(),'{}','{}',now(),now());

insert into public.readytoconsult_progress(user_id,data) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"owner":"a"}'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"owner":"b"}');

-- RLS: anonymous sees nothing; User A sees only A; service role sees both.
set local role anon;
do $$ begin
  begin
    if (select count(*) from public.readytoconsult_progress) <> 0 then raise exception 'anon_rls_failed'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin if (select count(*) from public.readytoconsult_progress) <> 1 then raise exception 'user_a_rls_failed'; end if; end $$;
do $$ begin
  begin
    update public.readytoconsult_progress set data='{"bad":true}' where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    if found then raise exception 'cross_account_update_succeeded'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin if (select count(*) from public.readytoconsult_progress where user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) <> 2 then raise exception 'service_role_rls_failed'; end if; end $$;
reset role;

-- One active checkout row and one server idempotency key per account/product.
select public.readytoconsult_begin_checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','readytoconsult_partner_review_v1','11111111-1111-4111-8111-111111111111','2026-07-16','2026-07-16','2026-07-16');
select public.readytoconsult_begin_checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','readytoconsult_partner_review_v1','22222222-2222-4222-8222-222222222222','2026-07-16','2026-07-16','2026-07-16');
do $$ begin if (select count(*) from public.readytoconsult_checkout_requests where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status in ('creating','open')) <> 1 then raise exception 'open_checkout_uniqueness_failed'; end if; end $$;

-- Simulate a Stripe-created session whose function crashed before registration; stale cleanup marks the request failed while Stripe can still accept payment.
update public.readytoconsult_checkout_requests set status='failed',updated_at=now()-interval '6 minutes' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
-- Account closure captures the recent failed unregistered request, serializes against Checkout, and accepts its trusted metadata.
select public.readytoconsult_begin_account_closure('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.readytoconsult_register_checkout_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from public.readytoconsult_checkout_requests where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1),'cs_test_closing','cus_test_closing');
do $$ begin
  if not exists(select 1 from public.readytoconsult_account_closures where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and 'cs_test_closing'=any(checkout_session_ids) and (select id from public.readytoconsult_checkout_requests where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1)=any(checkout_request_ids)) then raise exception 'closure_session_or_request_race_not_captured'; end if;
  begin
    perform public.readytoconsult_begin_checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','readytoconsult_partner_review_v1','33333333-3333-4333-8333-333333333333','2026-07-16','2026-07-16','2026-07-16');
    raise exception 'checkout_started_after_closure';
  exception when others then if sqlerrm<>'account_closing' then raise; end if; end;
end $$;
select public.readytoconsult_record_late_refund('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','evt_refund_pending','refund.created',false,'cs_test_closing','re_sql_lifecycle','pending');
select public.readytoconsult_record_late_refund('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','evt_refund_success','refund.updated',false,'cs_test_closing','re_sql_lifecycle','succeeded');
select public.readytoconsult_record_late_refund('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','evt_refund_delayed','refund.created',false,'cs_test_closing','re_sql_lifecycle','pending');
select public.readytoconsult_record_late_refund('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','evt_refund_success','refund.updated',false,'cs_test_closing','re_sql_lifecycle','succeeded');
do $$ begin if not exists(select 1 from public.readytoconsult_account_closures where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and late_refund_status='succeeded' and status='late_payment_refunded') then raise exception 'refund_state_regressed_or_duplicate_reprocessed'; end if; end $$;

-- Exactly-once stale reservation release.
insert into public.readytoconsult_entitlements(id,user_id,product_key,grant_key,grant_type,status,quota_total,quota_used)
values('31111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','readytoconsult_partner_review_v1','trial','trial','active',3,1);
insert into public.readytoconsult_evaluator_requests(request_id,user_id,product_key,entitlement_id,input_hash,case_id,stage,rubric_version,status,created_at)
values('41111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','readytoconsult_partner_review_v1','31111111-1111-4111-8111-111111111111',repeat('a',64),'safety_ai_operating_model','math','1.0.0','started',now()-interval '4 minutes');
select public.readytoconsult_release_stale_evaluations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.readytoconsult_release_stale_evaluations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin
  if (select quota_used from public.readytoconsult_entitlements where id='31111111-1111-4111-8111-111111111111') <> 0 then raise exception 'stale_quota_not_released_once'; end if;
  if (select status from public.readytoconsult_evaluator_requests where request_id='41111111-1111-4111-8111-111111111111') <> 'failed' then raise exception 'stale_request_not_failed'; end if;
end $$;

-- Fresh in-flight reservation is refunded before learning-data deletion.
update public.readytoconsult_entitlements set quota_used=1 where id='31111111-1111-4111-8111-111111111111';
insert into public.readytoconsult_evaluator_requests(request_id,user_id,product_key,entitlement_id,input_hash,case_id,stage,rubric_version,status,created_at)
values('42222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','readytoconsult_partner_review_v1','31111111-1111-4111-8111-111111111111',repeat('b',64),'safety_ai_operating_model','synthesis','1.0.0','started',now());
select public.readytoconsult_delete_learning_data('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin
  if (select quota_used from public.readytoconsult_entitlements where id='31111111-1111-4111-8111-111111111111') <> 0 then raise exception 'fresh_delete_quota_not_refunded'; end if;
  if exists(select 1 from public.readytoconsult_evaluator_requests where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'learning_data_not_deleted'; end if;
end $$;

-- Idempotent fulfillment creates one purchase and one grant.
select public.readytoconsult_fulfill_purchase('evt_test_paid','checkout.session.completed',false,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','readytoconsult_partner_review_v1','cs_test_sql','pi_test_sql','cus_test_sql','price_test_sql',7900,0,'usd',100);
select public.readytoconsult_fulfill_purchase('evt_test_paid','checkout.session.completed',false,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','readytoconsult_partner_review_v1','cs_test_sql','pi_test_sql','cus_test_sql','price_test_sql',7900,0,'usd',100);
do $$ begin
  if (select count(*) from public.readytoconsult_purchases where stripe_checkout_session_id='cs_test_sql') <> 1 then raise exception 'purchase_idempotency_failed'; end if;
  if (select count(*) from public.readytoconsult_entitlements where grant_key='purchase:cs_test_sql') <> 1 then raise exception 'grant_idempotency_failed'; end if;
end $$;

-- Refund/dispute changes only the affected purchase grant.
select public.readytoconsult_revoke_purchase('evt_test_refund','charge.refunded',false,'pi_test_sql',7900,'full_refund');
do $$ begin if (select status from public.readytoconsult_entitlements where grant_key='purchase:cs_test_sql') <> 'revoked' then raise exception 'refund_revoke_failed'; end if; end $$;

-- Retention cleanup removes expired operational records on schedule.
insert into public.readytoconsult_stripe_events(stripe_event_id,event_type,livemode,status,received_at) values('evt_old','checkout.session.expired',false,'ignored',now()-interval '91 days');
insert into public.readytoconsult_account_closures(user_id,status,created_at,updated_at) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','closed',now()-interval '13 months',now()-interval '1 year 1 day');
insert into public.readytoconsult_evaluator_requests(request_id,user_id,product_key,input_hash,case_id,stage,rubric_version,status,last_error,created_at,completed_at)
values('43333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','readytoconsult_partner_review_v1',repeat('c',64),'oncology_launch_access','clarify','1.0.0','failed','test',now()-interval '31 days',now()-interval '31 days');
select public.readytoconsult_retention_cleanup();
do $$ begin
  if exists(select 1 from public.readytoconsult_stripe_events where stripe_event_id='evt_old') then raise exception 'stripe_retention_failed'; end if;
  if exists(select 1 from public.readytoconsult_evaluator_requests where request_id='43333333-3333-4333-8333-333333333333') then raise exception 'evaluation_retention_failed'; end if;
  if exists(select 1 from public.readytoconsult_account_closures where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') then raise exception 'closure_retention_failed'; end if;
end $$;

-- Account deletion creates a safety tombstone, cascades access, and retains an anonymized financial record.
select public.readytoconsult_begin_account_closure('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
delete from auth.users where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$ begin
  if exists(select 1 from public.readytoconsult_entitlements where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'account_entitlement_cascade_failed'; end if;
  if not exists(select 1 from public.readytoconsult_purchases where stripe_checkout_session_id='cs_test_sql' and user_id is null) then raise exception 'purchase_anonymization_failed'; end if;
end $$;

rollback;
