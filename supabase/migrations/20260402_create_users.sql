create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  face_folder_path text not null,
  personalization_profile jsonb not null default '{}'::jsonb,
  ai_config jsonb not null default '{}'::jsonb,
  memory jsonb not null default '{}'::jsonb
);
