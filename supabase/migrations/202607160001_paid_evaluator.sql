begin;

create extension if not exists pgcrypto;

create table if not exists public.readytoconsult_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.readytoconsult_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.readytoconsult_billing_customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  livemode boolean not null,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  primary key (user_id, livemode)
);

create table if not exists public.readytoconsult_account_closures (
  user_id uuid primary key,
  stripe_customer_ids text[] not null default '{}',
  checkout_session_ids text[] not null default '{}',
  checkout_request_ids uuid[] not null default '{}',
  status text not null default 'closing',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  late_refunded_at timestamptz,
  late_refund_id text,
  late_refund_status text,
  updated_at timestamptz not null default now()
);

create table if not exists public.readytoconsult_checkout_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null default 'readytoconsult_partner_review_v1',
  stripe_session_id text unique,
  stripe_expires_at timestamptz not null default (now() + interval '2 hours'),
  status text not null default 'creating' check (status in ('creating','open','account_closing','completed','expired','failed')),
  terms_version text not null,
  privacy_version text not null,
  refund_version text not null,
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_key, request_key)
);

create unique index if not exists readytoconsult_one_open_checkout_idx
  on public.readytoconsult_checkout_requests (user_id, product_key)
  where status in ('creating','open');

create table if not exists public.readytoconsult_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  product_key text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text not null,
  stripe_price_id text not null,
  amount_total integer not null check (amount_total >= 0),
  amount_refunded integer not null default 0 check (amount_refunded >= 0),
  currency text not null,
  status text not null check (status in ('pending','paid','partially_refunded','refunded','disputed','failed')),
  livemode boolean not null,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.readytoconsult_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null,
  grant_key text not null,
  grant_type text not null check (grant_type in ('trial','purchase','admin')),
  purchase_id uuid references public.readytoconsult_purchases(id) on delete restrict,
  status text not null default 'active' check (status in ('active','revoked','suspended')),
  quota_total integer not null check (quota_total = -1 or quota_total >= 0),
  quota_used integer not null default 0 check (quota_used >= 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  updated_at timestamptz not null default now(),
  unique (user_id, product_key, grant_key),
  unique (purchase_id)
);

create index if not exists readytoconsult_entitlements_user_status_idx
  on public.readytoconsult_entitlements (user_id, product_key, status);

create table if not exists public.readytoconsult_stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  object_id text,
  status text not null check (status in ('processing','processed','failed','ignored')),
  attempt_count integer not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create table if not exists public.readytoconsult_evaluator_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null,
  entitlement_id uuid references public.readytoconsult_entitlements(id) on delete set null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  case_id text not null,
  stage text not null,
  rubric_version text not null,
  status text not null check (status in ('started','completed','failed')),
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, input_hash),
  unique (request_id, user_id)
);

create index if not exists readytoconsult_evaluator_user_created_idx
  on public.readytoconsult_evaluator_requests (user_id, created_at desc);

