-- Keep the deployed Storage bucket aligned with the application's event and
-- committee image validation (8 MiB; JPEG, PNG, WebP, and AVIF).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images',
  'images',
  true,
  8 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
