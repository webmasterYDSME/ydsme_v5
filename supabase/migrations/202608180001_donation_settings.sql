update public.configs
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'donations',
  jsonb_build_object(
    'generic', jsonb_build_object(
      'enabled', false,
      'title', 'Help keep steam in motion.',
      'description', 'Every gift helps us care for the railway, maintain the grounds and share model engineering with the next generation.',
      'buttonLabel', 'Make a donation'
    ),
    'target', jsonb_build_object(
      'enabled', false,
      'title', 'Help us reach our next milestone.',
      'description', 'Support a focused Society project and watch the campaign move closer to its goal.',
      'buttonLabel', 'Support this project',
      'targetPence', 500000,
      'raisedPence', 0
    )
  )
)
where not (coalesce(settings, '{}'::jsonb) ? 'donations');