create table if not exists public.readytoconsult_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evaluation_id uuid,
  context text not null check (context in ('semantic_evaluation','interview_studio','market_access_lab','product')),
  rating smallint not null check (rating between 1 and 5),
  message text not null default '' check (char_length(message) <= 1500),
  consent_to_contact boolean not null default false,
  consent_to_publish boolean not null default false,
  moderation_status text not null default 'private' check (moderation_status in ('private','reviewed','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (evaluation_id, user_id)
    references public.readytoconsult_evaluator_requests(request_id, user_id)
    on delete set null (evaluation_id)
);

alter table public.readytoconsult_roles enable row level security;
alter table public.readytoconsult_billing_customers enable row level security;
alter table public.readytoconsult_account_closures enable row level security;
alter table public.readytoconsult_checkout_requests enable row level security;
alter table public.readytoconsult_purchases enable row level security;
alter table public.readytoconsult_entitlements enable row level security;
alter table public.readytoconsult_stripe_events enable row level security;
alter table public.readytoconsult_evaluator_requests enable row level security;
alter table public.readytoconsult_feedback enable row level security;

revoke all on public.readytoconsult_roles from anon, authenticated;
revoke all on public.readytoconsult_billing_customers from anon, authenticated;
revoke all on public.readytoconsult_account_closures from anon, authenticated;
revoke all on public.readytoconsult_checkout_requests from anon, authenticated;
revoke all on public.readytoconsult_purchases from anon, authenticated;
revoke all on public.readytoconsult_entitlements from anon, authenticated;
revoke all on public.readytoconsult_stripe_events from anon, authenticated;
revoke all on public.readytoconsult_evaluator_requests from anon, authenticated;
revoke all on public.readytoconsult_feedback from anon, authenticated;

grant select on public.readytoconsult_roles to authenticated;
grant select on public.readytoconsult_purchases to authenticated;
grant select on public.readytoconsult_entitlements to authenticated;
grant select on public.readytoconsult_evaluator_requests to authenticated;
grant select, insert, update, delete on public.readytoconsult_feedback to authenticated;

drop policy if exists readytoconsult_roles_select_own on public.readytoconsult_roles;
create policy readytoconsult_roles_select_own on public.readytoconsult_roles
  for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists readytoconsult_purchases_select_own on public.readytoconsult_purchases;
create policy readytoconsult_purchases_select_own on public.readytoconsult_purchases
  for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists readytoconsult_entitlements_select_own on public.readytoconsult_entitlements;
create policy readytoconsult_entitlements_select_own on public.readytoconsult_entitlements
  for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists readytoconsult_evaluations_select_own on public.readytoconsult_evaluator_requests;
create policy readytoconsult_evaluations_select_own on public.readytoconsult_evaluator_requests
  for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists readytoconsult_feedback_select_own on public.readytoconsult_feedback;
create policy readytoconsult_feedback_select_own on public.readytoconsult_feedback
  for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists readytoconsult_feedback_insert_own on public.readytoconsult_feedback;
create policy readytoconsult_feedback_insert_own on public.readytoconsult_feedback
  for insert to authenticated with check (
    auth.uid() is not null and auth.uid() = user_id and moderation_status = 'private'
  );

drop policy if exists readytoconsult_feedback_update_own on public.readytoconsult_feedback;
create policy readytoconsult_feedback_update_own on public.readytoconsult_feedback
  for update to authenticated using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id and moderation_status = 'private');

drop policy if exists readytoconsult_feedback_delete_own on public.readytoconsult_feedback;
create policy readytoconsult_feedback_delete_own on public.readytoconsult_feedback
  for delete to authenticated using (auth.uid() is not null and auth.uid() = user_id);

create or replace function public.readytoconsult_release_stale_evaluations(
  p_user_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_released integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 4201));
  for v_request in
    select request_id, entitlement_id
    from public.readytoconsult_evaluator_requests
    where user_id = p_user_id and status = 'started' and created_at <= now() - interval '3 minutes'
    for update
  loop
    if v_request.entitlement_id is not null then
      update public.readytoconsult_entitlements
      set quota_used = greatest(quota_used - 1, 0), updated_at = now()
      where id = v_request.entitlement_id and quota_total >= 0;
    end if;
    update public.readytoconsult_evaluator_requests
    set status = 'failed', last_error = 'reservation_expired', completed_at = now()
    where request_id = v_request.request_id and status = 'started';
    v_released := v_released + 1;
  end loop;
  return v_released;
end;
$$;

