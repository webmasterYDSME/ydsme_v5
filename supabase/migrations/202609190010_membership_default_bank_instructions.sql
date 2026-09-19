-- The starting bank transfer instructions told people to "use the unique membership reference
-- shown in your payment instructions", but payments are matched by the member's full name (the
-- renewal emails and the apply page already say so). Only the untouched starting text, on
-- payment details nobody has set up yet, is changed. Anything an officer has written stays.
update public.membership_payment_settings_versions
   set bank_transfer_instructions='Use your full name as the payment reference so we can match your payment.'
 where not configured
   and bank_transfer_instructions='Use the unique membership reference shown in your payment instructions.';
