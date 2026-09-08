-- The online-renewal function retains a legacy cash-reference argument for
-- signature compatibility. Rejecting a value explicitly both tightens the
-- Stripe-only contract and prevents the parameter from becoming misleading.

do $$
declare
  v_signature text := 'public.activate_membership_renewal(uuid,uuid,integer,text,integer,date,uuid,text,text,text,text,text,text,text,boolean,timestamp with time zone,timestamp with time zone,timestamp with time zone)';
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(v_signature::regprocedure) into v_definition;
  v_repaired := pg_catalog.replace(
    v_definition,
    'p_actor_id is not null or p_stripe_checkout_session_id is null',
    'p_actor_id is not null or p_cash_receipt_reference is not null or p_stripe_checkout_session_id is null'
  );
  if v_repaired = v_definition then
    raise exception 'membership_renewal_parameter_guard_source_not_found';
  end if;
  execute v_repaired;
  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(v_signature::regprocedure),
    'p_cash_receipt_reference is not null'
  ) = 0 then
    raise exception 'membership_renewal_parameter_guard_failed';
  end if;
end;
$$;