create or replace function public.readytoconsult_access_state(
  p_user_id uuid,
  p_product_key text default 'readytoconsult_partner_review_v1'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_paid boolean;
  v_trial_remaining integer;
  v_paid_remaining integer;
  v_total_remaining integer;
begin
  perform public.readytoconsult_release_stale_evaluations(p_user_id);
  insert into public.readytoconsult_entitlements (
    user_id, product_key, grant_key, grant_type, status, quota_total, quota_used
  ) values (
    p_user_id, p_product_key, 'trial', 'trial', 'active', 3, 0
  ) on conflict (user_id, product_key, grant_key) do nothing;

  select role into v_role
  from public.readytoconsult_roles
  where user_id = p_user_id;

  select exists (
    select 1 from public.readytoconsult_entitlements
    where user_id = p_user_id and product_key = p_product_key
      and status = 'active' and grant_type in ('purchase','admin')
  ) into v_paid;

  select coalesce(sum(greatest(quota_total - quota_used, 0)), 0)
  into v_trial_remaining
  from public.readytoconsult_entitlements
  where user_id = p_user_id and product_key = p_product_key
    and status = 'active' and grant_type = 'trial' and quota_total >= 0;

  select case
    when count(*) filter (where quota_total = -1) > 0 then -1
    else coalesce(sum(greatest(quota_total - quota_used, 0)), 0)
  end
  into v_paid_remaining
  from public.readytoconsult_entitlements
  where user_id = p_user_id and product_key = p_product_key
    and status = 'active' and grant_type in ('purchase','admin');

  v_total_remaining := case
    when v_role in ('owner','admin') or v_paid_remaining = -1 then -1
    else v_trial_remaining + v_paid_remaining
  end;

  return jsonb_build_object(
    'authenticated', true,
    'access', case when v_role in ('owner','admin') then 'owner' when v_paid then 'pro' else 'trial' end,
    'role', v_role,
    'product', p_product_key,
    'trial_remaining', v_trial_remaining,
    'paid_remaining', v_paid_remaining,
    'reviews_remaining', v_total_remaining,
    'entitled', (v_role in ('owner','admin') or v_paid),
    'can_evaluate', (v_total_remaining = -1 or v_total_remaining > 0)
  );
end;
$$;

create or replace function public.readytoconsult_reserve_evaluation(
  p_request_id uuid,
  p_user_id uuid,
  p_product_key text,
  p_input_hash text,
  p_case_id text,
  p_stage text,
  p_rubric_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.readytoconsult_evaluator_requests%rowtype;
  v_grant public.readytoconsult_entitlements%rowtype;
  v_role text;
  v_hour_count integer;
  v_day_count integer;
  v_hour_limit integer;
  v_day_limit integer;
  v_access jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 4201));
  v_access := public.readytoconsult_access_state(p_user_id, p_product_key);

  select * into v_existing
  from public.readytoconsult_evaluator_requests
  where user_id = p_user_id and input_hash = p_input_hash
  for update;

  if found and v_existing.status = 'completed' then
    return jsonb_build_object(
      'status','cached', 'request_id',v_existing.request_id,
      'result',v_existing.result, 'access',v_access
    );
  end if;

  if found and v_existing.status = 'started' and v_existing.created_at > now() - interval '3 minutes' then
    return jsonb_build_object('status','in_progress','request_id',v_existing.request_id,'access',v_access);
  end if;

  select role into v_role from public.readytoconsult_roles where user_id = p_user_id;
  v_hour_limit := case when v_role in ('owner','admin') then 30 else 10 end;
  v_day_limit := case when v_role in ('owner','admin') then 500 else 30 end;

  select count(*) into v_hour_count
  from public.readytoconsult_evaluator_requests
  where user_id = p_user_id and created_at > now() - interval '1 hour'
    and status in ('started','completed');

  select count(*) into v_day_count
  from public.readytoconsult_evaluator_requests
  where user_id = p_user_id and created_at > now() - interval '24 hours'
    and status in ('started','completed');

  if v_hour_count >= v_hour_limit or v_day_count >= v_day_limit then
    return jsonb_build_object('status','rate_limited','hour_count',v_hour_count,'day_count',v_day_count,'access',v_access);
  end if;

  if v_role not in ('owner','admin') then
    select * into v_grant
    from public.readytoconsult_entitlements
    where user_id = p_user_id and product_key = p_product_key and status = 'active'
      and (quota_total = -1 or quota_used < quota_total)
    order by case grant_type when 'trial' then 0 when 'purchase' then 1 else 2 end, granted_at
    limit 1
    for update;

    if not found then
      return jsonb_build_object('status','no_credits','access',v_access);
    end if;

    if v_grant.quota_total >= 0 then
      update public.readytoconsult_entitlements
      set quota_used = quota_used + 1, updated_at = now()
      where id = v_grant.id;
    end if;
  end if;

  if v_existing.request_id is not null then
    update public.readytoconsult_evaluator_requests
    set request_id = p_request_id,
        entitlement_id = case when v_role in ('owner','admin') then null else v_grant.id end,
        status = 'started', provider = null, model = null, input_tokens = null,
        output_tokens = null, latency_ms = null, result = null, last_error = null,
        created_at = now(), completed_at = null
    where user_id = p_user_id and input_hash = p_input_hash;
  else
    insert into public.readytoconsult_evaluator_requests (
      request_id, user_id, product_key, entitlement_id, input_hash,
      case_id, stage, rubric_version, status
    ) values (
      p_request_id, p_user_id, p_product_key,
      case when v_role in ('owner','admin') then null else v_grant.id end,
      p_input_hash, p_case_id, p_stage, p_rubric_version, 'started'
    );
  end if;

  v_access := public.readytoconsult_access_state(p_user_id, p_product_key);
  return jsonb_build_object('status','reserved','request_id',p_request_id,'access',v_access);
