SET check_function_bodies = OFF;

CREATE OR REPLACE FUNCTION public.update_users(
    user_id uuid,
    user_email text,
    user_title text,
    user_full_name text,
    user_birthday text,
    user_contact_number text,
    user_avatar_url text,
    user_billing_address jsonb,
    user_club_rules_agreement boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = ''
AS $function$
BEGIN
  -- Update auth.users
  UPDATE auth.users
  SET
    email = user_email,
    raw_user_meta_data = raw_user_meta_data
    || jsonb_build_object(
      'email', user_email,
      'title', user_title,
      'full_name', user_full_name,
      'birthday', user_birthday,
      'contact_number', user_contact_number,
      'avatar_url', user_avatar_url,
      'billing_address', user_billing_address,
      'club_rules_agreement', user_club_rules_agreement
    )
  WHERE id = user_id;

  -- Update public.users
  UPDATE public.users
  SET email = COALESCE(user_email, public.users.email),
      title = COALESCE(user_title, public.users.title),
      full_name = COALESCE(user_full_name, public.users.full_name),
      birthday = CAST(NULLIF(user_birthday, '') AS DATE),
      contact_number = COALESCE(user_contact_number, public.users
      .contact_number),
      avatar_url = COALESCE(user_avatar_url, public.users.avatar_url),
      billing_address = COALESCE(user_billing_address, public.users
      .billing_address),
      club_rules_agreement = COALESCE(user_club_rules_agreement, public.users
      .club_rules_agreement)
  WHERE id = user_id;
END;
$function$;
