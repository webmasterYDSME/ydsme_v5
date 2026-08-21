-- Qualify the honorary member column in both renewal functions. The functions
-- return a column named member_id, so an unqualified member_id in PL/pgSQL is
-- ambiguous on the honorary-revocation prepayment path.
do $$
declare
  v_signature text;
  v_definition text;
  v_repaired text;
begin
  foreach v_signature in array array[
    'public.activate_offline_membership_renewal(uuid,uuid,integer,text,integer,date,text,uuid)',
    'public.activate_membership_renewal(uuid,uuid,integer,text,integer,date,uuid,text,text,text,text,text,text,text,boolean,timestamp with time zone,timestamp with time zone,timestamp with time zone)'
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature::regprocedure) into v_definition;
    v_repaired := pg_catalog.regexp_replace(
      v_definition,
      'from public\.honorary_memberships[[:space:]]+where member_id[[:space:]]*=[[:space:]]*p_member_id',
      'from public.honorary_memberships honorary where honorary.member_id=p_member_id',
      'i'
    );
    if v_repaired <> v_definition then
      execute v_repaired;
    end if;
    if pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_signature::regprocedure),'honorary.member_id=p_member_id')=0 then
      raise exception 'membership_honorary_renewal_qualification_failed: %',v_signature;
    end if;
  end loop;
end;
$$;