end;
$$;

create or replace function public.readytoconsult_complete_evaluation(
  p_request_id uuid,
  p_user_id uuid,
  p_result jsonb,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_latency_ms integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.readytoconsult_evaluator_requests
  set status = 'completed', result = p_result, provider = p_provider, model = p_model,
      input_tokens = p_input_tokens, output_tokens = p_output_tokens,
      latency_ms = p_latency_ms, completed_at = now(), last_error = null
  where request_id = p_request_id and user_id = p_user_id and status = 'started';
  return found;
end;
$$;

create or replace function public.readytoconsult_fail_evaluation(
  p_request_id uuid,
  p_user_id uuid,
  p_error text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant_id uuid;
begin
  select entitlement_id into v_grant_id
  from public.readytoconsult_evaluator_requests
  where request_id = p_request_id and user_id = p_user_id and status = 'started'
  for update;

  if not found then return false; end if;

  if v_grant_id is not null then
    update public.readytoconsult_entitlements
    set quota_used = greatest(quota_used - 1, 0), updated_at = now()
    where id = v_grant_id and quota_total >= 0;
  end if;

  update public.readytoconsult_evaluator_requests
  set status = 'failed', last_error = left(coalesce(p_error,'evaluation_failed'), 240), completed_at = now()
  where request_id = p_request_id and user_id = p_user_id;

  return true;
end;
$$;

create or replace function public.readytoconsult_begin_checkout(
  p_user_id uuid,
  p_product_key text,
  p_request_key uuid,
  p_terms_version text,
  p_privacy_version text,
  p_refund_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkout public.readytoconsult_checkout_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_product_key, 4202));
  if exists(select 1 from public.readytoconsult_account_closures where user_id=p_user_id) then raise exception 'account_closing'; end if;
  select * into v_checkout
  from public.readytoconsult_checkout_requests
  where user_id=p_user_id and product_key=p_product_key and status in ('creating','open')
  order by created_at desc limit 1 for update;

  if found and v_checkout.status='creating' and v_checkout.updated_at <= now() - interval '5 minutes' then
    update public.readytoconsult_checkout_requests set status='failed', updated_at=now() where id=v_checkout.id;
    v_checkout := null;
  end if;

  if v_checkout.id is null then
    insert into public.readytoconsult_checkout_requests (
      request_key,user_id,product_key,status,terms_version,privacy_version,refund_version,accepted_at
    ) values (
      p_request_key,p_user_id,p_product_key,'creating',p_terms_version,p_privacy_version,p_refund_version,now()
    ) on conflict (user_id,product_key,request_key) do update set
      status='creating',terms_version=excluded.terms_version,privacy_version=excluded.privacy_version,
      refund_version=excluded.refund_version,accepted_at=now(),updated_at=now(),stripe_session_id=null
    returning * into v_checkout;
  end if;

  return to_jsonb(v_checkout);
end;
$$;

create or replace function public.readytoconsult_begin_account_closure(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customers text[]; v_sessions text[]; v_requests uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':readytoconsult_partner_review_v1',4202));
  select coalesce(array_agg(distinct stripe_customer_id) filter(where stripe_customer_id is not null),'{}') into v_customers from public.readytoconsult_billing_customers where user_id=p_user_id;
  select coalesce(array_agg(distinct stripe_session_id) filter(where stripe_session_id is not null),'{}'),coalesce(array_agg(distinct id),'{}') into v_sessions,v_requests from public.readytoconsult_checkout_requests where user_id=p_user_id and (status in ('creating','open','account_closing') or (status='failed' and stripe_session_id is null and updated_at>now()-interval '3 hours'));
  insert into public.readytoconsult_account_closures(user_id,stripe_customer_ids,checkout_session_ids,checkout_request_ids,status)
  values(p_user_id,v_customers,v_sessions,v_requests,'closing')
  on conflict(user_id) do update set
    stripe_customer_ids=(select coalesce(array_agg(distinct value),'{}') from unnest(public.readytoconsult_account_closures.stripe_customer_ids||excluded.stripe_customer_ids) value),
    checkout_session_ids=(select coalesce(array_agg(distinct value),'{}') from unnest(public.readytoconsult_account_closures.checkout_session_ids||excluded.checkout_session_ids) value),
    checkout_request_ids=(select coalesce(array_agg(distinct value),'{}') from unnest(public.readytoconsult_account_closures.checkout_request_ids||excluded.checkout_request_ids) value),
    status='closing',updated_at=now();
  update public.readytoconsult_checkout_requests set status='account_closing',updated_at=now() where user_id=p_user_id and status in ('creating','open');
  return (select to_jsonb(c) from public.readytoconsult_account_closures c where user_id=p_user_id);
