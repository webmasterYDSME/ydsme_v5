-- Keep the built-in offline payment instructions short and practical. Only
-- replace the former defaults so officer-customised instructions are preserved.
update public.membership_payment_settings_versions
set cheque_delivery_instructions = 'Give the cheque to the Society Treasurer.'
where cheque_delivery_instructions = 'Contact the Society Treasurer to arrange delivery of your cheque.';

update public.membership_payment_settings_versions
set cash_instructions = 'Give the cash payment to the Society Treasurer.'
where cash_instructions = 'Contact the Society Treasurer to arrange a complete cash payment.';