end; $$;

create or replace function public.readytoconsult_register_checkout_session(p_user_id uuid,p_checkout_id uuid,p_session_id text,p_customer_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_closing boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':readytoconsult_partner_review_v1',4202));
  select exists(select 1 from public.readytoconsult_account_closures where user_id=p_user_id) into v_closing;
  if v_closing then
    update public.readytoconsult_account_closures set
      stripe_customer_ids=case when p_customer_id=any(stripe_customer_ids) then stripe_customer_ids else array_append(stripe_customer_ids,p_customer_id) end,
      checkout_session_ids=case when p_session_id=any(checkout_session_ids) then checkout_session_ids else array_append(checkout_session_ids,p_session_id) end,
      updated_at=now() where user_id=p_user_id;
    update public.readytoconsult_checkout_requests set stripe_session_id=p_session_id,status='account_closing',updated_at=now() where id=p_checkout_id and user_id=p_user_id;
  else
    update public.readytoconsult_checkout_requests set stripe_session_id=p_session_id,status='open',updated_at=now() where id=p_checkout_id and user_id=p_user_id and status='creating';
    if not found then raise exception 'checkout_state_conflict'; end if;
  end if;
  return jsonb_build_object('account_closing',v_closing,'session_id',p_session_id);
end; $$;

create or replace function public.readytoconsult_finish_account_closure(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin update public.readytoconsult_account_closures set status='closed',closed_at=now(),updated_at=now() where user_id=p_user_id;return found;end; $$;

create or replace function public.readytoconsult_record_late_refund(p_user_id uuid,p_event_id text,p_event_type text,p_livemode boolean,p_session_id text,p_refund_id text,p_refund_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inserted integer; v_closure public.readytoconsult_account_closures%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':readytoconsult_partner_review_v1',4202));
  insert into public.readytoconsult_stripe_events(stripe_event_id,event_type,livemode,object_id,status,processed_at)
  values(p_event_id,p_event_type,p_livemode,p_refund_id,'processed',now()) on conflict(stripe_event_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return jsonb_build_object('status','already_processed','refund_id',p_refund_id); end if;
  select * into v_closure from public.readytoconsult_account_closures where user_id=p_user_id for update;
  if not found then raise exception 'account_closure_not_found'; end if;
  if v_closure.late_refund_id=p_refund_id and v_closure.late_refund_status in ('succeeded','failed','canceled') then
    return jsonb_build_object('status',v_closure.status,'refund_id',p_refund_id,'refund_status',v_closure.late_refund_status);
  end if;
  update public.readytoconsult_account_closures set
    status=case when p_refund_status='succeeded' then 'late_payment_refunded' when p_refund_status in ('failed','canceled') then 'late_refund_failed' else 'late_refund_pending' end,
    late_refunded_at=case when p_refund_status='succeeded' then coalesce(late_refunded_at,now()) else late_refunded_at end,
    late_refund_id=p_refund_id,late_refund_status=p_refund_status,
    checkout_session_ids=case when nullif(p_session_id,'') is null or p_session_id=any(checkout_session_ids) then checkout_session_ids else array_append(checkout_session_ids,p_session_id) end,updated_at=now()
  where user_id=p_user_id;
  return jsonb_build_object('status',case when p_refund_status='succeeded' then 'late_payment_refunded' when p_refund_status in ('failed','canceled') then 'late_refund_failed' else 'late_refund_pending' end,'refund_id',p_refund_id,'refund_status',p_refund_status);
end; $$;

create or replace function public.readytoconsult_fulfill_purchase(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_user_id uuid,
  p_product_key text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_customer_id text,
  p_price_id text,
  p_amount_total integer,
  p_amount_refunded integer,
  p_currency text,
  p_quota integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_status text;
  v_purchase_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_product_key,4202));
  if exists(select 1 from public.readytoconsult_account_closures where user_id=p_user_id) then raise exception 'account_closing'; end if;
  select status into v_event_status from public.readytoconsult_stripe_events where stripe_event_id = p_event_id for update;
  if v_event_status = 'processed' then
    return jsonb_build_object('status','already_processed');
  end if;

  insert into public.readytoconsult_stripe_events (
    stripe_event_id, event_type, livemode, object_id, status
  ) values (p_event_id, p_event_type, p_livemode, p_checkout_session_id, 'processing')
  on conflict (stripe_event_id) do update set
    attempt_count = public.readytoconsult_stripe_events.attempt_count + 1,
    status = 'processing', last_error = null;

  insert into public.readytoconsult_purchases (
    user_id, product_key, stripe_checkout_session_id, stripe_payment_intent_id,
    stripe_customer_id, stripe_price_id, amount_total, amount_refunded, currency, status, livemode, paid_at
  ) values (
    p_user_id, p_product_key, p_checkout_session_id, nullif(p_payment_intent_id,''),
    p_customer_id, p_price_id, p_amount_total, greatest(coalesce(p_amount_refunded,0),0), lower(p_currency),
    case when coalesce(p_amount_refunded,0)>0 then 'partially_refunded' else 'paid' end, p_livemode, now()
  ) on conflict (stripe_checkout_session_id) do update set
    user_id = excluded.user_id,
    stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, public.readytoconsult_purchases.stripe_payment_intent_id),
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_price_id = excluded.stripe_price_id,
    amount_total = excluded.amount_total,
    amount_refunded = greatest(public.readytoconsult_purchases.amount_refunded, excluded.amount_refunded),
    currency = excluded.currency,
    status = case when excluded.amount_refunded>0 then 'partially_refunded' else 'paid' end, livemode = excluded.livemode, paid_at = coalesce(public.readytoconsult_purchases.paid_at, now()), updated_at = now()
  returning id into v_purchase_id;

  insert into public.readytoconsult_entitlements (
    user_id, product_key, grant_key, grant_type, purchase_id, status, quota_total, quota_used
  ) values (
    p_user_id, p_product_key, 'purchase:' || p_checkout_session_id, 'purchase', v_purchase_id, 'active', p_quota, 0
  ) on conflict (purchase_id) do update set
    status = 'active', revoked_at = null, revoke_reason = null, updated_at = now();

  update public.readytoconsult_checkout_requests
  set status = 'completed', updated_at = now()
  where user_id = p_user_id and stripe_session_id = p_checkout_session_id;

  update public.readytoconsult_stripe_events
  set status = 'processed', processed_at = now(), last_error = null
  where stripe_event_id = p_event_id;

  return jsonb_build_object('status','fulfilled','purchase_id',v_purchase_id);
exception when others then
  update public.readytoconsult_stripe_events
  set status = 'failed', last_error = left(sqlerrm,240)
  where stripe_event_id = p_event_id;
  raise;
end;
$$;

create or replace function public.readytoconsult_revoke_purchase(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_payment_intent_id text,
  p_amount_refunded integer,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_status text;
  v_purchase public.readytoconsult_purchases%rowtype;
  v_full_revoke boolean;
begin
  select status into v_event_status from public.readytoconsult_stripe_events where stripe_event_id = p_event_id for update;
  if v_event_status = 'processed' then return jsonb_build_object('status','already_processed'); end if;

  insert into public.readytoconsult_stripe_events (
    stripe_event_id, event_type, livemode, object_id, status
  ) values (p_event_id, p_event_type, p_livemode, p_payment_intent_id, 'processing')
  on conflict (stripe_event_id) do update set
    attempt_count = public.readytoconsult_stripe_events.attempt_count + 1,
    status = 'processing', last_error = null;

  select * into v_purchase from public.readytoconsult_purchases
  where stripe_payment_intent_id = p_payment_intent_id
  for update;
  if not found then raise exception 'purchase_not_found'; end if;

  v_full_revoke := p_reason in ('dispute','dispute_lost') or coalesce(p_amount_refunded,0) >= v_purchase.amount_total;
  update public.readytoconsult_purchases
  set amount_refunded = greatest(amount_refunded, coalesce(p_amount_refunded,0)),
      status = case when p_reason in ('dispute','dispute_lost') then 'disputed'
                    when v_full_revoke then 'refunded'
                    when coalesce(p_amount_refunded,0) > 0 then 'partially_refunded'
                    else status end,
      updated_at = now()
  where id = v_purchase.id;

  if v_full_revoke then
    update public.readytoconsult_entitlements
    set status = case when p_reason = 'dispute' then 'suspended' else 'revoked' end,
        revoked_at = now(), revoke_reason = p_reason, updated_at = now()
    where purchase_id = v_purchase.id;
  end if;

  update public.readytoconsult_stripe_events set status='processed', processed_at=now(), last_error=null
  where stripe_event_id = p_event_id;
  return jsonb_build_object('status',case when v_full_revoke then 'revoked' else 'partial_refund_recorded' end,'purchase_id',v_purchase.id);
exception when others then
  update public.readytoconsult_stripe_events set status='failed', last_error=left(sqlerrm,240)
  where stripe_event_id=p_event_id;
  raise;
end;
$$;

create or replace function public.readytoconsult_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_failed_evaluations integer;
  v_stripe_events integer;
  v_checkout_requests integer;
  v_account_closures integer;
begin
  delete from public.readytoconsult_evaluator_requests
  where status='failed' and completed_at < now() - interval '30 days';
  get diagnostics v_failed_evaluations = row_count;

  delete from public.readytoconsult_stripe_events
  where (event_type not like '%dispute%' and received_at < now() - interval '90 days')
     or (event_type like '%dispute%' and received_at < now() - interval '7 years');
  get diagnostics v_stripe_events = row_count;

  delete from public.readytoconsult_checkout_requests
  where status in ('expired','failed') and updated_at < now() - interval '90 days';
  get diagnostics v_checkout_requests = row_count;

  delete from public.readytoconsult_account_closures where updated_at < now() - interval '1 year';
  get diagnostics v_account_closures = row_count;

  return jsonb_build_object('failed_evaluations',v_failed_evaluations,'stripe_events',v_stripe_events,'checkout_requests',v_checkout_requests,'account_closures',v_account_closures,'completed_at',now());
end;
$$;

create or replace function public.readytoconsult_delete_learning_data(
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 4201));
  perform public.readytoconsult_release_stale_evaluations(p_user_id);
  for v_active in
    select request_id,entitlement_id from public.readytoconsult_evaluator_requests
    where user_id=p_user_id and status='started' for update
  loop
    if v_active.entitlement_id is not null then
      update public.readytoconsult_entitlements set quota_used=greatest(quota_used-1,0),updated_at=now()
      where id=v_active.entitlement_id and quota_total>=0;
    end if;
    update public.readytoconsult_evaluator_requests set status='failed',last_error='deleted_by_user',completed_at=now()
    where request_id=v_active.request_id and status='started';
  end loop;
  delete from public.readytoconsult_feedback where user_id=p_user_id;
  delete from public.readytoconsult_evaluator_requests where user_id=p_user_id;
  delete from public.readytoconsult_progress where user_id=p_user_id;
  return true;
end;
$$;

revoke all on function public.readytoconsult_retention_cleanup() from public, anon, authenticated;
revoke all on function public.readytoconsult_release_stale_evaluations(uuid) from public, anon, authenticated;
revoke all on function public.readytoconsult_begin_account_closure(uuid) from public, anon, authenticated;
revoke all on function public.readytoconsult_register_checkout_session(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.readytoconsult_finish_account_closure(uuid) from public, anon, authenticated;
revoke all on function public.readytoconsult_record_late_refund(uuid,text,text,boolean,text,text,text) from public, anon, authenticated;
revoke all on function public.readytoconsult_begin_checkout(uuid,text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.readytoconsult_delete_learning_data(uuid) from public, anon, authenticated;
revoke all on function public.readytoconsult_access_state(uuid,text) from public, anon, authenticated;
revoke all on function public.readytoconsult_reserve_evaluation(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.readytoconsult_complete_evaluation(uuid,uuid,jsonb,text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.readytoconsult_fail_evaluation(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.readytoconsult_fulfill_purchase(text,text,boolean,uuid,text,text,text,text,text,integer,integer,text,integer) from public, anon, authenticated;
revoke all on function public.readytoconsult_revoke_purchase(text,text,boolean,text,integer,text) from public, anon, authenticated;
grant execute on function public.readytoconsult_retention_cleanup() to service_role;
grant execute on function public.readytoconsult_release_stale_evaluations(uuid) to service_role;
grant execute on function public.readytoconsult_begin_account_closure(uuid) to service_role;
grant execute on function public.readytoconsult_register_checkout_session(uuid,uuid,text,text) to service_role;
grant execute on function public.readytoconsult_finish_account_closure(uuid) to service_role;
grant execute on function public.readytoconsult_record_late_refund(uuid,text,text,boolean,text,text,text) to service_role;
grant execute on function public.readytoconsult_begin_checkout(uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.readytoconsult_delete_learning_data(uuid) to service_role;
grant execute on function public.readytoconsult_access_state(uuid,text) to service_role;
grant execute on function public.readytoconsult_reserve_evaluation(uuid,uuid,text,text,text,text,text) to service_role;
grant execute on function public.readytoconsult_complete_evaluation(uuid,uuid,jsonb,text,text,integer,integer,integer) to service_role;
grant execute on function public.readytoconsult_fail_evaluation(uuid,uuid,text) to service_role;
grant execute on function public.readytoconsult_fulfill_purchase(text,text,boolean,uuid,text,text,text,text,text,integer,integer,text,integer) to service_role;
grant execute on function public.readytoconsult_revoke_purchase(text,text,boolean,text,integer,text) to service_role;

-- Existing progress storage: make its ownership contract reproducible in source.
alter table if exists public.readytoconsult_progress enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='readytoconsult_progress'
  loop execute format('drop policy if exists %I on public.readytoconsult_progress', p.policyname); end loop;
end $$;
revoke all on public.readytoconsult_progress from anon, authenticated;
grant select, insert, update, delete on public.readytoconsult_progress to authenticated;
drop policy if exists readytoconsult_progress_select_own on public.readytoconsult_progress;
drop policy if exists readytoconsult_progress_insert_own on public.readytoconsult_progress;
drop policy if exists readytoconsult_progress_update_own on public.readytoconsult_progress;
drop policy if exists readytoconsult_progress_delete_own on public.readytoconsult_progress;
create policy readytoconsult_progress_select_own on public.readytoconsult_progress
  for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);
create policy readytoconsult_progress_insert_own on public.readytoconsult_progress
  for insert to authenticated with check (auth.uid() is not null and auth.uid() = user_id);
create policy readytoconsult_progress_update_own on public.readytoconsult_progress
  for update to authenticated using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id);
create policy readytoconsult_progress_delete_own on public.readytoconsult_progress
  for delete to authenticated using (auth.uid() is not null and auth.uid() = user_id);

commit;
